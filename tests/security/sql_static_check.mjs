// Structural checks on the staff-only wall (2026-10-21):
//   database/security-2026-10-21-staff-only.sql       (adds the wall, tests itself, reports)
//   database/security-2026-10-21-staff-only-UNDO.sql  (removes it)
//
// There is no Postgres on this PC, so this does NOT run the SQL. It reads both files with a small SQL lexer
// (strings, quoted identifiers, dollar-quoted bodies, nested comments) and asserts their SHAPE: one
// all-or-nothing transaction, the check is SECURITY DEFINER with an empty search_path, fully qualified and
// ASCII-only, the policy is RESTRICTIVE FOR ALL TO authenticated with USING and WITH CHECK, both self-tests can
// raise, the self-test hands the person over in request.jwt.claims only (like PostgREST v10+), the AFTER test
// stays cheap while every walled table is locked (3s lock wait, 60s per statement), nothing deletes or changes
// data, service_role is never restricted, the report only reads (and lists who gets through, anon write rules,
// unwalled RLS tables and other logins behind the wall).
// It then breaks the files on purpose, in memory (drop RESTRICTIVE, add a DELETE FROM, ...), and requires
// every one of those breakages to be caught - a check that can never fail proves nothing.
//
// Run: node tests/security/sql_static_check.mjs        (exit code 0 = all good, 1 = something failed)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WALL_PATH = path.join(ROOT, 'database', 'security-2026-10-21-staff-only.sql');
const UNDO_PATH = path.join(ROOT, 'database', 'security-2026-10-21-staff-only-UNDO.sql');

const EXPECTED_POLICY =
  'CREATE POLICY clearline_staff_only ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated ' +
  'USING ((select public.is_clearline_staff())) WITH CHECK ((select public.is_clearline_staff()))';
const EXPECTED_WALL_DROP = 'DROP POLICY IF EXISTS clearline_staff_only ON %I.%I';
const EXPECTED_UNDO_DROP = 'DROP POLICY clearline_staff_only ON %I.%I';

// ---------------------------------------------------------------------------------------------------------
// A small SQL lexer: enough of Postgres's rules to tell code from strings, identifiers, bodies and comments.
// ---------------------------------------------------------------------------------------------------------
const IDENT_CHAR = /[A-Za-z0-9_$]/;

