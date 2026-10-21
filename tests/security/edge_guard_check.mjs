// Checks supabase/functions/_shared/guard.ts - the caller checks every CRM edge function runs first (2026-10-21).
//
//   node tests/security/edge_guard_check.mjs
//
// Plain Node 24: guard.ts has no imports, so Node loads the .ts file directly (type stripping). If this Node
// cannot, the file is transpiled with the repo's typescript into a temp .mjs and loaded from there.
// fetch is mocked for every case; nothing here touches the network. All keys and secrets are dummies.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const GUARD = path.join(REPO, 'supabase', 'functions', '_shared', 'guard.ts')

// No real network, ever: anything not explicitly mocked throws.
const NO_NETWORK = async (input) => {
  throw new Error('unmocked fetch: ' + String(input && input.url ? input.url : input))
}
globalThis.fetch = NO_NETWORK

// The guard logs why it refused (for the function log); keep that out of the test output, but count it.
const logged = []
console.error = (...a) => { logged.push(a.map(String).join(' ')) }

// Start from a clean environment whatever this PC has set.
for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ALLOWED_EMAIL_DOMAINS',
  'CRM_CRON_SECRET', 'OTHER_CRON_SECRET', 'RESEND_WEBHOOK_SECRET']) delete process.env[k]

async function loadGuard() {
  try {
    return { mod: await import(pathToFileURL(GUARD).href), how: 'direct .ts import' }
  } catch (e) {
    const ts = createRequire(path.join(REPO, 'package.json'))('typescript')
    const out = ts.transpileModule(fs.readFileSync(GUARD, 'utf8'), {
      fileName: 'guard.ts',
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'edge-guard-')), 'guard.mjs')
    fs.writeFileSync(tmp, out)
    return { mod: await import(pathToFileURL(tmp).href), how: 'typescript transpile (' + e.message.split('\n')[0] + ')' }
  }
}

const { mod: G, how } = await loadGuard()
console.log('guard.ts loaded via ' + how)

const BASE = 'https://dummy-project.supabase.test'
const ANON = 'DUMMY_ANON_KEY_123'
const LEAK = 'UPSTREAM_DETAIL_THAT_MUST_NOT_LEAK'
const STAFF = { id: 'user-1', email: 'analyst@clearlinecap.com', email_confirmed_at: '2026-01-02T03:04:05Z' }

function setSupabaseEnv() {
  process.env.SUPABASE_URL = BASE
  process.env.SUPABASE_ANON_KEY = ANON
}

function reqWith(headers = {}, init = {}) {
  return new Request(BASE + '/functions/v1/crm-accounts', { headers, ...init })
}

