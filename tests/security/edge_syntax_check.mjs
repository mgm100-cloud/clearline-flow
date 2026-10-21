// Structural check of the CRM edge functions (2026-10-21).
//
//   node tests/security/edge_syntax_check.mjs
//
// 1. Every supabase/functions/**/*.ts (each index.ts and _shared/guard.ts) goes through typescript's
//    transpileModule; any syntax diagnostic fails. (No Deno on this PC, so this is the deploy-time parse check.)
// 2. Every function folder is in the table below with the guard it must run. A new function that is not in the
//    table fails here, so nothing is added to the project without a caller check.
// 3. Inside serve(...), the handler's first statement is the OPTIONS branch and the very next ones are the
//    guard and its early return - so no createClient / fetch / .from() / body read happens before it.
// 4. Text checks for the rest of the 2026-10-21 hardening (generic errors, filter text, sort allowlists,
//    escaping, recipient cap, redirect allowlist).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const FUNCS = path.join(REPO, 'supabase', 'functions')
const ts = createRequire(path.join(REPO, 'package.json'))('typescript')

const EXPECT = {
  'crm-accounts': 'requireStaff',
  'crm-contacts': 'requireStaff',
  'crm-tasks': 'requireStaff',
  'crm-search': 'requireStaff',
  'crm-send-email': 'requireStaff',
  'crm-send-bulk-email': 'requireStaff',
  'crm-outlook-oauth': 'requireStaff',
  'crm-outlook-sync': 'requireCronSecret',
  'crm-weekly-diligence-report': 'requireCronSecret',
  'crm-resend-webhook': 'verifyResendWebhook',
}

const results = []
function check(name, fn) {
  try {
    fn()
    results.push([true, name])
  } catch (e) {
    results.push([false, name, e])
  }
}

function walk(dir) {
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...walk(p))
    else if (ent.name.endsWith('.ts')) out.push(p)
  }
  return out
}

const read = (p) => fs.readFileSync(p, 'utf8')
const rel = (p) => path.relative(REPO, p).split(path.sep).join('/')
const squash = (s) => s.replace(/\s+/g, '')

// ---------------------------------------------------------------- 1. syntax