function lex(src) {
  const toks = [];
  let code = '';
  const flush = () => { if (code) { toks.push({ t: 'code', raw: code }); code = ''; } };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '-' && d === '-') {
      flush();
      let j = src.indexOf('\n', i);
      if (j < 0) j = src.length;
      toks.push({ t: 'comment', raw: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {            // Postgres block comments nest
      flush();
      let depth = 1;
      let j = i + 2;
      while (j < src.length && depth > 0) {
        if (src[j] === '/' && src[j + 1] === '*') { depth++; j += 2; }
        else if (src[j] === '*' && src[j + 1] === '/') { depth--; j += 2; }
        else j++;
      }
      if (depth > 0) throw new Error('unterminated /* comment at offset ' + i);
      toks.push({ t: 'comment', raw: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "'") {
      const eString = /(^|[^A-Za-z0-9_$])[eE]$/.test(code);
      flush();
      let j = i + 1;
      let value = '';
      for (;;) {
        if (j >= src.length) throw new Error('unterminated string at offset ' + i);
        const ch = src[j];
        if (eString && ch === '\\') { value += src.slice(j, j + 2); j += 2; continue; }
        if (ch === "'") {
          if (src[j + 1] === "'") { value += "'"; j += 2; continue; }
          j++;
          break;
        }
        value += ch;
        j++;
      }
      toks.push({ t: 'string', raw: src.slice(i, j), value });
      i = j;
      continue;
    }
    if (c === '"') {
      flush();
      let j = i + 1;
      let value = '';
      for (;;) {
        if (j >= src.length) throw new Error('unterminated quoted identifier at offset ' + i);
        if (src[j] === '"') {
          if (src[j + 1] === '"') { value += '"'; j += 2; continue; }
          j++;
          break;
        }
        value += src[j];
        j++;
      }
      toks.push({ t: 'qident', raw: src.slice(i, j), value });
      i = j;
      continue;
    }
    if (c === '$' && !(code && IDENT_CHAR.test(code[code.length - 1]))) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(src.slice(i, i + 100));
      if (m) {
        flush();
        const tag = m[0];
        const end = src.indexOf(tag, i + tag.length);
        if (end < 0) throw new Error('unterminated dollar quote ' + tag + ' at offset ' + i);
        toks.push({ t: 'dollar', raw: src.slice(i, end + tag.length), tag, body: src.slice(i + tag.length, end) });
        i = end + tag.length;
        continue;
      }
    }
    code += c;
    i++;
  }
  flush();
  return toks;
}

// Text of tokens: comments become a space; strings/identifiers kept or blanked.
function join(toks, { strings = true } = {}) {
  return toks.map((t) => {
    if (t.t === 'comment') return ' ';
    if (t.t === 'string') return strings ? t.raw : "''";
    if (t.t === 'qident') return strings ? t.raw : '""';
    return t.raw;
  }).join('');
}

// Same, but also inside every dollar-quoted body (function and DO bodies are code with the same comment rules).
function deep(src, { strings = true } = {}) {
  return lex(src).map((t) => {
    if (t.t === 'comment') return ' ';
    if (t.t === 'dollar') return t.tag + deep(t.body, { strings }) + t.tag;
    if (t.t === 'string') return strings ? t.raw : "''";
    if (t.t === 'qident') return strings ? t.raw : '""';
    return t.raw;
  }).join('');
}

// Every string literal's value, including those inside dollar-quoted bodies (that is where dynamic SQL lives).
function deepStrings(src) {
  const out = [];
  for (const t of lex(src)) {
    if (t.t === 'string') out.push(t.value);
    else if (t.t === 'dollar') out.push(...deepStrings(t.body));
  }
  return out;
}

// Every dollar-quoted body, at any depth.
function deepBodies(src) {
  const out = [];
  for (const t of lex(src)) {
    if (t.t === 'dollar') { out.push(t.body); out.push(...deepBodies(t.body)); }
  }
  return out;
}

// Top-level statements, split on semicolons that are real code.
function statements(src) {
  const stmts = [];
  let cur = [];
  for (const t of lex(src)) {
    if (t.t === 'code' && t.raw.includes(';')) {
      const parts = t.raw.split(';');
      parts.forEach((p, k) => {
        if (p) cur.push({ t: 'code', raw: p });
        if (k < parts.length - 1) { stmts.push(cur); cur = []; }
      });
    } else {
      cur.push(t);
    }
  }
  stmts.push(cur);
  return stmts
    .map((toks) => ({ toks, code: join(toks).trim(), body: (toks.find((t) => t.t === 'dollar') || {}).body }))
    .filter((s) => s.code !== '');
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const count = (s, re) => (s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length;
const parensBalanced = (s) => {
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') { depth--; if (depth < 0) return false; }
  }
  return depth === 0;
};

// Statements that change data or widen/narrow roles: none of these may appear anywhere (code OR the dynamic
// SQL inside strings). Comments are stripped first, so the plain-English header may talk about them.
const BANNED = [
  [/\bDROP\s+TABLE\b/i, 'DROP TABLE'],
  [/\bTRUNCATE\b/i, 'TRUNCATE'],
  [/\bDELETE\s+FROM\b/i, 'DELETE FROM'],
  [/\bUPDATE\s+(ONLY\s+)?[\w."]+(\s+(AS\s+)?\w+)?\s+SET\b/i, 'UPDATE ... SET (a data change)'],
  [/\bMERGE\s+INTO\b/i, 'MERGE INTO'],
  [/\bCOPY\s+[\w."]+\s*(\([^)]*\)\s*)?(FROM|TO)\b/i, 'COPY'],
  [/\bALTER\s+(ROLE|USER|GROUP)\b/i, 'ALTER ROLE'],
  [/\bDROP\s+(ROLE|USER|SCHEMA|VIEW|INDEX|TRIGGER|EXTENSION|OWNED)\b/i, 'DROP of a role/schema/view/index/trigger'],
  [/\bCASCADE\b/i, 'CASCADE'],
  [/\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i, 'DISABLE ROW LEVEL SECURITY'],
  [/\bNO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\b/i, 'NO FORCE ROW LEVEL SECURITY'],
  [/\bNOBYPASSRLS\b/i, 'NOBYPASSRLS'],
  [/\bREVOKE\b/i, 'REVOKE'],
  [/\bALTER\s+TABLE\b/i, 'ALTER TABLE'],
  [/\bALTER\s+DEFAULT\s+PRIVILEGES\b/i, 'ALTER DEFAULT PRIVILEGES'],
  [/\bSECURITY\s+LABEL\b/i, 'SECURITY LABEL'],
];

function makeChecker() {
  const failures = [];
  let passed = 0;
  const ok = (cond, msg) => { if (cond) passed++; else failures.push(msg); };
  return { ok, failures, get passed() { return passed; } };
}

// Checks both files share: one transaction, LF endings, nothing banned, service_role untouched, a read-only tail.
function commonChecks(src, stmts, ok, label) {
  ok(!src.includes('\r'), `${label}: LF line endings only (no CR)`);
  ok(!src.startsWith('﻿'), `${label}: no byte-order mark`);

  const heads = stmts.map((s) => s.code.split(/\s+/)[0].toUpperCase());
  const iBegin = heads.indexOf('BEGIN');
  const iCommit = heads.indexOf('COMMIT');
  ok(heads[0] === 'BEGIN', `${label}: the first statement is BEGIN (got ${heads[0]})`);
  ok(count(heads.join(' '), /\bBEGIN\b/) === 1, `${label}: exactly one top-level BEGIN`);
  ok(count(heads.join(' '), /\bCOMMIT\b/) === 1, `${label}: exactly one top-level COMMIT`);
  ok(!heads.some((h) => ['ROLLBACK', 'SAVEPOINT', 'RELEASE', 'END', 'ABORT', 'START', 'PREPARE'].includes(h)),
    `${label}: no other transaction control at top level (END is a synonym for COMMIT)`);
  ok(iBegin >= 0 && iCommit > iBegin, `${label}: COMMIT comes after BEGIN`);
  const tail = stmts.slice(iCommit + 1);
  ok(tail.length >= 1, `${label}: a read-only report follows COMMIT`);
  for (const s of tail) {
    ok(/^(SELECT|WITH)\b/i.test(s.code), `${label}: after COMMIT only SELECT/WITH (got: ${s.code.slice(0, 40)})`);
    const blank = norm(join(s.toks, { strings: false }));
    ok(!/\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|LOCK|SET|RESET|EXECUTE|PERFORM|VACUUM|ANALYZE|REFRESH|NOTIFY|LISTEN|CLUSTER|REINDEX|COMMENT|SECURITY)\b/i.test(blank),
      `${label}: the report after COMMIT contains no writing/DDL keyword`);
    ok(!/\b(set_config|nextval|setval|pg_terminate_backend|pg_cancel_backend|lo_\w+|dblink\w*|pg_read_\w+|pg_write_\w+)\s*\(/i.test(blank),
      `${label}: the report after COMMIT calls no function with side effects`);
    ok(!s.toks.some((t) => t.t === 'dollar'), `${label}: the report has no dollar-quoted body`);
  }

  const code = deep(src);
  for (const [re, name] of BANNED) ok(!re.test(code), `${label}: no ${name} anywhere`);
  for (const m of code.matchAll(/\bINSERT\s+INTO\s+([\w."]+)/gi)) {
    ok(m[1].toLowerCase().startsWith('pg_temp.'), `${label}: INSERT only into temporary scratch tables (found ${m[1]})`);
  }

  // service_role: never named as a role in code (only as a quoted value we READ); never in dynamic DDL.
  const codeOnly = deep(src, { strings: false });
  ok(!/\bservice_role\b/i.test(codeOnly), `${label}: service_role never appears as a role in code (GRANT/REVOKE/POLICY/ALTER)`);
  for (const v of deepStrings(src)) {
    if (/^\s*(CREATE|DROP|ALTER|GRANT|REVOKE|SET|RESET)\b/i.test(v)) {
      ok(!/service_role/i.test(v), `${label}: no dynamic DDL mentions service_role (${v.slice(0, 50)})`);
    }
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|GRANT|REVOKE|SET|COMMENT|TRUNCATE|WITH)\b/i.test(v)) {
      ok(!/\b(ON|FROM|INTO|TABLE)\s+%s\b/i.test(v), `${label}: dynamic SQL quotes table names with %I, never %s (${v.slice(0, 50)})`);
    }
  }

  // Parentheses balance in every statement and every body (strings blanked).
  for (const s of stmts) {
    ok(parensBalanced(join(s.toks.filter((t) => t.t !== 'dollar'), { strings: false })),
      `${label}: balanced parentheses in: ${s.code.slice(0, 50)}`);
  }
  for (const b of deepBodies(src)) {
    ok(parensBalanced(deep(b, { strings: false }).replace(/\$\w*\$[\s\S]*?\$\w*\$/g, '')),
      `${label}: balanced parentheses in a body starting: ${norm(b).slice(0, 50)}`);
  }
  return { iBegin, iCommit, heads };
}

// ---------------------------------------------------------------------------------------------------------
// The wall file
// ---------------------------------------------------------------------------------------------------------
const ACCEPT = ['a@clearlinecap.com', 'first.last@clearlinecap.com', 'x+tag@clearlinecap.com',
  'Mixed.Case@ClearlineCap.COM'];
const REJECT = ['x@evil.clearlinecap.com', 'x@clearlinecap.com.evil.io', 'a@b@clearlinecap.com', '@clearlinecap.com',
  'x@clearlinecap.co', 'x@clearlinecapxcom', 'x@notclearlinecap.com', 'x@clearlinecap.com.', 'xclearlinecap.com',
  'x@clearlinecap.com\n', 'x@clearlinecap-com', 'x@gmail.com', '',
  // 2026-10-21: look-alikes. Postgres lower() maps U+0130 (capital I with a dot) to a plain i under a UTF-8 locale.
  'x@clearlİnecap.com', 'X@CLEARLİNECAP.COM', 'josé@clearlinecap.com', 'x@clearlinecap.cöm'];
const LOOKALIKE = 'x@clearlİnecap.com';

// Models of the two SQL rules, so the tricky cases can be run here.
const asciiOnly = (e) => Buffer.byteLength(e, 'utf8') === e.length;          // octet_length = char_length
const pgLower = (e) => e.toLowerCase().replace(/i̇/g, 'i');              // JS gives i + U+0307; Postgres gives i
const asciiFold = (e) => e.replace(/[A-Z]/g, (ch) => ch.toLowerCase());     // translate(..., 'A..Z', 'a..z')

function checkWall(src) {
  const chk = makeChecker();
  const { ok, failures } = chk;
  let stmts;
  try { stmts = statements(src); } catch (e) { return { failures: ['wall: lexer: ' + e.message], passed: 0 }; }
  const L = 'wall';
  const { iBegin, iCommit } = commonChecks(src, stmts, ok, L);
  const find = (re) => stmts.findIndex((s) => re.test(s.code));
  const findDo = (tag) => stmts.findIndex((s) => new RegExp('^DO\\s+\\$' + tag + '\\$').test(s.code));
  const code = deep(src);

  // Plain-English header (comments before BEGIN) says the things a non-engineer must know.
  const header = norm(src.slice(0, src.search(/^BEGIN;/m)).replace(/^--/gm, ''));
  ok(/Allow new users to sign up/.test(header), `${L}: header says to turn off "Allow new users to sign up"`);
  ok(/email confirmation is off/i.test(header) && /@clearlinecap\.com/.test(header), `${L}: header explains the made-up @clearlinecap.com address risk`);
  ok(/BEFORE YOU RUN IT/.test(header) && /Check that "Confirm email" is ON/.test(header), `${L}: header says to check "Confirm email" is ON before running`);
  ok(/select c\.relname, pg_get_userbyid\(c\.relowner\) from pg_class c .*not pg_has_role\(current_user,c\.relowner,'USAGE'\);/.test(header),
    `${L}: header gives the read-only owner pre-check`);
  ok(/outside desk hours/i.test(header) && /every Flow, CRM Tool and Prism screen waits/i.test(header), `${L}: header says to run outside desk hours, and that every screen waits`);
  ok(!/usually takes a few seconds|the app was busy for a moment/i.test(header), `${L}: header makes no unmeasured timing promise`);
  ok(/security-2026-10-21-staff-only-UNDO\.sql/.test(header), `${L}: header names the UNDO file`);
  ok(/service role/i.test(header) && /BYPASSRLS/.test(header) && /also NOT covered by the wall/i.test(header) && /must check who is calling/i.test(header),
    `${L}: header says service-role functions keep working AND are not covered by the wall`);
  ok(/behind the wall, and keep working for staff/i.test(header), `${L}: header says screens that call as the signed-in person are behind the wall`);
  ok(/CRM Tool/.test(header) && /Prism/.test(header), `${L}: header names the CRM Tool and Prism`);
  ok(/ALL-OR-NOTHING/i.test(header) && /Any error at all means NOTHING was changed/i.test(header), `${L}: header says any error at all means nothing was changed`);
  ok(/TESTS ITSELF/i.test(header), `${L}: header says it tests itself`);
  ok(/can only remove access from accounts that fail the check/i.test(header) && /confirms this on the most recent staff account/i.test(header)
     && !/proves this by counting/i.test(header), `${L}: header's staff promise matches what the test does`);
  ok(/section d that says "Remove it"/.test(header) && /required, not optional/i.test(header), `${L}: header says removing section d accounts is required`);
  ok(/section g/.test(header) && /real colleague/.test(header), `${L}: header says to check every account in section g`);
  ok(/second sign-in step/i.test(header) && /checked by the Flow page, not by the database/i.test(header), `${L}: header lists MFA as not covered`);

  ok(/^SET\s+TRANSACTION\s+ISOLATION\s+LEVEL\s+REPEATABLE\s+READ$/i.test((stmts[iBegin + 1] || {}).code || ''),
    `${L}: REPEATABLE READ is set straight after BEGIN (one snapshot for before/after)`);
  const iLock = find(/^SET\s+LOCAL\s+lock_timeout\s*=\s*'3s'$/i);
  ok(iLock > iBegin, `${L}: lock_timeout is 3s inside the transaction`);
  ok(stmts.filter((s) => /^SET\s+LOCAL\s+lock_timeout\b/i.test(s.code)).length === 1, `${L}: lock_timeout is set once`);

  // --- the check function ---
  const iFn = find(/^CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.is_clearline_staff\s*\(\s*\)/i);
  ok(iFn > iBegin && iFn < iCommit, `${L}: public.is_clearline_staff() is created inside the transaction`);
  ok(count(stmts.map((s) => s.code).join('\n'), /FUNCTION\s+public\.is_clearline_staff\s*\(\s*\)\s*RETURNS/i) === 1,
    `${L}: public.is_clearline_staff() is defined exactly once`);
  let pattern = null;
  if (iFn >= 0) {
    const s = stmts[iFn];
    const head = norm(join(s.toks.filter((t) => t.t !== 'dollar')));
    ok(/\bRETURNS\s+boolean\b/i.test(head), `${L}: function RETURNS boolean`);
    ok(/\bLANGUAGE\s+sql\b/i.test(head), `${L}: function is LANGUAGE sql`);
    ok(/\bSTABLE\b/i.test(head) && !/\bVOLATILE\b|\bIMMUTABLE\b/i.test(head), `${L}: function is STABLE`);
    ok(/\bSECURITY\s+DEFINER\b/i.test(head) && !/\bSECURITY\s+INVOKER\b/i.test(head), `${L}: function is SECURITY DEFINER`);
    ok(/\bSET\s+search_path\s*=\s*''/i.test(head) && count(head, /search_path/i) === 1, `${L}: function has SET search_path = ''`);
    const body = s.body || '';
    const bodyCode = deep(body, { strings: false });
    ok(/^\s*SELECT\s+EXISTS\s*\(/i.test(bodyCode), `${L}: function body is SELECT EXISTS (...)`);
    ok(/\bauth\.uid\(\)/.test(bodyCode), `${L}: function compares against auth.uid()`);
    ok(/\bFROM\s+auth\.users\b/i.test(bodyCode), `${L}: function reads auth.users`);
    ok(/u\.id\s*=\s*auth\.uid\(\)/.test(bodyCode), `${L}: function matches u.id = auth.uid()`);
    ok(/u\.email_confirmed_at\s+IS\s+NOT\s+NULL/i.test(bodyCode), `${L}: function requires a confirmed email`);
    ok(/u\.deleted_at\s+IS\s+NULL/i.test(bodyCode), `${L}: function requires deleted_at IS NULL`);
    ok(/\(\s*u\.banned_until\s+IS\s+NULL\s+OR\s+u\.banned_until\s*<=\s*pg_catalog\.now\(\)\s*\)/i.test(bodyCode),
      `${L}: function requires not currently banned`);
    ok(/pg_catalog\.octet_length\(u\.email\)\s*=\s*pg_catalog\.char_length\(u\.email\)/.test(bodyCode),
      `${L}: function accepts plain ASCII addresses only (look-alike domains)`);
    ok(!/user_profiles|user_metadata|division/i.test(deep(body)), `${L}: function never reads user_profiles / user_metadata / division`);
    for (const m of bodyCode.matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g)) {
      const name = m[1];
      ok(name.includes('.') || ['EXISTS', 'AND', 'OR', 'NOT', 'IN', 'SELECT', 'WHERE', 'ON', 'AS'].includes(name.toUpperCase()),
        `${L}: every function call in the check is schema-qualified (found ${name}())`);
    }
    for (const m of bodyCode.matchAll(/\b(FROM|JOIN)\s+([A-Za-z_][\w.]*)/gi)) {
      ok(m[2].includes('.'), `${L}: every table in the check is schema-qualified (found ${m[2]})`);
    }
    const pm = /pg_catalog\.lower\(u\.email\)\s*~\s*'([^']*)'/.exec(deep(body));
    ok(!!pm, `${L}: function tests pg_catalog.lower(u.email) ~ '<pattern>'`);
    if (pm) pattern = pm[1];
  }

  // The email rule: right for every tricky case, the same pattern everywhere in the file, ASCII-guarded wherever it
  // grants staff status, and the self-test's independent rule (ASCII fold of the suffix + position of the only "@")
  // agrees with it.
  if (pattern) {
    ok(!pattern.includes('\\'), `${L}: email pattern has no backslash (immune to standard_conforming_strings)`);
    const re = new RegExp(pattern);
    const sqlRule = (e) => asciiOnly(e) && re.test(pgLower(e));
    ok(re.test(pgLower(LOOKALIKE)), `${L}: (model check) without the ASCII rule, lower() would let ${JSON.stringify(LOOKALIKE)} through`);
    for (const e of ACCEPT) ok(sqlRule(e), `${L}: email rule accepts ${JSON.stringify(e)}`);
    for (const e of REJECT) ok(!sqlRule(e), `${L}: email rule rejects ${JSON.stringify(e)}`);
    const uses = deepStrings(src).filter((v) => v.startsWith('^[^@]'));
    ok(uses.length >= 6 && uses.every((v) => v === pattern), `${L}: the same email pattern is used everywhere (${uses.length} uses)`);
    const indep = (e) => asciiOnly(e) && asciiFold(e.slice(-17)) === '@clearlinecap.com' && e.indexOf('@') + 1 === e.length - 16 && e.length > 17;
    for (const e of [...ACCEPT, ...REJECT]) ok(indep(e) === sqlRule(e), `${L}: independent rule agrees with the check on ${JSON.stringify(e)}`);
  }
  // Every POSITIVE use of the pattern (a "this is staff" decision) is directly preceded by the ASCII rule.
  const posRe = /lower\(u\.email\)\s*~\s*'\^\[\^@\]\+@clearlinecap\[\.\]com\$'/g;
  let positives = 0;
  for (const m of code.matchAll(posRe)) {
    positives++;
    const before = code.slice(Math.max(0, m.index - 140), m.index);
    ok(/octet_length\(u\.email\)\s*=\s*(pg_catalog\.)?char_length\(u\.email\)\s+AND\s+(pg_catalog\.)?$/.test(before),
      `${L}: staff-pattern use #${positives} is guarded by the ASCII rule`);
  }
  ok(positives >= 6, `${L}: the staff pattern is used (and guarded) in the check, BEFORE and the report (${positives})`);
  const indepSql = /octet_length\(u\.email\)\s*=\s*length\(u\.email\)\s+AND\s+translate\(right\(u\.email,\s*17\),\s*'ABCDEFGHIJKLMNOPQRSTUVWXYZ',\s*'abcdefghijklmnopqrstuvwxyz'\)\s*=\s*'@clearlinecap\.com'\s+AND\s+strpos\(u\.email,\s*'@'\)\s*=\s*length\(u\.email\)\s*-\s*16\s+AND\s+length\(u\.email\)\s*>\s*17/i;
  ok(indepSql.test(code), `${L}: the self-test cross-checks the function against an independent rule`);

  ok(find(/^GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.is_clearline_staff\(\)\s+TO\s+authenticated\s*,\s*anon$/i) > iFn,
    `${L}: GRANT EXECUTE on the check TO authenticated, anon`);
  ok(count(stmts.map((s) => s.code.split(/\s+/)[0]).join(' '), /\bGRANT\b/i) === 1, `${L}: no other GRANT`);
  ok(find(/^COMMENT\s+ON\s+FUNCTION\s+public\.is_clearline_staff\(\)\s+IS\s+'/i) > iFn, `${L}: COMMENT ON FUNCTION explains the check`);

  // Every stop the script raises says nothing was changed.
  const raises = [...code.matchAll(/RAISE\s+EXCEPTION\s+'([^']*)/g)].map((m) => m[1]);
  ok(raises.length >= 15 && raises.every((m) => m.startsWith('STOPPED, nothing was changed: ')),
    `${L}: every RAISE EXCEPTION starts with "STOPPED, nothing was changed:" (${raises.length})`);

  // The self-test hands the person over the way PostgREST v10+ does: request.jwt.claims only. The old one-setting-
  // per-claim names may only ever be blanked, never filled in.
  const claimSets = [...code.matchAll(/set_config\('request\.jwt\.claim\.(\w+)',\s*([^,]+),/g)];
  ok(claimSets.length >= 4, `${L}: the old request.jwt.claim.* settings are blanked explicitly (${claimSets.length})`);
  for (const m of claimSets) ok(m[2].trim() === "''", `${L}: request.jwt.claim.${m[1]} is only ever set to '' (found ${m[2].trim()})`);

  // --- scratch tables and the impersonation helper ---
  for (const t of ['clearline_wall_people', 'clearline_wall_counts']) {
    ok(find(new RegExp('^CREATE\\s+TEMP\\s+TABLE\\s+' + t + '\\s*\\([\\s\\S]*\\)\\s*ON\\s+COMMIT\\s+DROP$', 'i')) > iBegin,
      `${L}: ${t} is a TEMP table that drops itself at COMMIT`);
  }
  const iHelper = find(/^CREATE\s+OR\s+REPLACE\s+FUNCTION\s+pg_temp\.clearline_wall_probe\s*\(/i);
  ok(iHelper > iBegin, `${L}: the impersonation helper is a temporary (pg_temp) function`);
  if (iHelper >= 0) {
    const s = stmts[iHelper];
    const head = join(s.toks.filter((t) => t.t !== 'dollar'));
    ok(!/SECURITY\s+DEFINER/i.test(head), `${L}: the helper is NOT security definer (SET ROLE is forbidden there)`);
    ok(/LANGUAGE\s+plpgsql/i.test(head), `${L}: the helper is plpgsql`);
    const b = deep(s.body || '');
    ok(/WHEN\s+'count'\s+THEN\s+format\('SELECT count\(\*\) FROM %I\.%I',\s*p_schema,\s*p_table\)/.test(b), `${L}: helper question 'count' = count(*) of the table`);
    ok(/WHEN\s+'any'\s+THEN\s+format\('SELECT count\(\*\) FROM \(SELECT 1 FROM %I\.%I LIMIT 1\) AS first_row',\s*p_schema,\s*p_table\)/.test(b),
      `${L}: helper question 'any' reads at most one row`);
    ok(/WHEN\s+'check'\s+THEN\s+'SELECT CASE WHEN \(SELECT public\.is_clearline_staff\(\)\) THEN 1 ELSE 0 END'/.test(b), `${L}: helper question 'check' asks the staff check itself`);
    ok(/IF\s+v_sql\s+IS\s+NULL\s+THEN\s+RAISE\s+EXCEPTION/.test(b), `${L}: the helper refuses any other question`);
    const iClaims = b.search(/set_config\('request\.jwt\.claims',\s*p_claims::text,\s*true\)/);
    const iBlank = b.search(/set_config\('request\.jwt\.claim\.sub',\s*'',\s*true\)/);
    const iSet = b.search(/EXECUTE\s+format\('SET LOCAL ROLE %I',\s*p_role\)/);
    const iRun = b.search(/EXECUTE\s+v_sql\s+INTO\s+v_rows/);
    const iBusy = b.search(/WHEN\s+lock_not_available\s+OR\s+deadlock_detected\s+THEN\s+RAISE;/);
    const iCatch = b.search(/WHEN\s+insufficient_privilege\s+THEN/);
    const iOthers = b.search(/WHEN\s+OTHERS\s+THEN/);
    const iReset = b.search(/EXECUTE\s+'RESET ROLE'/);
    const iClear = b.search(/set_config\('request\.jwt\.claims',\s*'',\s*true\)/);
    ok(/p_role\s+NOT\s+IN\s+\('authenticated',\s*'anon'\)/.test(b), `${L}: the helper only plays authenticated or anon`);
    ok(iClaims >= 0 && iBlank > iClaims && iSet > iBlank, `${L}: the helper sets request.jwt.claims and blanks claim.sub before switching role`);
    ok(/set_config\('request\.jwt\.claim\.role',\s*'',\s*true\)/.test(b) && /set_config\('request\.jwt\.claim\.email',\s*'',\s*true\)/.test(b),
      `${L}: the helper blanks claim.role and claim.email too`);
    ok(iSet >= 0 && iRun > iSet && iCatch > iRun && iReset > iCatch && iClear > iReset,
      `${L}: helper order is switch role -> ask inside an EXCEPTION block -> RESET ROLE -> clear claims`);
    ok(iBusy > iRun && iBusy < iCatch && iOthers > iCatch, `${L}: a lock timeout or deadlock is re-raised, never recorded as "read failed"`);
    ok(/current_user\s+IS\s+DISTINCT\s+FROM\s+v_admin\s+OR\s+auth\.uid\(\)\s+IS\s+NOT\s+NULL/.test(b) && /RAISE\s+EXCEPTION/.test(b),
      `${L}: the helper refuses to carry on as the test person`);
    ok(!/INSERT\s+INTO/i.test(b), `${L}: the helper never writes while impersonating`);
  }

  // --- order of the blocks ---
  const iGuard = findDo('guard');
  const iBefore = findDo('before');
  const iWall = findDo('wall');
  const iAfter = findDo('after');
  const iStmt5 = find(/^SET\s+LOCAL\s+statement_timeout\s*=\s*'5min'$/i);
  const iStmt60 = find(/^SET\s+LOCAL\s+statement_timeout\s*=\s*'60s'$/i);
  ok(iGuard > iBegin && iGuard < iFn, `${L}: the guard block runs first`);
  ok(iBefore > iFn && iBefore > iHelper, `${L}: self-test BEFORE runs after the check and helper exist`);
  ok(iWall > iBefore, `${L}: the wall is added after the BEFORE self-test`);
  ok(iAfter > iWall && iAfter < iCommit, `${L}: self-test AFTER runs after the wall and before COMMIT`);
  ok(iStmt5 > iBegin && iStmt5 < iGuard, `${L}: a statement_timeout (5min) bounds the BEFORE phase`);
  ok(iStmt60 > iBefore && iStmt60 < iWall, `${L}: statement_timeout drops to 60s just before the wall (the locked window)`);

  // --- guard ---
  if (iGuard >= 0) {
    const g = deep(stmts[iGuard].body || '');
    ok(/rolname\s*=\s*'service_role'\s+AND\s+rolbypassrls/.test(g) && /RAISE\s+EXCEPTION/.test(g),
      `${L}: guard stops unless service_role has BYPASSRLS (it is only read, never changed)`);
    ok(/pg_has_role\(current_user,\s*c\.relowner,\s*'USAGE'\)/.test(g), `${L}: guard checks the editor can manage every RLS table`);
    ok(/current_setting\('server_version_num'\)::integer\s*>=\s*160000\s+THEN[\s\S]*pg_has_role\(current_user,\s*'authenticated',\s*'SET'\)[\s\S]*ELSE[\s\S]*pg_has_role\(current_user,\s*'authenticated',\s*'MEMBER'\)/.test(g),
      `${L}: guard asks for the SET option on Postgres 16+, membership before that`);
    ok(/has_table_privilege\(current_user,\s*'auth\.users',\s*'SELECT'\)/.test(g) && /has_table_privilege\(current_user,\s*'auth\.identities',\s*'SELECT'\)/.test(g),
      `${L}: guard checks auth.users and auth.identities are readable before anything changes`);
    ok(/set_config\('request\.jwt\.claims',\s*pg_catalog\.jsonb_build_object\('sub',\s*v_probe/.test(g) && /auth\.uid\(\)\s+IS\s+DISTINCT\s+FROM\s+v_probe\s+THEN\s+RAISE\s+EXCEPTION/.test(g),
      `${L}: guard proves auth.uid() reads request.jwt.claims (claims only), else stops`);
    ok(/c\.relforcerowsecurity/.test(g) && /pg_has_role\(c\.relowner,\s*'authenticated',\s*'USAGE'\)/.test(g),
      `${L}: guard stops on a table that would put its own owner behind the wall`);
    ok(count(g, /RAISE\s+EXCEPTION/) >= 8, `${L}: the guard can stop the run in several ways`);
  }

  // --- self-test BEFORE ---
  if (iBefore >= 0) {
    const b = deep(stmts[iBefore].body || '');
    ok(/IF\s+NOT\s+FOUND\s+THEN\s+RAISE\s+EXCEPTION\s+'STOPPED, nothing was changed: no confirmed @clearlinecap\.com user found - stop'/.test(b),
      `${L}: BEFORE raises right after the staff lookup when no staff account exists`);
    ok(/ORDER\s+BY\s+u\.last_sign_in_at\s+DESC\s+NULLS\s+LAST/.test(b), `${L}: BEFORE picks the most recently signed-in staff account`);
    ok(/gen_random_uuid\(\)/.test(b) && /EXIT\s+WHEN\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+auth\.users/.test(b),
      `${L}: BEFORE's outsider is a random id that is not in auth.users`);
    ok(/'outsider@example\.invalid'/.test(b), `${L}: BEFORE's outsider uses outsider@example.invalid`);
    ok(/n\.nspname\s*=\s*'public'/.test(b) && /c\.relkind\s+IN\s+\('r',\s*'p'\)/.test(b) && /c\.relrowsecurity/.test(b),
      `${L}: BEFORE counts every RLS table in public`);
    ok(/v_rows\s*:=\s*pg_temp\.clearline_wall_probe\([^;]*'count'\)/.test(b), `${L}: BEFORE gets each count back in a variable`);
    ok(/'before',\s*v_rows\)/.test(b), `${L}: BEFORE writes its counts as phase 'before'`);
    ok(/v_got\s+IS\s+DISTINCT\s+FROM\s+v_user\.expected/.test(b), `${L}: BEFORE cross-checks the function on every account`);
    const cross = (b.match(/FOR\s+v_user\s+IN([\s\S]*?)\bLOOP\b/) || [])[1] || '';
    ok(cross !== '' && !/lower\(/i.test(cross), `${L}: the cross-check rule folds case without lower()`);
    ok(count(b, /RAISE\s+EXCEPTION/) >= 4, `${L}: BEFORE can stop the run in several ways`);
  }

  // --- the wall ---
  const strings = deepStrings(src);
  const policyStrings = strings.filter((v) => /CREATE\s+POLICY/i.test(v));
  ok(policyStrings.length === 1, `${L}: exactly one CREATE POLICY template (found ${policyStrings.length})`);
  ok(policyStrings.length === 1 && norm(policyStrings[0]) === EXPECTED_POLICY,
    `${L}: the policy is exactly RESTRICTIVE FOR ALL TO authenticated USING (...) WITH CHECK (...)`);
  ok(!stmts.some((s) => /^CREATE\s+POLICY\b/i.test(s.code)), `${L}: no hand-written policy outside the loop`);
  const dropStrings = strings.filter((v) => /DROP\s+POLICY/i.test(v));
  ok(dropStrings.length === 1 && norm(dropStrings[0]) === EXPECTED_WALL_DROP, `${L}: the only DROP POLICY is IF EXISTS clearline_staff_only`);
  ok(!/\bDROP\s+FUNCTION\b/i.test(code), `${L}: the wall file drops no function`);
  if (iWall >= 0) {
    const w = deep(stmts[iWall].body || '');
    ok(/n\.nspname\s*=\s*'public'/.test(w) && /c\.relkind\s+IN\s+\('r',\s*'p'\)/.test(w) && /c\.relrowsecurity/.test(w),
      `${L}: the wall goes on every RLS table in public`);
    ok(w.indexOf('DROP POLICY IF EXISTS') >= 0 && w.indexOf('DROP POLICY IF EXISTS') < w.indexOf('CREATE POLICY'),
      `${L}: the wall drops its old copy before creating the new one (safe to run twice)`);
    ok(count(w, /EXECUTE\s+format\(/) === 2, `${L}: the wall runs exactly two statements per table`);
  }

  // --- self-test AFTER (cheap: every walled table is locked until COMMIT) ---
  if (iAfter >= 0) {
    const a = deep(stmts[iAfter].body || '');
    ok(/p\.permissive\s*=\s*'RESTRICTIVE'/.test(a) && /p\.cmd\s*=\s*'ALL'/.test(a) && /p\.roles\s*=\s*ARRAY\['authenticated'\]::name\[\]/.test(a),
      `${L}: AFTER re-reads pg_policies and insists on the exact policy shape`);
    ok(/v_rows\s*:=\s*pg_temp\.clearline_wall_probe\(NULL,\s*NULL,\s*v_staff\.db_role,\s*v_staff\.claims,\s*'check'\);\s*IF\s+v_rows\s+IS\s+DISTINCT\s+FROM\s+1\s+THEN\s+RAISE\s+EXCEPTION/.test(a),
      `${L}: AFTER asks the staff check as the staff person, through the API role, and stops unless it says yes`);
    ok(/k\.persona\s+IN\s+\('outsider',\s*'non_staff_account',\s*'staff'\)/.test(a), `${L}: AFTER asks outsider, non-staff and staff only (no signed-out recount)`);
    ok(/v_rows\s*:=\s*pg_temp\.clearline_wall_probe\(v_row\.table_schema,\s*v_row\.table_rel,\s*v_row\.db_role,\s*v_row\.claims,\s*'any'\)/.test(a)
       && /'after',\s*v_rows\)/.test(a), `${L}: AFTER reads at most one row per table and person`);
    ok(!/clearline_wall_probe\([^;]*'count'\)/.test(a) && !/count\(\*\)\s+FROM\s+%I/.test(a), `${L}: AFTER never counts a whole table`);
    ok(/RAISE\s+EXCEPTION\s+'[^']*outsider could still see rows/.test(a), `${L}: AFTER raises when an outsider still sees rows`);
    ok(/a\.persona\s+IN\s+\('outsider',\s*'non_staff_account'\)\s+AND\s+a\.visible_rows\s*>\s*0/.test(a),
      `${L}: AFTER's outsider test is "any row at all"`);
    ok(/RAISE\s+EXCEPTION\s+'[^']*changed what the staff account can see/.test(a), `${L}: AFTER raises when staff access changes`);
    ok(/b\.persona\s*=\s*'staff'\s+AND\s+\(a\.table_name\s+IS\s+NULL\s+OR\s+a\.visible_rows\s+IS\s+DISTINCT\s+FROM\s+LEAST\(b\.visible_rows,\s*1\)\)/.test(a),
      `${L}: AFTER's staff test is "rows where it had rows, none where none, refused where refused", table by table`);
    ok(/RAISE\s+NOTICE\s+'WAS EXPOSED/.test(a), `${L}: AFTER names each table that was exposed`);
    ok(/set_config\('clearline\.wall_report',[\s\S]*false\)/.test(a), `${L}: AFTER keeps the results for the report (session setting)`);
  }

  // --- report ---
  const report = stmts.slice(iCommit + 1).map((s) => s.code).join('\n');
  // One CTE's text (up to its closing line), and whether it feeds a UNION ALL arm of the final SELECT.
  const cte = (name) => {
    const i0 = report.search(new RegExp('\\b' + name + '\\s+AS\\s*\\('));
    if (i0 < 0) return '';
    const rest = report.slice(i0);
    const end = rest.search(/\n\),?\n/);
    return end < 0 ? '' : rest.slice(0, end);
  };
  const feeds = (name, alias) => new RegExp('FROM\\s+' + name + '\\s+' + alias + '\\s+UNION\\s+ALL\\b').test(report);
  ok(/NOT\s+c\.relrowsecurity/.test(report) && /has_table_privilege\('anon',\s*c\.oid,\s*'SELECT,INSERT,UPDATE,DELETE'\)/.test(report)
     && /has_table_privilege\('authenticated',\s*c\.oid,\s*'SELECT,INSERT,UPDATE,DELETE'\)/.test(report),
    `${L}: report a lists RLS-off tables the API roles can use`);
  ok(/c\.relkind\s+IN\s+\('v',\s*'m'\)/.test(report) && /security_invoker/.test(report), `${L}: report b lists views/matviews with security_invoker`);
  ok(/p\.prosecdef/.test(report) && /has_function_privilege\('anon'/.test(report) && /pg_get_function_identity_arguments/.test(report),
    `${L}: report c lists SECURITY DEFINER functions with their arguments`);
  ok(/d_not_staff[\s\S]*auth\.identities/.test(report) && /last_sign_in_at/.test(report) && /email_confirmed_at/.test(report),
    `${L}: report d lists non-staff accounts with sign-in providers`);
  ok(/'Not a @clearlinecap\.com address\. Remove it \(Authentication -> Users\)\.'/.test(report) && !/unless you know who it is/i.test(report),
    `${L}: report d says plainly "Remove it"`);
  ok(/e_unconfirmed_clearline[\s\S]*email_confirmed_at\s+IS\s+NULL/.test(report), `${L}: report e lists unconfirmed Clearline addresses`);
  ok(/EXTRACT\(EPOCH\s+FROM\s+\(u\.email_confirmed_at\s*-\s*u\.created_at\)\)/.test(cte('g_gets_through')) && /auth\.identities/.test(cte('g_gets_through'))
     && feeds('g_gets_through', 'g') && /real colleague/.test(report),
    `${L}: report g lists every account that gets through, with seconds-to-confirm and provider`);
  const h = cte('h_anon_write_rules');
  ok(/pg_policies/.test(h) && /'anon'\s*=\s*ANY\s*\(p\.roles\)\s+OR\s+'public'\s*=\s*ANY\s*\(p\.roles\)/.test(h)
     && /p\.cmd\s+IN\s+\('INSERT',\s*'UPDATE',\s*'DELETE',\s*'ALL'\)/.test(h) && /p\.qual/.test(h) && /p\.with_check/.test(h)
     && /has_table_privilege\('anon',\s*c\.oid,\s*'INSERT'\)/.test(h) && feeds('h_anon_write_rules', 'h'),
    `${L}: report h lists rules (TO anon or PUBLIC) that may let a signed-out visitor write, with anon's rights and the rule text`);
  ok(/c\.relrowsecurity[\s\S]*NOT\s+EXISTS[\s\S]*policyname\s*=\s*'clearline_staff_only'/.test(cte('i_rls_without_wall'))
     && feeds('i_rls_without_wall', 'i'), `${L}: report i re-checks, after COMMIT, that every RLS table has the wall`);
  ok(/rolcanlogin[\s\S]*NOT\s+r\.rolbypassrls[\s\S]*rolname\s*<>\s*'authenticator'[\s\S]*pg_has_role\(r\.oid,\s*'authenticated',\s*'USAGE'\)/.test(cte('j_other_logins'))
     && feeds('j_other_logins', 'j'), `${L}: report j lists other logins behind the wall (not authenticator)`);
  ok(count(report, /'\(none found\)'/) >= 7, `${L}: empty report sections say "(none found)"`);

  return { failures, passed: chk.passed };
}

// ---------------------------------------------------------------------------------------------------------
// The UNDO file
// ---------------------------------------------------------------------------------------------------------
function checkUndo(src) {
  const chk = makeChecker();
  const { ok, failures } = chk;
  let stmts;
  try { stmts = statements(src); } catch (e) { return { failures: ['undo: lexer: ' + e.message], passed: 0 }; }
  const L = 'undo';
  const { iBegin, iCommit } = commonChecks(src, stmts, ok, L);
  const find = (re) => stmts.findIndex((s) => re.test(s.code));
  const code = deep(src);

  const header = norm(src.slice(0, src.search(/^BEGIN;/m)).replace(/^--/gm, ''));
  ok(/ALL-OR-NOTHING/i.test(header) && /Any error at all means nothing was changed/i.test(header), `${L}: header says any error at all means nothing was changed`);
  ok(/security-2026-10-21-staff-only\.sql/.test(header), `${L}: header names the file it undoes`);
  ok(/outside desk hours/i.test(header), `${L}: header says to run it outside desk hours`);

  const iUndo = stmts.findIndex((s) => /^DO\s+\$undo\$/.test(s.code));
  ok(find(/^SET\s+LOCAL\s+lock_timeout\s*=\s*'3s'$/i) > iBegin && find(/^SET\s+LOCAL\s+lock_timeout\s*=\s*'3s'$/i) < iUndo, `${L}: lock_timeout is 3s`);
  ok(find(/^SET\s+LOCAL\s+statement_timeout\s*=\s*'60s'$/i) > iBegin && find(/^SET\s+LOCAL\s+statement_timeout\s*=\s*'60s'$/i) < iUndo, `${L}: statement_timeout is 60s`);

  const strings = deepStrings(src);
  const drops = strings.filter((v) => /DROP\s+POLICY/i.test(v));
  ok(drops.length === 1 && norm(drops[0]) === EXPECTED_UNDO_DROP, `${L}: the only policy it drops is clearline_staff_only`);
  ok(!strings.some((v) => /CREATE\s+POLICY/i.test(v)) && !stmts.some((s) => /^CREATE\b/i.test(s.code)), `${L}: creates nothing`);

  const iDropFn = find(/^DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.is_clearline_staff\(\)$/i);
  const iCheck = stmts.findIndex((s) => /^DO\s+\$undo_check\$/.test(s.code));
  ok(iUndo > iBegin, `${L}: the policy removal runs inside the transaction`);
  ok(iDropFn > iUndo && iDropFn < iCommit, `${L}: the function is dropped after the policies, inside the transaction, without CASCADE`);
  ok(iCheck > iDropFn && iCheck < iCommit, `${L}: a final check runs before COMMIT`);
  ok(count(code, /\bDROP\s+FUNCTION\b/i) === 1, `${L}: drops exactly one function`);
  const raises = [...code.matchAll(/RAISE\s+EXCEPTION\s+'([^']*)/g)].map((m) => m[1]);
  ok(raises.length >= 5 && raises.every((m) => m.startsWith('STOPPED, nothing was changed: ')),
    `${L}: every RAISE EXCEPTION starts with "STOPPED, nothing was changed:" (${raises.length})`);
  if (iUndo >= 0) {
    const b = deep(stmts[iUndo].body || '');
    ok(/p\.schemaname\s*=\s*'public'\s+AND\s+p\.policyname\s*=\s*'clearline_staff_only'/.test(b), `${L}: removes the wall from public tables only`);
    ok(/p\.schemaname\s*<>\s*'public'/.test(b) && /RAISE\s+EXCEPTION/.test(b), `${L}: stops plainly if the wall is also elsewhere`);
    const iLoop = b.search(/DROP POLICY clearline_staff_only/);
    const iDeps = b.search(/FROM\s+pg_catalog\.pg_depend\s+d/);
    ok(iDeps > iLoop && /d\.refobjid\s*=\s*v_check/.test(b) && /IF\s+v_users\s+IS\s+NOT\s+NULL\s+THEN\s+RAISE\s+EXCEPTION\s+'STOPPED, nothing was changed: something else still uses the check/.test(b),
      `${L}: after removing the wall, stops plainly if anything else still uses the check`);
  }
  if (iCheck >= 0) {
    const c = deep(stmts[iCheck].body || '');
    ok(count(c, /RAISE\s+EXCEPTION/) === 2, `${L}: the final check raises if a policy or the function is left`);
  }
  return { failures, passed: chk.passed };
}

// ---------------------------------------------------------------------------------------------------------
// Break the files on purpose; every breakage must be caught.
// ---------------------------------------------------------------------------------------------------------
function mutate(src, from, to, { all = false, thenAppendBefore = null } = {}) {
  if (!src.includes(from)) return null;
  // A replacer function, so "$'" and "$&" in the new text are inserted literally (SQL is full of "$").
  let out = all ? src.split(from).join(to) : src.replace(from, () => to);
  if (thenAppendBefore) {
    const [marker, text] = thenAppendBefore;
    if (!out.includes(marker)) return null;
    out = out.replace(marker, () => text + marker);
  }
  return out;
}

const WALL_MUTATIONS = [
  ['policy loses RESTRICTIVE (becomes permissive = widens access)', 'AS RESTRICTIVE ', ''],
  ['policy only covers SELECT', 'AS RESTRICTIVE FOR ALL TO', 'AS RESTRICTIVE FOR SELECT TO'],
  ['policy also targets service_role', 'TO authenticated USING', 'TO authenticated, service_role USING'],
  ['policy loses WITH CHECK', ' WITH CHECK ((select public.is_clearline_staff()))', ''],
  ['policy calls the check per row', 'USING ((select public.is_clearline_staff()))', 'USING (public.is_clearline_staff())'],
  ['check becomes SECURITY INVOKER', 'SECURITY DEFINER\nSET search_path', 'SECURITY INVOKER\nSET search_path'],
  ['check search_path becomes public', "SET search_path = ''", 'SET search_path = public'],
  ['check uses an unqualified function', 'pg_catalog.lower(u.email)', 'lower(u.email)'],
  ['check reads an unqualified table', 'FROM auth.users AS u\n    WHERE u.id = auth.uid()', 'FROM users AS u\n    WHERE u.id = auth.uid()'],
  ['check forgets the confirmed email', '      AND u.email_confirmed_at IS NOT NULL\n      AND u.deleted_at IS NULL\n      AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now())',
    '      AND u.deleted_at IS NULL\n      AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now())'],
  ['check loses the plain-ASCII rule (look-alike domains pass)', '      AND pg_catalog.octet_length(u.email) = pg_catalog.char_length(u.email)\n', ''],
  ['check matches only the suffix (lets a@b@clearlinecap.com in)', "pg_catalog.lower(u.email) ~ '^[^@]+@clearlinecap[.]com$'", "pg_catalog.lower(u.email) ~ '@clearlinecap[.]com$'"],
  ['check pattern uses a backslash dot', "pg_catalog.lower(u.email) ~ '^[^@]+@clearlinecap[.]com$'", "pg_catalog.lower(u.email) ~ '^[^@]+@clearlinecap\\.com$'"],
  ['check trusts the division', 'WHERE u.id = auth.uid()', "WHERE u.id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.division = 'Super')"],
  ['report g loses the plain-ASCII rule', "    AND octet_length(u.email) = char_length(u.email)\n    AND lower(u.email) ~ '^[^@]+@clearlinecap[.]com$'\n),\nh_anon_write_rules",
    "    AND lower(u.email) ~ '^[^@]+@clearlinecap[.]com$'\n),\nh_anon_write_rules"],
  ['cross-check folds case with lower() again', "translate(right(u.email, 17), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = '@clearlinecap.com'", "lower(u.email) LIKE '%@clearlinecap.com'"],
  ['helper fills in the old claim.sub (test passes where real traffic fails)',
    "  PERFORM set_config('request.jwt.claim.sub', '', true);\n  PERFORM set_config('request.jwt.claim.role', '', true);\n  PERFORM set_config('request.jwt.claim.email', '', true);\n  EXECUTE format('SET LOCAL ROLE %I', p_role);",
    "  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_claims ->> 'sub', ''), true);\n  PERFORM set_config('request.jwt.claim.role', '', true);\n  PERFORM set_config('request.jwt.claim.email', '', true);\n  EXECUTE format('SET LOCAL ROLE %I', p_role);"],
  ['helper no longer blanks the old claim.sub',
    "  PERFORM set_config('request.jwt.claim.sub', '', true);\n  PERFORM set_config('request.jwt.claim.role', '', true);\n  PERFORM set_config('request.jwt.claim.email', '', true);\n  EXECUTE format('SET LOCAL ROLE %I', p_role);",
    "  PERFORM set_config('request.jwt.claim.role', '', true);\n  PERFORM set_config('request.jwt.claim.email', '', true);\n  EXECUTE format('SET LOCAL ROLE %I', p_role);"],
  ['cross-check fills in the old claim.role', "PERFORM set_config('request.jwt.claim.role', '', true);\n  PERFORM set_config('request.jwt.claim.email', '', true);\n  FOR v_user IN",
    "PERFORM set_config('request.jwt.claim.role', 'authenticated', true);\n  PERFORM set_config('request.jwt.claim.email', '', true);\n  FOR v_user IN"],
  ['helper swallows lock timeouts as "read failed"', '    WHEN lock_not_available OR deadlock_detected THEN\n      RAISE;\n', ''],
  ['helper accepts any question', "  IF v_sql IS NULL THEN\n    RAISE EXCEPTION 'STOPPED, nothing was changed: the self-test was asked an unknown question (%)', p_question;\n  END IF;\n", ''],
  ['no COMMIT', '\nCOMMIT;\n', '\n'],
  ['no BEGIN', '\nBEGIN;\n', '\n'],
  ['an early COMMIT', 'DO $wall$', 'COMMIT;\nDO $wall$'],
  ['data is removed', '\nCOMMIT;\n', '\nDELETE FROM public.todos;\nCOMMIT;\n'],
  ['data is changed', '\nCOMMIT;\n', '\nUPDATE public.tickers SET status = 1;\nCOMMIT;\n'],
  ['a table is dropped', '\nCOMMIT;\n', '\nDROP TABLE IF EXISTS pg_temp.clearline_wall_counts;\nCOMMIT;\n'],
  ['a table is emptied', '\nCOMMIT;\n', '\nTRUNCATE public.todos;\nCOMMIT;\n'],
  ['dynamic data change', "EXECUTE format('DROP POLICY IF EXISTS", "EXECUTE format('DELETE FROM %I.%I', v_tab.table_schema, v_tab.table_rel);\n    EXECUTE format('DROP POLICY IF EXISTS"],
  ['service_role is restricted', '\nCOMMIT;\n', '\nALTER ROLE service_role NOBYPASSRLS;\nCOMMIT;\n'],
  ['service_role loses a grant', '\nCOMMIT;\n', '\nREVOKE ALL ON public.todos FROM service_role;\nCOMMIT;\n'],
  ['RLS is switched off somewhere', '\nCOMMIT;\n', '\nALTER TABLE public.todos DISABLE ROW LEVEL SECURITY;\nCOMMIT;\n'],
  ['lock_timeout back to 15s', "SET LOCAL lock_timeout = '3s';", "SET LOCAL lock_timeout = '15s';"],
  ['no statement_timeout around the locked window', "SET LOCAL statement_timeout = '60s';\n", ''],
  ['statement_timeout set after the wall instead of before', "SET LOCAL statement_timeout = '60s';\n", '', { thenAppendBefore: ['DO $after$', "SET LOCAL statement_timeout = '60s';\n"] }],
  ['guard loses the claims-only auth.uid() test', 'IF auth.uid() IS DISTINCT FROM v_probe THEN', 'IF false THEN'],
  ['guard forgets auth.identities', "     OR NOT pg_catalog.has_table_privilege(current_user, 'auth.identities', 'SELECT') THEN", ' THEN'],
  ['guard asks only for membership on Postgres 16+', "pg_catalog.pg_has_role(current_user, 'authenticated', 'SET')", "pg_catalog.pg_has_role(current_user, 'authenticated', 'MEMBER')"],
  ['guard loses the FORCE ROW LEVEL SECURITY check', '    AND c.relforcerowsecurity\n    AND NOT o.rolsuper', '    AND NOT o.rolsuper'],
  ['BEFORE no longer stops without a staff account', "RAISE EXCEPTION 'STOPPED, nothing was changed: no confirmed @clearlinecap.com user found - stop';", "RAISE NOTICE 'STOPPED, nothing was changed: no confirmed @clearlinecap.com user found - stop';"],
  ['a stop that does not say nothing was changed', "'STOPPED, nothing was changed: no confirmed @clearlinecap.com user found - stop'", "'no confirmed @clearlinecap.com user found - stop'"],
  ['AFTER skips the staff check', 'IF v_rows IS DISTINCT FROM 1 THEN', 'IF false THEN'],
  ['AFTER counts whole tables again', "v_row.db_role, v_row.claims, 'any');", "v_row.db_role, v_row.claims, 'count');"],
  ['AFTER asks the signed-out visitor again', "AND k.persona IN ('outsider', 'non_staff_account', 'staff')", "AND k.persona IN ('outsider', 'non_staff_account', 'staff', 'signed_out')"],
  ['AFTER outsider test tolerates rows', 'AND a.visible_rows > 0', 'AND a.visible_rows > 1000'],
  ['AFTER outsider test no longer raises', "RAISE EXCEPTION 'STOPPED, nothing was changed: after adding the wall an outsider", "RAISE NOTICE 'STOPPED, nothing was changed: after adding the wall an outsider"],
  ['AFTER staff test no longer raises', "RAISE EXCEPTION 'STOPPED, nothing was changed: the wall changed what the staff account", "RAISE NOTICE 'STOPPED, nothing was changed: the wall changed what the staff account"],
  ['AFTER staff test only checks growth', 'a.visible_rows IS DISTINCT FROM LEAST(b.visible_rows, 1)', 'a.visible_rows > LEAST(b.visible_rows, 1)'],
  ['helper never switches back', "EXECUTE 'RESET ROLE';", 'NULL;'],
  ['helper is security definer', 'RETURNS bigint\nLANGUAGE plpgsql\nAS $helper$', 'RETURNS bigint\nLANGUAGE plpgsql\nSECURITY DEFINER\nAS $helper$'],
  ['helper uses %s for table names', "format('SELECT count(*) FROM %I.%I', p_schema, p_table)", "format('SELECT count(*) FROM %s.%s', p_schema, p_table)"],
  ['report writes', 'ORDER BY r.sort, r.sub, r.item;', 'ORDER BY r.sort, r.sub, r.item;\nINSERT INTO public.todos DEFAULT VALUES;'],
  ['report has a side effect', "SELECT NULLIF(current_setting('clearline.wall_report', true), '')::jsonb AS j", "SELECT NULLIF(set_config('clearline.wall_report', '', false), '')::jsonb AS j"],
  ['report d softens "Remove it"', "'Not a @clearlinecap.com address. Remove it (Authentication -> Users).'", "'Not a @clearlinecap.com address. Remove it (Authentication -> Users) unless you know who it is.'"],
  ['report loses section g', '  FROM g_gets_through g\n', '  FROM g_gets_through g WHERE false\n'],
  ['report h forgets PUBLIC rules', "('anon' = ANY (p.roles) OR 'public' = ANY (p.roles))", "('anon' = ANY (p.roles))"],
  ['report i checks the wrong policy', "WHERE p.schemaname = n.nspname AND p.tablename = c.relname AND p.policyname = 'clearline_staff_only')", "WHERE p.schemaname = n.nspname AND p.tablename = c.relname)"],
  ['report j lists authenticator', "    AND r.rolname <> 'authenticator'\n", ''],
  ['unterminated body', '$after$;', '$afterX$;'],
  ['CR line endings', '\n', '\r\n', { all: true }],
  ['header drops the sign-up warning', 'turn OFF\n--     "Allow new users to sign up"', 'turn OFF\n--     "sign-ups"'],
  ['header drops the Confirm email pre-check', 'Check that "Confirm email" is ON.', 'Check the settings.'],
  ['header promises staff proof by counting', 'The test confirms this on\n--     the most recent staff account.', 'The self-test proves this by counting.'],
  ['header drops the MFA line', 'by the Flow page, not by the database.', 'by Flow.'],
  ['header drops desk hours', 'Run it outside desk hours.', 'Run it any time.'],
  ['header says service-role functions are simply unaffected', 'So they are also NOT covered by the wall.', 'So they are not affected.'],
];

const UNDO_MUTATIONS = [
  ['no BEGIN', '\nBEGIN;\n', '\n'],
  ['no COMMIT', '\nCOMMIT;\n', '\n'],
  ['function dropped with CASCADE', 'DROP FUNCTION IF EXISTS public.is_clearline_staff();', 'DROP FUNCTION IF EXISTS public.is_clearline_staff() CASCADE;'],
  ['drops a different policy', "'DROP POLICY clearline_staff_only ON %I.%I'", "'DROP POLICY %I ON %I.%I'"],
  ['function dropped before the policies', 'DROP FUNCTION IF EXISTS public.is_clearline_staff();\n', ''],
  ['drops a table', '\nCOMMIT;\n', '\nDROP TABLE public.todos;\nCOMMIT;\n'],
  ['final check no longer raises', "RAISE EXCEPTION 'STOPPED, nothing was changed: a wall policy is still", "RAISE NOTICE 'STOPPED, nothing was changed: a wall policy is still"],
  ['report writes', '"check function still there (should be false)";', '"check function still there (should be false)";\nDELETE FROM public.todos;'],
  ['lock_timeout back to 15s', "SET LOCAL lock_timeout = '3s';", "SET LOCAL lock_timeout = '15s';"],
  ['no statement_timeout', "SET LOCAL statement_timeout = '60s';\n", ''],
  ['dependency check no longer stops', 'IF v_users IS NOT NULL THEN', 'IF false THEN'],
  ['header promises only STOPPED messages', 'Any error at all means nothing was changed.', 'If anything goes wrong it stops with STOPPED.'],
];

// ---------------------------------------------------------------------------------------------------------
function main() {
  const wallSrc = readFileSync(WALL_PATH, 'utf8');
  const undoSrc = readFileSync(UNDO_PATH, 'utf8');
  let bad = 0;

  const wall = checkWall(wallSrc);
  const undo = checkUndo(undoSrc);
  for (const [name, r] of [['wall', wall], ['undo', undo]]) {
    if (r.failures.length) {
      bad += r.failures.length;
      console.log(`FAIL ${name}: ${r.failures.length} failed, ${r.passed} passed`);
      for (const f of r.failures) console.log('   - ' + f);
    } else {
      console.log(`PASS ${name}: ${r.passed} checks`);
    }
  }

  // Line endings and the dollar-quote mutation must break the second file in the pair, so the wall-to-undo
  // pair below is mutated independently.
  let caught = 0;
  let total = 0;
  const runMutations = (label, src, list, checker) => {
    for (const [name, from, to, opts] of list) {
      total++;
      const m = mutate(src, from, to, opts);
      if (m === null || m === src) {
        bad++;
        console.log(`FAIL mutation "${name}" (${label}): the text to break was not found - update the mutation list`);
        continue;
      }
      const r = checker(m);
      if (r.failures.length > 0) caught++;
      else { bad++; console.log(`FAIL mutation "${name}" (${label}) was NOT caught`); }
    }
  };
  runMutations('wall', wallSrc, WALL_MUTATIONS, checkWall);
  runMutations('undo', undoSrc, UNDO_MUTATIONS, checkUndo);
  console.log(`${caught === total ? 'PASS' : 'FAIL'} mutations: ${caught}/${total} deliberate breakages caught`);

  console.log(bad ? `sql_static_check: FAILED (${bad})` : 'sql_static_check: OK (the SQL itself was not executed - structure only)');
  process.exit(bad ? 1 : 0);
}

main();