// A fake Supabase: /auth/v1/user and /rest/v1/rpc/has_crm_access only. Records every call.
function mockSupabase({ userStatus = 200, user = STAFF, rpcStatus = 200, rpcBody = true, throwOn = '' } = {}) {
  const calls = []
  globalThis.fetch = async (input, init = {}) => {
    const url = String(typeof input === 'string' ? input : input.url)
    calls.push({ url, method: String(init.method || 'GET').toUpperCase(), headers: new Headers(init.headers || {}) })
    if (url === BASE + '/auth/v1/user') {
      if (throwOn === 'user') throw new Error('network down ' + LEAK)
      const body = userStatus === 200 ? user : { msg: LEAK }
      return new Response(JSON.stringify(body), { status: userStatus, headers: { 'Content-Type': 'application/json' } })
    }
    if (url === BASE + '/rest/v1/rpc/has_crm_access') {
      if (throwOn === 'rpc') throw new Error('network down ' + LEAK)
      const body = rpcStatus === 200 ? rpcBody : { message: LEAK }
      return new Response(JSON.stringify(body), { status: rpcStatus, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error('unexpected fetch ' + url)
  }
  return calls
}

async function expectDenied(res, status, label) {
  assert.ok(res instanceof Response, label + ': expected a Response, got ' + JSON.stringify(res))
  assert.equal(res.status, status, label + ': status')
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*', label + ': CORS header')
  const text = await res.text()
  assert.ok(!text.includes(LEAK), label + ': upstream text leaked')
  return JSON.parse(text)
}

const results = []
async function test(name, fn) {
  try {
    await fn()
    results.push([true, name])
  } catch (e) {
    results.push([false, name, e])
  } finally {
    globalThis.fetch = NO_NETWORK
  }
}

// ---------------------------------------------------------------- requireStaff

await test('requireStaff: no Authorization header -> 401, nothing fetched', async () => {
  setSupabaseEnv()
  const calls = mockSupabase()
  const body = await expectDenied(await G.requireStaff(reqWith()), 401, 'no header')
  assert.equal(body.error, 'sign in required')
  assert.equal(calls.length, 0)
})

await test('requireStaff: non-Bearer scheme / empty Bearer -> 401', async () => {
  setSupabaseEnv()
  const calls = mockSupabase()
  await expectDenied(await G.requireStaff(reqWith({ Authorization: 'Basic abc' })), 401, 'basic')
  await expectDenied(await G.requireStaff(reqWith({ Authorization: 'Bearer ' })), 401, 'empty bearer')
  await expectDenied(await G.requireStaff(reqWith({ Authorization: 'Bearer a b' })), 401, 'two tokens')
  assert.equal(calls.length, 0)
})

await test('requireStaff: forged token (/auth/v1/user 401) -> 401, has_crm_access not asked', async () => {
  setSupabaseEnv()
  const calls = mockSupabase({ userStatus: 401 })
  const body = await expectDenied(await G.requireStaff(reqWith({ Authorization: 'Bearer forged.jwt.token' })), 401, 'forged')
  assert.equal(body.error, 'sign in required')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, BASE + '/auth/v1/user')
})

await test('requireStaff: the anon key as the token (/auth/v1/user 403) -> 401', async () => {
  setSupabaseEnv()
  mockSupabase({ userStatus: 403 })
  await expectDenied(await G.requireStaff(reqWith({ Authorization: 'Bearer ' + ANON })), 401, 'anon as token')
})

await test('requireStaff: /auth/v1/user unreachable -> 401, error text not passed on', async () => {
  setSupabaseEnv()
  mockSupabase({ throwOn: 'user' })
  await expectDenied(await G.requireStaff(reqWith({ Authorization: 'Bearer tok' })), 401, 'user fetch throws')
})

await test('requireStaff: SUPABASE_URL / SUPABASE_ANON_KEY unset -> 401, nothing fetched', async () => {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_ANON_KEY
  const calls = mockSupabase()
  await expectDenied(await G.requireStaff(reqWith({ Authorization: 'Bearer tok' })), 401, 'no env')
  assert.equal(calls.length, 0)
})

await test('requireStaff: unconfirmed email -> denied (401/403)', async () => {
  setSupabaseEnv()
  mockSupabase({ user: { ...STAFF, email_confirmed_at: null } })
  const res = await G.requireStaff(reqWith({ Authorization: 'Bearer tok' }))
  assert.ok(res instanceof Response && (res.status === 401 || res.status === 403), 'status ' + (res && res.status))
  mockSupabase({ user: { id: STAFF.id, email: STAFF.email } })
  const res2 = await G.requireStaff(reqWith({ Authorization: 'Bearer tok' }))
  assert.ok(res2 instanceof Response && (res2.status === 401 || res2.status === 403), 'missing field')
})

await test('requireStaff: outsider domain -> 403', async () => {
  setSupabaseEnv()
  mockSupabase({ user: { ...STAFF, email: 'someone@gmail.com' } })
  const body = await expectDenied(await G.requireStaff(reqWith({ Authorization: 'Bearer tok' })), 403, 'gmail')
  assert.equal(body.error, 'Clearline CRM staff only')
})

await test("requireStaff: 'x@evil.clearlinecap.com' -> 403 (exact suffix)", async () => {
  setSupabaseEnv()
  mockSupabase({ user: { ...STAFF, email: 'x@evil.clearlinecap.com' } })
  await expectDenied(await G.requireStaff(reqWith({ Authorization: 'Bearer tok' })), 403, 'subdomain')
})

await test('requireStaff: look-alike domains -> 403', async () => {
  setSupabaseEnv()
  for (const email of ['x@clearlinecap.com.evil.com', 'x@notclearlinecap.com', 'x@clearlinecap.co', 'x@y@clearlinecap.com', '']) {
    mockSupabase({ user: { ...STAFF, email } })
    const res = await G.requireStaff(reqWith({ Authorization: 'Bearer tok' }))
    assert.ok(res instanceof Response && res.status >= 401 && res.status <= 403, email + ' was let in')
  }
})

await test('requireStaff: staff but has_crm_access false -> 403', async () => {
  setSupabaseEnv()
  mockSupabase({ rpcBody: false })
  const body = await expectDenied(await G.requireStaff(reqWith({ Authorization: 'Bearer tok' })), 403, 'crm false')
  assert.equal(body.error, 'Clearline CRM staff only')
})

await test("requireStaff: has_crm_access not a literal true ('true', 1, null, error, 500, unreachable) -> 403", async () => {
  setSupabaseEnv()
  for (const opt of [{ rpcBody: 'true' }, { rpcBody: 1 }, { rpcBody: null }, { rpcBody: [true] }, { rpcStatus: 500 },
    { rpcStatus: 404 }, { throwOn: 'rpc' }]) {
    mockSupabase(opt)
    await expectDenied(await G.requireStaff(reqWith({ Authorization: 'Bearer tok' })), 403, JSON.stringify(opt))
  }
})

await test('requireStaff: staff + has_crm_access true -> ok, with the right calls', async () => {
  setSupabaseEnv()
  const calls = mockSupabase()
  const res = await G.requireStaff(reqWith({ Authorization: 'Bearer good.session.token' }))
  assert.ok(!(res instanceof Response), 'denied: ' + (res && res.status))
  assert.deepEqual(res, { user: { id: 'user-1', email: 'analyst@clearlinecap.com' }, token: 'good.session.token' })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, BASE + '/auth/v1/user')
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].headers.get('apikey'), ANON)
  assert.equal(calls[0].headers.get('authorization'), 'Bearer good.session.token')
  assert.equal(calls[1].url, BASE + '/rest/v1/rpc/has_crm_access')
  assert.equal(calls[1].method, 'POST')
  assert.equal(calls[1].headers.get('apikey'), ANON)
  assert.equal(calls[1].headers.get('authorization'), 'Bearer good.session.token')
})