const tsFiles = walk(FUNCS)
const guardPath = path.join(FUNCS, '_shared', 'guard.ts')
check('guard.ts exists', () => assert.ok(fs.existsSync(guardPath)))
for (const file of tsFiles) {
  check('syntax: ' + rel(file), () => {
    const r = ts.transpileModule(read(file), {
      fileName: path.basename(file),
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    const diags = (r.diagnostics || []).map((d) => {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n')
      if (!d.file || d.start === undefined) return msg
      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start)
      return `${line + 1}:${character + 1} ${msg}`
    })
    assert.deepEqual(diags, [], 'diagnostics')
  })
}

check('guard.ts imports nothing (Node must be able to load it on its own)', () => {
  const sf = ts.createSourceFile('guard.ts', read(guardPath), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const imports = sf.statements.filter((s) => ts.isImportDeclaration(s) || ts.isImportEqualsDeclaration(s))
  assert.equal(imports.length, 0)
  assert.ok(!/\bimport\s*\(/.test(read(guardPath)), 'dynamic import')
  assert.ok(!/\brequire\s*\(/.test(read(guardPath)), 'require')
})

// guard.ts is the one file with no Deno-only imports, so it can be fully type-checked here (strict, web types).
// 2026-10-21: TypeScript 5.7+ (what current Deno ships) is stricter about what crypto.subtle accepts than the
// repo's own typescript, so set EXTRA_TYPESCRIPT to another typescript package folder to check with that too.
function typeCheck(tsLib, file) {
  const prog = tsLib.createProgram([file], {
    strict: true, noEmit: true, target: tsLib.ScriptTarget.ES2022, module: tsLib.ModuleKind.ESNext,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: [], skipLibCheck: true,
  })
  const same = (p) => path.resolve(p).toLowerCase() === path.resolve(file).toLowerCase()
  return tsLib.getPreEmitDiagnostics(prog).filter((d) => !d.file || same(d.file.fileName)).map((d) => {
    const msg = tsLib.flattenDiagnosticMessageText(d.messageText, ' ')
    if (!d.file || d.start === undefined) return msg
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start)
    return `${line + 1}:${character + 1} ${msg}`
  })
}
const typeCheckers = [ts]
if (process.env.EXTRA_TYPESCRIPT) typeCheckers.push(createRequire(path.join(REPO, 'package.json'))(process.env.EXTRA_TYPESCRIPT))
for (const tsLib of typeCheckers) {
  check(`guard.ts type-checks strictly with typescript ${tsLib.version}`, () => {
    assert.deepEqual(typeCheck(tsLib, guardPath), [], 'type errors')
  })
}

// ---------------------------------------------------------------- 2. every function is listed

const fnDirs = fs.readdirSync(FUNCS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
  .map((d) => d.name)
  .sort()
check('every function folder is in the guard table, and every table entry exists', () => {
  assert.deepEqual(fnDirs, Object.keys(EXPECT).sort())
})

// ---------------------------------------------------------------- 3. guard placement

// Anything that touches data or the outside world. None of it may appear before the guard has returned.
const DATA_WORK = [/\bcreateClient\s*\(/, /\bfetch\s*\(/, /\.from\s*\(/, /\.rpc\s*\(/, /\breq\.json\s*\(/,
  /\breq\.formData\s*\(/, /\breq\.arrayBuffer\s*\(/, /SUPABASE_SERVICE_ROLE_KEY/]

function isAwaitCall(expr, callee, argTexts, sf) {
  if (!expr || !ts.isAwaitExpression(expr)) return false
  const call = expr.expression
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.expression.text !== callee) return false
  return squash(call.arguments.map((a) => a.getText(sf)).join(',')) === squash(argTexts.join(','))
}

function constDecl(stmt, name) {
  if (!stmt || !ts.isVariableStatement(stmt)) return null
  if (!(stmt.declarationList.flags & ts.NodeFlags.Const)) return null
  const decls = stmt.declarationList.declarations
  if (decls.length !== 1 || !ts.isIdentifier(decls[0].name) || decls[0].name.text !== name) return null
  return decls[0]
}

function returnsIdentifier(stmt, name, sf) {
  // `return x` or `{ return x }`
  if (ts.isReturnStatement(stmt)) return !!stmt.expression && stmt.expression.getText(sf) === name
  if (ts.isBlock(stmt) && stmt.statements.length === 1) return returnsIdentifier(stmt.statements[0], name, sf)
  return false
}

for (const fn of Object.keys(EXPECT)) {
  const guard = EXPECT[fn]
  const file = path.join(FUNCS, fn, 'index.ts')
  const src = fs.existsSync(file) ? read(file) : ''
  const sf = ts.createSourceFile('index.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  check(`${fn}: imports ${guard} from '../_shared/guard.ts'`, () => {
    const imp = sf.statements.find((s) => ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === '../_shared/guard.ts')
    assert.ok(imp, 'no import from ../_shared/guard.ts')
    const names = imp.importClause && imp.importClause.namedBindings && ts.isNamedImports(imp.importClause.namedBindings)
      ? imp.importClause.namedBindings.elements.map((e) => e.name.text) : []
    assert.ok(names.includes(guard), 'imports ' + JSON.stringify(names))
  })

  check(`${fn}: no module-level code does data work (only the handler, after its guard)`, () => {
    for (const s of sf.statements) {
      if (ts.isImportDeclaration(s) || ts.isFunctionDeclaration(s) || ts.isInterfaceDeclaration(s) ||
        ts.isTypeAliasDeclaration(s)) continue
      if (ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) &&
        ts.isIdentifier(s.expression.expression) && s.expression.expression.text === 'serve') continue
      const text = s.getText(sf)
      for (const re of DATA_WORK) assert.ok(!re.test(text), 'module-level ' + re + ' in: ' + text.slice(0, 80))
    }
  })

  check(`${fn}: ${guard} runs right after the OPTIONS branch, before any data work`, () => {
    const serves = sf.statements.filter((s) => ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) &&
      ts.isIdentifier(s.expression.expression) && s.expression.expression.text === 'serve')
    assert.equal(serves.length, 1, 'one serve(...) call')
    const handler = serves[0].expression.arguments[0]
    assert.ok(handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)), 'serve(handler)')
    assert.ok(ts.isBlock(handler.body), 'handler has a block body')
    assert.equal(handler.parameters.length, 1)
    assert.equal(handler.parameters[0].name.getText(sf), 'req')
    const st = handler.body.statements

    // [0] if (req.method === 'OPTIONS') { return ... }
    assert.ok(st[0] && ts.isIfStatement(st[0]), 'first statement is an if')
    assert.equal(squash(st[0].expression.getText(sf)), "req.method==='OPTIONS'", 'first statement is the OPTIONS branch')
    assert.ok(!st[0].elseStatement, 'OPTIONS branch has no else')
    const thenTxt = st[0].thenStatement.getText(sf)
    assert.ok(/return\s+new Response\(\s*'ok'/.test(thenTxt), 'OPTIONS still answers ok')

    let i = 1
    let resultName
    if (guard === 'verifyResendWebhook') {
      // [1] const rawBody = await req.text()...   [2] const denied = await verifyResendWebhook(req, rawBody)
      const raw = constDecl(st[i], 'rawBody')
      assert.ok(raw, 'statement after OPTIONS is const rawBody = ...')
      assert.ok(/^await\s+req\.text\(\)/.test(raw.initializer.getText(sf)), 'rawBody comes from await req.text()')
      i++
      const d = constDecl(st[i], 'denied')
      assert.ok(d && isAwaitCall(d.initializer, guard, ['req', 'rawBody'], sf), 'const denied = await verifyResendWebhook(req, rawBody)')
      resultName = 'denied'
      i++
      assert.ok(ts.isIfStatement(st[i]) && squash(st[i].expression.getText(sf)) === 'denied' &&
        returnsIdentifier(st[i].thenStatement, 'denied', sf) && !st[i].elseStatement, 'if (denied) return denied')
    } else if (guard === 'requireCronSecret') {
      const d = constDecl(st[i], 'denied')
      assert.ok(d && isAwaitCall(d.initializer, guard, ['req'], sf), 'const denied = await requireCronSecret(req)')
      resultName = 'denied'
      i++
      assert.ok(ts.isIfStatement(st[i]) && squash(st[i].expression.getText(sf)) === 'denied' &&
        returnsIdentifier(st[i].thenStatement, 'denied', sf) && !st[i].elseStatement, 'if (denied) return denied')
    } else {
      const d = constDecl(st[i], 'auth')
      assert.ok(d && isAwaitCall(d.initializer, guard, ['req'], sf), 'const auth = await requireStaff(req)')
      resultName = 'auth'
      i++
      assert.ok(ts.isIfStatement(st[i]) && squash(st[i].expression.getText(sf)) === 'authinstanceofResponse' &&
        returnsIdentifier(st[i].thenStatement, 'auth', sf) && !st[i].elseStatement, 'if (auth instanceof Response) return auth')
    }

    // Belt and braces, by text: nothing between the start of the handler and the end of the guard's return.
    const before = src.slice(handler.body.getStart(sf), st[i].getEnd())
    for (const re of DATA_WORK) assert.ok(!re.test(before), re + ' appears before the guard')
    assert.ok(resultName)
  })
}

// ---------------------------------------------------------------- 4. the rest of the hardening, by text

const srcOf = (fn) => read(path.join(FUNCS, fn, 'index.ts'))

for (const fn of Object.keys(EXPECT)) {
  check(`${fn}: no raw error text returned to the caller`, () => {
    const s = srcOf(fn)
    assert.ok(!/error:\s*error\.message/.test(s), 'error: error.message')
    assert.ok(!/JSON\.stringify\(\s*\{\s*error:\s*error\b/.test(s), 'JSON.stringify({ error: error')
    assert.ok(!/throw new Error\(`[^`]*\$\{\s*error(Data|Text)\s*\}/.test(s), 'upstream text in a thrown message')
    assert.ok(!/error:\s*errorData/.test(s), 'error: errorData')
    assert.ok(/failure\(error,/.test(s), 'catch-all goes through failure()')
  })
}

for (const fn of ['crm-send-email', 'crm-send-bulk-email', 'crm-outlook-oauth']) {
  check(`${fn}: the old "anybody signed in" check is gone; the user comes from requireStaff`, () => {
    const s = srcOf(fn)
    assert.ok(!/auth\.getUser\(/.test(s), 'auth.getUser still used')
    assert.ok(/const user = auth\.user/.test(s), 'const user = auth.user')
  })
}

check('crm-resend-webhook: raw body is verified, then parsed (no req.json)', () => {
  const s = srcOf('crm-resend-webhook')
  assert.ok(!/req\.json\(/.test(s), 'req.json() still used')
  assert.ok(s.indexOf('verifyResendWebhook(req, rawBody)') < s.indexOf('JSON.parse(rawBody)'), 'parse after verify')
})

check('crm-resend-webhook: a repeated delivery is looked up before the event is inserted', () => {
  const s = srcOf('crm-resend-webhook')
  const lookup = s.indexOf("const { data: seen, error: seenError } = await seenQuery.limit(1)")
  const insert = s.indexOf(".from('email_events').insert(")
  assert.ok(lookup > 0 && insert > 0 && lookup < insert, 'lookup before insert')
  for (const needle of [".eq('email_outbound_id', emailOutboundId)", ".eq('type', eventTypeNormalized)",
    ".eq('occurred_at', createdAt)", ".eq('meta_json->>email_id', eventData.email_id)", "'Ignored - duplicate delivery'"]) {
    assert.ok(s.includes(needle), needle)
  }
})

for (const [fn, re] of [
  ['crm-accounts', /const search = searchTerm\(url\.searchParams\.get\('search'\)/],
  ['crm-contacts', /const search = searchTerm\(url\.searchParams\.get\('search'\)/],
  ['crm-search', /const query = searchTerm\(url\.searchParams\.get\('q'\)/],
]) {
  check(`${fn}: text for .or()/.ilike() filters goes through searchTerm`, () => {
    const s = srcOf(fn)
    assert.ok(re.test(s), 'searchTerm on the user text')
    // every interpolation inside an .or(`...`) filter is the cleaned variable
    for (const m of s.matchAll(/\.or\(`([^`]*)`\)/g)) {
      for (const v of m[1].matchAll(/\$\{([^}]*)\}/g)) {
        assert.ok(['search', 'query'].includes(v[1].trim()), 'raw interpolation in .or(): ' + v[1])
      }
    }
  })
}

for (const fn of ['crm-accounts', 'crm-contacts', 'crm-tasks']) {
  check(`${fn}: sortBy / sortOrder come from allowlists`, () => {
    const s = srcOf(fn)
    assert.ok(/const sortBy = oneOf\(url\.searchParams\.get\('sortBy'\), [A-Z_]+_SORT_COLUMNS,/.test(s), 'sortBy')
    assert.ok(/const sortOrder = oneOf\(url\.searchParams\.get\('sortOrder'\), \['asc', 'desc'\],/.test(s), 'sortOrder')
  })
}

check('crm-tasks: activity_date must be a plain date before it goes into .or()', () => {
  const s = srcOf('crm-tasks')
  const at = s.indexOf('.or(`last_activity.is.null,last_activity.lt.${body.activity_date}`)')
  assert.ok(at > 0, 'the .or() is where it was')
  const guardAt = s.lastIndexOf('ISO_DATE.test(body.activity_date)', at)
  assert.ok(guardAt > 0 && guardAt < at, 'ISO_DATE.test guards it')
})

check('crm-weekly-diligence-report: account fields are HTML-escaped', () => {
  const s = srcOf('crm-weekly-diligence-report')
  for (const needle of ['escapeHtml(account.firm_name)', 'escapeHtml(account.tier)', 'escapeHtml(account.category',
    'escapeHtml(account.tier?.toLowerCase()']) assert.ok(s.includes(needle), needle)
  assert.ok(!/\$\{account\.(firm_name|tier|category)\b/.test(s), 'an unescaped account field')
})

check('crm-send-bulk-email: recipients capped (500 unless CRM_BULK_EMAIL_MAX_RECIPIENTS, never above 5000)', () => {
  const s = srcOf('crm-send-bulk-email')
  assert.ok(/const DEFAULT_MAX_RECIPIENTS = 500\b/.test(s), 'DEFAULT_MAX_RECIPIENTS = 500')
  assert.ok(/const MAX_RECIPIENTS_CEILING = 5000\b/.test(s), 'MAX_RECIPIENTS_CEILING = 5000')
  assert.ok(s.includes("Deno.env.get('CRM_BULK_EMAIL_MAX_RECIPIENTS')"), 'reads CRM_BULK_EMAIL_MAX_RECIPIENTS')
  assert.ok(/Math\.min\(n, MAX_RECIPIENTS_CEILING\)/.test(s), 'override clamped to the ceiling')
  const limitAt = s.indexOf('const MAX_RECIPIENTS = maxRecipients()')
  assert.ok(limitAt > 0 && limitAt < s.indexOf('body.recipientContactIds.length > MAX_RECIPIENTS'), 'limit read before use')
  const cap = s.indexOf('recipients.length > MAX_RECIPIENTS')
  assert.ok(cap > 0, 'cap on the resolved recipients')
  assert.ok(cap < s.indexOf("from('email_outbound')"), 'cap before anything is written or sent')
  assert.ok(s.indexOf('body.recipientContactIds.length > MAX_RECIPIENTS') < s.indexOf(".in('id', body.recipientContactIds)"),
    'cap before the contact lookup')
})

check('crm-outlook-oauth: redirect_uri must be on OUTLOOK_REDIRECT_URIS before the authorize URL is built', () => {
  const s = srcOf('crm-outlook-oauth')
  assert.ok(s.includes("Deno.env.get('OUTLOOK_REDIRECT_URIS')"), 'reads OUTLOOK_REDIRECT_URIS')
  const check1 = s.indexOf('redirectAllowed(redirectUri)')
  const authUrl = s.indexOf("new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')")
  assert.ok(check1 > 0 && check1 < authUrl, 'checked before authUrl')
  const exchange = s.indexOf("fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token'")
  const check2 = s.indexOf('redirectAllowed(redirectUri)', check1 + 1)
  assert.ok(check2 > 0 && check2 < exchange, 'callback checked before the code exchange')
  assert.ok(/allowed\.includes\(uri\)/.test(s), 'exact match, not a prefix')
})

// ---------------------------------------------------------------- report

let failed = 0
for (const [ok, name, err] of results) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name)
  if (!ok) {
    failed++
    console.log('     ' + String((err && err.message) || err).split('\n').slice(0, 6).join('\n     '))
  }
}
console.log(`\n${results.length - failed}/${results.length} passed (${tsFiles.length} .ts files transpiled with typescript ${ts.version})`)
process.exit(failed ? 1 : 0)