await test('requireStaff: email case and a trailing slash on SUPABASE_URL do not matter', async () => {
  setSupabaseEnv()
  process.env.SUPABASE_URL = BASE + '/'
  mockSupabase({ user: { ...STAFF, email: 'Analyst@ClearlineCap.COM' } })
  const res = await G.requireStaff(reqWith({ Authorization: 'bearer tok' }))
  assert.ok(!(res instanceof Response), 'denied: ' + (res && res.status))
  assert.equal(res.user.email, 'analyst@clearlinecap.com')
})

await test('requireStaff: ALLOWED_EMAIL_DOMAINS replaces the default', async () => {
  setSupabaseEnv()
  process.env.ALLOWED_EMAIL_DOMAINS = ' other.example , @second.example '
  try {
    mockSupabase()
    await expectDenied(await G.requireStaff(reqWith({ Authorization: 'Bearer tok' })), 403, 'default domain dropped')
    mockSupabase({ user: { ...STAFF, email: 'a@second.example' } })
    const ok = await G.requireStaff(reqWith({ Authorization: 'Bearer tok' }))
    assert.ok(!(ok instanceof Response), 'listed domain refused')
    process.env.ALLOWED_EMAIL_DOMAINS = ' , '
    mockSupabase()
    await expectDenied(await G.requireStaff(reqWith({ Authorization: 'Bearer tok' })), 403, 'empty list lets nobody in')
  } finally {
    delete process.env.ALLOWED_EMAIL_DOMAINS
  }
})

// ---------------------------------------------------------------- requireCronSecret

const CRON = 'DUMMY_CRON_SECRET_123'

await test("requireCronSecret: secret unset -> 401 for everything, including 'Bearer ' and 'Bearer undefined'", async () => {
  delete process.env.CRM_CRON_SECRET
  for (const h of [{}, { Authorization: 'Bearer ' }, { Authorization: 'Bearer undefined' }, { Authorization: 'Bearer null' },
    { 'x-cron-secret': 'undefined' }, { 'x-cron-secret': '' }, { Authorization: 'Bearer ' + CRON }]) {
    await expectDenied(await G.requireCronSecret(reqWith(h)), 401, 'unset ' + JSON.stringify(h))
  }
})

await test('requireCronSecret: secret empty or blank -> 401', async () => {
  for (const v of ['', '   ']) {
    process.env.CRM_CRON_SECRET = v
    for (const h of [{ Authorization: 'Bearer ' }, { Authorization: 'Bearer ' + v }, { 'x-cron-secret': v }, {}]) {
      await expectDenied(await G.requireCronSecret(reqWith(h)), 401, 'blank ' + JSON.stringify(h))
    }
  }
  delete process.env.CRM_CRON_SECRET
})

await test('requireCronSecret: right secret -> ok; same-length wrong, prefix, suffix -> 401', async () => {
  process.env.CRM_CRON_SECRET = CRON
  try {
    assert.equal(await G.requireCronSecret(reqWith({ Authorization: 'Bearer ' + CRON })), null)
    assert.equal(await G.requireCronSecret(reqWith({ Authorization: 'bearer ' + CRON })), null)
    const wrong = CRON.slice(0, -1) + '4'
    assert.equal(wrong.length, CRON.length)
    await expectDenied(await G.requireCronSecret(reqWith({ Authorization: 'Bearer ' + wrong })), 401, 'same length wrong')
    await expectDenied(await G.requireCronSecret(reqWith({ Authorization: 'Bearer ' + CRON.slice(0, -1) })), 401, 'prefix')
    await expectDenied(await G.requireCronSecret(reqWith({ Authorization: 'Bearer ' + CRON + 'x' })), 401, 'suffix')
    await expectDenied(await G.requireCronSecret(reqWith({ Authorization: CRON })), 401, 'no Bearer word')
    await expectDenied(await G.requireCronSecret(reqWith({ 'x-cron-secret': wrong })), 401, 'header wrong')
  } finally {
    delete process.env.CRM_CRON_SECRET
  }
})

await test('requireCronSecret: x-cron-secret variant -> ok (next to a project JWT in Authorization)', async () => {
  process.env.CRM_CRON_SECRET = CRON
  try {
    assert.equal(await G.requireCronSecret(reqWith({ 'x-cron-secret': CRON })), null)
    assert.equal(await G.requireCronSecret(reqWith({ Authorization: 'Bearer ' + ANON, 'x-cron-secret': CRON })), null)
  } finally {
    delete process.env.CRM_CRON_SECRET
  }
})

const SERVICE_ROLE = 'DUMMY_SERVICE_ROLE_KEY_123'

await test('requireCronSecret: Bearer <service role key> (the documented pg_cron shape) -> ok, secret set or not', async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE
  try {
    delete process.env.CRM_CRON_SECRET
    assert.equal(await G.requireCronSecret(reqWith({ Authorization: 'Bearer ' + SERVICE_ROLE })), null)
    process.env.CRM_CRON_SECRET = CRON
    assert.equal(await G.requireCronSecret(reqWith({ Authorization: 'Bearer ' + SERVICE_ROLE })), null)
    // and the cron secret still works next to it
    assert.equal(await G.requireCronSecret(reqWith({ 'x-cron-secret': CRON })), null)
  } finally {
    delete process.env.CRM_CRON_SECRET
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  }
})

await test('requireCronSecret: service role key wrong / partial / in x-cron-secret / unset -> 401', async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE
  try {
    const wrong = SERVICE_ROLE.slice(0, -1) + '4'
    assert.equal(wrong.length, SERVICE_ROLE.length)
    for (const h of [{}, { Authorization: 'Bearer ' }, { Authorization: 'Bearer undefined' },
      { Authorization: 'Bearer ' + wrong }, { Authorization: 'Bearer ' + SERVICE_ROLE.slice(0, -1) },
      { Authorization: 'Bearer ' + SERVICE_ROLE + 'x' }, { Authorization: SERVICE_ROLE },
      { 'x-cron-secret': SERVICE_ROLE }, { Authorization: 'Bearer ' + ANON }]) {
      await expectDenied(await G.requireCronSecret(reqWith(h)), 401, 'service role ' + JSON.stringify(h))
    }
    // Unset or blank: the service role path is closed, so with no cron secret nobody passes.
    for (const v of ['', '   ']) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = v
      for (const h of [{ Authorization: 'Bearer ' }, { Authorization: 'Bearer ' + v }, { Authorization: 'Bearer undefined' }]) {
        await expectDenied(await G.requireCronSecret(reqWith(h)), 401, 'blank service role ' + JSON.stringify(h))
      }
    }
  } finally {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  }
})

await test('requireCronSecret: a service role key equal to the public anon key is never accepted', async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = ANON
  process.env.SUPABASE_ANON_KEY = ANON
  try {
    await expectDenied(await G.requireCronSecret(reqWith({ Authorization: 'Bearer ' + ANON })), 401, 'anon == service role')
  } finally {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_ANON_KEY
  }
})

await test('requireCronSecret: a custom env name is the one that counts', async () => {
  process.env.CRM_CRON_SECRET = CRON
  try {
    await expectDenied(await G.requireCronSecret(reqWith({ 'x-cron-secret': CRON }), 'OTHER_CRON_SECRET'), 401, 'other unset')
    process.env.OTHER_CRON_SECRET = 'DUMMY_OTHER_SECRET_456'
    assert.equal(await G.requireCronSecret(reqWith({ 'x-cron-secret': 'DUMMY_OTHER_SECRET_456' }), 'OTHER_CRON_SECRET'), null)
  } finally {
    delete process.env.CRM_CRON_SECRET
    delete process.env.OTHER_CRON_SECRET
  }
})

// ---------------------------------------------------------------- verifyResendWebhook

const KEY = Buffer.from('DUMMY_RESEND_WEBHOOK_KEY_123')
const WHSEC = 'whsec_' + KEY.toString('base64')
const BODY = JSON.stringify({ type: 'email.opened', created_at: '2026-10-21T00:00:00.000Z', data: { tags: [] } })
const now = () => Math.floor(Date.now() / 1000)
const sig = (id, ts, body, key = KEY) =>
  'v1,' + crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
function svixReq(headers) {
  return new Request(BASE + '/functions/v1/crm-resend-webhook', { method: 'POST', headers, body: BODY })
}
function signedHeaders(over = {}) {
  const ts = String(over.ts ?? now())
  const id = over.id ?? 'msg_DUMMY123'
  return {
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': over.signature ?? sig(id, ts, over.signedBody ?? BODY, over.key),
  }
}

await test('verifyResendWebhook: correctly signed payload -> ok', async () => {
  process.env.RESEND_WEBHOOK_SECRET = WHSEC
  try {
    assert.equal(await G.verifyResendWebhook(svixReq(signedHeaders()), BODY), null)
  } finally {
    delete process.env.RESEND_WEBHOOK_SECRET
  }
})

await test("verifyResendWebhook: Svix's published test vector -> ok (format check)", async () => {
  // From the Svix docs: secret, id, timestamp, payload and the signature Svix computes for them.
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
  const realNow = Date.now
  Date.now = () => 1614265330 * 1000
  try {
    const payload = '{"test": 2432232314}'
    const r = new Request(BASE + '/x', {
      method: 'POST',
      headers: {
        'svix-id': 'msg_p5jXN8AQM9LWM0D4loKWxJek',
        'svix-timestamp': '1614265330',
        'svix-signature': 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
      },
      body: payload,
    })
    assert.equal(await G.verifyResendWebhook(r, payload), null)
  } finally {
    Date.now = realNow
    delete process.env.RESEND_WEBHOOK_SECRET
  }
})

await test('verifyResendWebhook: tampered body -> 401', async () => {
  process.env.RESEND_WEBHOOK_SECRET = WHSEC
  try {
    const tampered = BODY.replace('email.opened', 'email.clicked')
    await expectDenied(await G.verifyResendWebhook(svixReq(signedHeaders()), tampered), 401, 'tampered')
    await expectDenied(await G.verifyResendWebhook(svixReq(signedHeaders()), BODY + ' '), 401, 'extra byte')
  } finally {
    delete process.env.RESEND_WEBHOOK_SECRET
  }
})

await test('verifyResendWebhook: signed with the wrong secret -> 401', async () => {
  process.env.RESEND_WEBHOOK_SECRET = WHSEC
  try {
    const h = signedHeaders({ key: Buffer.from('DUMMY_OTHER_WEBHOOK_KEY_999') })
    await expectDenied(await G.verifyResendWebhook(svixReq(h), BODY), 401, 'wrong key')
  } finally {
    delete process.env.RESEND_WEBHOOK_SECRET
  }
})

await test('verifyResendWebhook: timestamp more than 300 s off -> 401; 299 s -> ok', async () => {
  process.env.RESEND_WEBHOOK_SECRET = WHSEC
  try {
    await expectDenied(await G.verifyResendWebhook(svixReq(signedHeaders({ ts: now() - 301 })), BODY), 401, 'old')
    await expectDenied(await G.verifyResendWebhook(svixReq(signedHeaders({ ts: now() + 301 })), BODY), 401, 'future')
    await expectDenied(await G.verifyResendWebhook(svixReq(signedHeaders({ ts: now() - 86400 })), BODY), 401, 'a day old')
    assert.equal(await G.verifyResendWebhook(svixReq(signedHeaders({ ts: now() - 299 })), BODY), null)
    await expectDenied(await G.verifyResendWebhook(svixReq(signedHeaders({ ts: 'abc' })), BODY), 401, 'not a number')
  } finally {
    delete process.env.RESEND_WEBHOOK_SECRET
  }
})

await test('verifyResendWebhook: any missing svix header -> 401', async () => {
  process.env.RESEND_WEBHOOK_SECRET = WHSEC
  try {
    for (const drop of ['svix-id', 'svix-timestamp', 'svix-signature']) {
      const h = signedHeaders()
      delete h[drop]
      await expectDenied(await G.verifyResendWebhook(svixReq(h), BODY), 401, 'missing ' + drop)
    }
    await expectDenied(await G.verifyResendWebhook(svixReq({}), BODY), 401, 'no headers')
  } finally {
    delete process.env.RESEND_WEBHOOK_SECRET
  }
})

await test('verifyResendWebhook: several v1 entries, the 2nd matches -> ok; only non-v1 matches -> 401', async () => {
  process.env.RESEND_WEBHOOK_SECRET = WHSEC
  try {
    const good = signedHeaders()
    const goodB64 = good['svix-signature'].slice(3)
    const bad = sig('msg_DUMMY123', good['svix-timestamp'], BODY, Buffer.from('DUMMY_OLD_KEY'))
    const multi = { ...good, 'svix-signature': bad + ' ' + good['svix-signature'] }
    assert.equal(await G.verifyResendWebhook(svixReq(multi), BODY), null)
    const v2only = { ...good, 'svix-signature': bad + ' v2,' + goodB64 }
    await expectDenied(await G.verifyResendWebhook(svixReq(v2only), BODY), 401, 'v2 entry')
    const bare = { ...good, 'svix-signature': goodB64 }
    await expectDenied(await G.verifyResendWebhook(svixReq(bare), BODY), 401, 'no version prefix')
  } finally {
    delete process.env.RESEND_WEBHOOK_SECRET
  }
})

await test('verifyResendWebhook: secret unset or empty -> 401 even for a well-formed signature', async () => {
  delete process.env.RESEND_WEBHOOK_SECRET
  await expectDenied(await G.verifyResendWebhook(svixReq(signedHeaders()), BODY), 401, 'unset')
  process.env.RESEND_WEBHOOK_SECRET = ''
  await expectDenied(await G.verifyResendWebhook(svixReq(signedHeaders()), BODY), 401, 'empty')
  // An empty key (just the prefix) must not verify a signature made with an empty key.
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_'
  await expectDenied(await G.verifyResendWebhook(svixReq(signedHeaders({ key: Buffer.alloc(0) })), BODY), 401, 'prefix only')
  delete process.env.RESEND_WEBHOOK_SECRET
})

// ---------------------------------------------------------------- small helpers

await test('json / corsHeaders: status, JSON body, CORS headers', async () => {
  const r = G.json(418, { a: 1 })
  assert.equal(r.status, 418)
  assert.equal(r.headers.get('Content-Type'), 'application/json')
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*')
  assert.equal(r.headers.get('Access-Control-Allow-Headers'), 'authorization, x-client-info, apikey, content-type')
  assert.deepEqual(await r.json(), { a: 1 })
})

await test("searchTerm: PostgREST filter characters become '_', apostrophes kept, length capped", async () => {
  assert.equal(G.searchTerm('acme,id.eq.1)'), 'acme_id.eq.1_')
  assert.equal(G.searchTerm(`a(b)*c%d\\e'f"g\`h`), "a_b__c_d_e'f_g_h")
  assert.equal(G.searchTerm("O'Brien"), "O'Brien")
  assert.equal(G.searchTerm('Smith, Jones'), 'Smith_ Jones')
  assert.equal(G.searchTerm('  Blue \t\n  Owl  '), 'Blue Owl')
  assert.equal(G.searchTerm('a\u0000b\u007fc'), 'a_b_c')
  assert.equal(G.searchTerm('x'.repeat(500)).length, 100)
  assert.equal(G.searchTerm(null), '')
  assert.ok(!/[,()*%\\"`]/.test(G.searchTerm(',()*%\\\'"`'.repeat(20))))
})

await test("searchTerm: the cleaned text cannot add a term to an .or() filter, and ilike still matches the original", async () => {
  // How PostgREST splits or=(...): on commas outside double quotes, with ( ) grouping. One term per column, always.
  const splitOr = (s) => {
    const out = []
    let depth = 0
    let cur = ''
    let quoted = false
    for (const ch of s) {
      if (ch === '"') quoted = !quoted
      if (!quoted && ch === '(') depth++
      if (!quoted && ch === ')') depth--
      if (!quoted && depth === 0 && ch === ',') { out.push(cur); cur = '' } else cur += ch
    }
    out.push(cur)
    return { terms: out, depth, quoted }
  }
  // ilike with only % and _ wildcards, as Postgres reads it (no escape character in the cleaned text).
  const ilike = (value, pattern) => new RegExp('^' + pattern.split('').map((c) =>
    c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$', 'is').test(value)
  for (const input of ["O'Brien", 'Smith, Jones', 'a),id.not.is.null,(b', 'x,firm_name.ilike.*', '"quoted",x', 'back\\slash',
    '100%', 'star*']) {
    const q = G.searchTerm(input)
    const { terms, depth, quoted } = splitOr(`firm_name.ilike.%${q}%,website.ilike.%${q}%`)
    assert.equal(terms.length, 2, input + ' -> ' + JSON.stringify(terms))
    assert.equal(depth, 0, input + ' unbalanced brackets')
    assert.equal(quoted, false, input + ' open quote')
    assert.ok(ilike(input, '%' + q + '%'), input + ' no longer matches itself via ' + q)
  }
})

await test('oneOf: only listed values pass', async () => {
  assert.equal(G.oneOf('firm_name', ['firm_name', 'aum'], 'x'), 'firm_name')
  assert.equal(G.oneOf('firm_name.asc,id', ['firm_name'], 'fallback'), 'fallback')
  assert.equal(G.oneOf(null, ['asc', 'desc'], 'asc'), 'asc')
})

await test('escapeHtml: & < > " \' escaped; null -> empty', async () => {
  assert.equal(G.escapeHtml('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;')
  assert.equal(G.escapeHtml(null), '')
  assert.equal(G.escapeHtml(5), '5')
})

await test('failure: hides upstream text, keeps a publicError message', async () => {
  {
    const r1 = G.failure(new Error('relation "mailboxes" violates ' + LEAK), 'test')
    assert.equal(r1.status, 400)
    assert.deepEqual(await r1.json(), { error: 'Request failed' })
    const r2 = G.failure(G.publicError('No valid recipients found'), 'test')
    assert.equal(r2.status, 400)
    assert.deepEqual(await r2.json(), { error: 'No valid recipients found' })
    const r3 = G.failure({ message: LEAK, code: '42P01' }, 'test', 500)
    assert.equal(r3.status, 500)
    assert.deepEqual(await r3.json(), { error: 'Request failed' })
  }
})

await test('nothing the guard logged contains a token, key or secret', async () => {
  assert.ok(logged.length > 0, 'expected some refusal logs to inspect')
  for (const line of logged) {
    for (const secret of [ANON, 'good.session.token', CRON, WHSEC, KEY.toString('base64'), 'DUMMY_OTHER_SECRET_456',
      SERVICE_ROLE]) {
      assert.ok(!line.includes(secret), 'logged a secret: ' + line.slice(0, 120))
    }
  }
})

// ---------------------------------------------------------------- report

let failed = 0
for (const [ok, name, err] of results) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name)
  if (!ok) {
    failed++
    console.log('     ' + String((err && err.stack) || err).split('\n').slice(0, 4).join('\n     '))
  }
}
console.log(`\n${results.length - failed}/${results.length} passed (${logged.length} guard log lines kept out of the output)`)
process.exit(failed ? 1 : 0)
