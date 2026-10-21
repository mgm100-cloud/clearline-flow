// Runs the real CRM edge-function handlers under Node, with Deno's two remote imports stubbed (2026-10-21).
//
//   node tests/security/edge_handler_check.mjs
//
// Each supabase/functions/<name>/index.ts is imported unchanged (Node 24 strips the types). A module hook
// answers its remote imports: deno.land's serve() hands the handler to this test, and esm.sh's createClient()
// returns a fake database that records every query. fetch is mocked; nothing here touches the network, and
// every key and secret is a dummy. What it proves, end to end through each handler:
//   - crm-resend-webhook: unsigned deliveries never reach the database; the same signed delivery posted twice
//     is stored once; a failed duplicate lookup still records the event.
//   - crm-send-bulk-email: the recipient cap (default 500, CRM_BULK_EMAIL_MAX_RECIPIENTS, ceiling 5000) refuses
//     before anything is written or sent; non-staff never reach the database.
//   - crm-outlook-sync / crm-weekly-diligence-report: the documented `Bearer <service role key>` and
//     x-cron-secret both start the job; nothing else does; account fields in the report email are escaped.
//   - crm-search: the text reaching PostgREST's .or() keeps O'Brien and cannot add a filter term.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import module from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const FUNCS = path.join(REPO, 'supabase', 'functions')

const print = console.log.bind(console)
const logged = []
console.log = console.error = console.warn = (...a) => { logged.push(a.map(String).join(' ')) }

if (typeof module.registerHooks !== 'function') {
  print('FAIL this Node (' + process.version + ') has no module.registerHooks; Node 22.15+ / 24 needed')
  process.exit(1)
}

const SERVE_STUB = 'export function serve(handler) { globalThis.__edgeServe(handler) }'
const SUPABASE_STUB = 'export function createClient(...args) { return globalThis.__edgeCreateClient(...args) }'
module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^https:\/\/deno\.land\/std@[^/]+\/http\/server\.ts$/.test(specifier)) {
      return { url: 'data:text/javascript,' + encodeURIComponent(SERVE_STUB), shortCircuit: true }
    }
    if (/^https:\/\/esm\.sh\/@supabase\/supabase-js@[^/]+$/.test(specifier)) {
      return { url: 'data:text/javascript,' + encodeURIComponent(SUPABASE_STUB), shortCircuit: true }
    }
    if (/^https?:/.test(specifier)) throw new Error('unexpected remote import ' + specifier)
    return nextResolve(specifier, context)
  },
})

// Deno.env, backed by process.env, read at call time like the real one.
globalThis.Deno = { env: { get: (k) => process.env[k] } }

const NO_NETWORK = async (input) => {
  throw new Error('unmocked fetch: ' + String(input && input.url ? input.url : input))
}
globalThis.fetch = NO_NETWORK
globalThis.__edgeCreateClient = () => { throw new Error('createClient called with no fake database set up') }

const BASE = 'https://dummy-project.supabase.test'
const ANON = 'DUMMY_ANON_KEY_123'
const SERVICE_ROLE = 'DUMMY_SERVICE_ROLE_KEY_123'
const CRON = 'DUMMY_CRON_SECRET_123'
const RESEND_KEY = 'DUMMY_RESEND_KEY_123'
const SESSION = 'DUMMY_SESSION_TOKEN_123'
const KEY = Buffer.from('DUMMY_RESEND_WEBHOOK_KEY_123')
const WHSEC = 'whsec_' + KEY.toString('base64')
const STAFF = { id: 'user-1', email: 'analyst@clearlinecap.com', email_confirmed_at: '2026-01-02T03:04:05Z' }

for (const k of ['ALLOWED_EMAIL_DOMAINS', 'CRM_BULK_EMAIL_MAX_RECIPIENTS', 'RESEND_FROM_EMAIL', 'OUTLOOK_REDIRECT_URIS',
  'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET']) delete process.env[k]
Object.assign(process.env, {
  SUPABASE_URL: BASE,
  SUPABASE_ANON_KEY: ANON,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
  CRM_CRON_SECRET: CRON,
  RESEND_API_KEY: RESEND_KEY,
  RESEND_WEBHOOK_SECRET: WHSEC,
})

async function loadHandler(name) {
  let handler = null
  globalThis.__edgeServe = (fn) => { handler = fn }
  await import(pathToFileURL(path.join(FUNCS, name, 'index.ts')).href)
  assert.equal(typeof handler, 'function', name + ' did not call serve()')
  return handler
}

// A fake supabase-js client. Every chained call is recorded on the query; awaiting the chain asks `respond`.
function fakeDb(respond) {
  const queries = []
  const clients = []
  globalThis.__edgeCreateClient = (url, key, opts) => {
    clients.push({ url, key, opts })
    return {
      from(table) {
        const q = { table, ops: [] }
        queries.push(q)
        const chain = new Proxy({}, {
          get(_t, prop) {
            if (prop === 'then') {
              return (resolve, reject) => Promise.resolve().then(() => respond(q)).then(resolve, reject)
            }
            if (typeof prop !== 'string') return undefined
            return (...args) => { q.ops.push([prop, ...args]); return chain }
          },
        })
        return chain
      },
    }
  }
  return { queries, clients }
}
const firstOp = (q) => (q.ops[0] || [])[0]

function jsonRes(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Supabase auth + has_crm_access + Resend, all fake.
function mockFetch({ user = STAFF, crm = true, resendStatus = 200 } = {}) {
  const calls = []
  globalThis.fetch = async (input, init = {}) => {
    const url = String(typeof input === 'string' ? input : input.url)
    calls.push({ url, init })
    if (url === BASE + '/auth/v1/user') return jsonRes(200, user)
    if (url === BASE + '/rest/v1/rpc/has_crm_access') return jsonRes(200, crm)
    if (url === 'https://api.resend.com/emails') return jsonRes(resendStatus, { id: 're_' + calls.length })
    throw new Error('unexpected fetch ' + url)
  }
  return calls
}
const resendCalls = (calls) => calls.filter((c) => c.url === 'https://api.resend.com/emails')

const results = []
async function test(name, fn) {
  try {
    await fn()
    results.push([true, name])
  } catch (e) {
    results.push([false, name, e])
  } finally {
    globalThis.fetch = NO_NETWORK
    globalThis.__edgeCreateClient = () => { throw new Error('createClient called with no fake database set up') }
    delete process.env.CRM_BULK_EMAIL_MAX_RECIPIENTS
  }
}

const H = {
  webhook: await loadHandler('crm-resend-webhook'),
  bulk: await loadHandler('crm-send-bulk-email'),
  sync: await loadHandler('crm-outlook-sync'),
  weekly: await loadHandler('crm-weekly-diligence-report'),
  search: await loadHandler('crm-search'),
}

// ---------------------------------------------------------------- crm-resend-webhook

const now = () => Math.floor(Date.now() / 1000)
function signedDelivery(body, { id = 'msg_DUMMY123', ts = now(), key = KEY } = {}) {
  const sig = 'v1,' + crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
  return { body, headers: { 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': sig } }
}
const post = (url, { body, headers }) => new Request(url, { method: 'POST', headers, body })
const hookUrl = BASE + '/functions/v1/crm-resend-webhook'
function eventBody(over = {}) {
  return JSON.stringify({
    type: over.type || 'email.opened',
    created_at: over.created_at || '2026-10-21T10:00:00.000Z',
    data: {
      email_id: 'email_id' in over ? over.email_id : 're_abc',
      tags: over.tags || [{ name: 'email_outbound_id', value: 'out-1' }, { name: 'contact_id', value: 'c-1' }],
    },
  })
}

// A tiny stateful email_events table, so a replay meets the row the first delivery stored.
function webhookDb({ lookupError = null } = {}) {
  const rows = []
  const db = fakeDb((q) => {
    if (q.table === 'email_outbound_recipients') return { data: { id: 'rcpt-1' }, error: null }
    if (q.table === 'email_events' && firstOp(q) === 'insert') {
      rows.push(q.ops[0][1])
      return { data: null, error: null }
    }
    if (q.table === 'email_events' && firstOp(q) === 'select') {
      if (lookupError) return { data: null, error: lookupError }
      const hit = rows.filter((row) => q.ops.every(([op, col, val]) => {
        if (op === 'select' || op === 'limit') return true
        const v = col === 'meta_json->>email_id' ? row.meta_json && row.meta_json.email_id : row[col]
        if (op === 'eq') return v !== null && v !== undefined && String(v) === String(val)
        if (op === 'is') return v === val
        throw new Error('unexpected filter ' + op)
      }))
      return { data: hit.slice(0, 1).map(() => ({ id: 'ev-1' })), error: null }
    }
    throw new Error('unexpected query ' + q.table + ' ' + JSON.stringify(q.ops))
  })
  return { ...db, rows }
}

await test('crm-resend-webhook: unsigned / wrongly signed delivery -> 401, the database is never opened', async () => {
  const db = webhookDb()
  const body = eventBody()
  let r = await H.webhook(new Request(hookUrl, { method: 'POST', body }))
  assert.equal(r.status, 401)
  r = await H.webhook(post(hookUrl, signedDelivery(body, { key: Buffer.from('DUMMY_OTHER_KEY_999') })))
  assert.equal(r.status, 401)
  assert.equal(db.clients.length, 0)
  assert.equal(db.queries.length, 0)
})

await test('crm-resend-webhook: OPTIONS still answers ok with CORS headers', async () => {
  const r = await H.webhook(new Request(hookUrl, { method: 'OPTIONS' }))
  assert.equal(r.status, 200)
  assert.equal(await r.text(), 'ok')
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*')
})

await test('crm-resend-webhook: the same signed delivery posted twice is stored once', async () => {
  const db = webhookDb()
  const delivery = signedDelivery(eventBody())
  let r = await H.webhook(post(hookUrl, delivery))
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { success: true })
  assert.equal(db.rows.length, 1)
  assert.deepEqual(db.rows[0], {
    email_outbound_id: 'out-1', recipient_id: 'rcpt-1', type: 'opened', occurred_at: '2026-10-21T10:00:00.000Z',
    meta_json: JSON.parse(eventBody()).data,
  })
  assert.equal(db.clients[0].key, SERVICE_ROLE)

  r = await H.webhook(post(hookUrl, delivery)) // the replay: identical bytes, identical signature
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { success: true, message: 'Ignored - duplicate delivery' })
  assert.equal(db.rows.length, 1, 'replay stored a second row')

  const lookup = db.queries.filter((q) => q.table === 'email_events' && firstOp(q) === 'select')[0]
  assert.deepEqual(lookup.ops, [['select', 'id'], ['eq', 'email_outbound_id', 'out-1'], ['eq', 'type', 'opened'],
    ['eq', 'occurred_at', '2026-10-21T10:00:00.000Z'], ['eq', 'recipient_id', 'rcpt-1'],
    ['eq', 'meta_json->>email_id', 're_abc'], ['limit', 1]])
})

await test('crm-resend-webhook: a different event for the same email is still stored', async () => {
  const db = webhookDb()
  await H.webhook(post(hookUrl, signedDelivery(eventBody())))
  await H.webhook(post(hookUrl, signedDelivery(eventBody({ created_at: '2026-10-21T10:05:00.000Z' }), { id: 'msg_2' })))
  await H.webhook(post(hookUrl, signedDelivery(eventBody({ type: 'email.clicked' }), { id: 'msg_3' })))
  await H.webhook(post(hookUrl, signedDelivery(eventBody({ email_id: 're_other' }), { id: 'msg_4' })))
  assert.equal(db.rows.length, 4)
})

await test('crm-resend-webhook: no contact tag -> the lookup asks for recipient_id IS NULL', async () => {
  const db = webhookDb()
  const body = eventBody({ tags: [{ name: 'email_outbound_id', value: 'out-1' }], email_id: null })
  await H.webhook(post(hookUrl, signedDelivery(body)))
  const r = await H.webhook(post(hookUrl, signedDelivery(body)))
  assert.deepEqual(await r.json(), { success: true, message: 'Ignored - duplicate delivery' })
  assert.equal(db.rows.length, 1)
  const lookup = db.queries.find((q) => q.table === 'email_events' && firstOp(q) === 'select')
  assert.ok(lookup.ops.some((o) => o[0] === 'is' && o[1] === 'recipient_id' && o[2] === null), JSON.stringify(lookup.ops))
  assert.ok(!lookup.ops.some((o) => o[1] === 'meta_json->>email_id'), 'no email_id filter without an email_id')
})

await test('crm-resend-webhook: a failed duplicate lookup still records the event', async () => {
  const db = webhookDb({ lookupError: { message: 'UPSTREAM_DETAIL' } })
  const r = await H.webhook(post(hookUrl, signedDelivery(eventBody())))
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { success: true })
  assert.equal(db.rows.length, 1)
})

await test('crm-resend-webhook: a signed body that is not JSON -> 400 Request failed, nothing stored', async () => {
  const db = webhookDb()
  const r = await H.webhook(post(hookUrl, signedDelivery('not json {')))
  assert.equal(r.status, 400)
  assert.deepEqual(await r.json(), { error: 'Request failed' })
  assert.equal(db.rows.length, 0)
})

// ---------------------------------------------------------------- crm-send-bulk-email

const bulkUrl = BASE + '/functions/v1/crm-send-bulk-email'
const staffPost = (url, body) => new Request(url, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + SESSION, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const people = (n) => Array.from({ length: n }, (_, i) =>
  ({ id: 'c' + i, email: `p${i}@example.test`, first_name: 'P', last_name: String(i) }))
function bulkDb(n) {
  return fakeDb((q) => {
    if (q.table === 'distribution_list_members') return { data: people(n).map((c) => ({ contacts: c })), error: null }
    if (q.table === 'contacts') return { data: people(n), error: null }
    if (q.table === 'email_outbound') return { data: { id: 'out-1' }, error: null }
    if (q.table === 'email_outbound_recipients') return { data: [], error: null }
    if (q.table === 'tasks') return { data: null, error: null }
    throw new Error('unexpected table ' + q.table)
  })
}
const listSend = { subject: 'Hello', htmlBody: '<p>Hello</p>', distributionListId: 'dl-1' }

await test('crm-send-bulk-email: a list over the default 500 -> 400 before anything is written or sent', async () => {
  const db = bulkDb(501)
  const calls = mockFetch()
  const r = await H.bulk(staffPost(bulkUrl, listSend))
  assert.equal(r.status, 400)
  assert.deepEqual(await r.json(), { error: 'Too many recipients: 501 (limit 500)' })
  assert.deepEqual(db.queries.map((q) => q.table), ['distribution_list_members'])
  assert.equal(resendCalls(calls).length, 0)
})

await test('crm-send-bulk-email: a list of exactly 500 is sent, one Resend call each', async () => {
  bulkDb(500)
  const calls = mockFetch()
  const r = await H.bulk(staffPost(bulkUrl, listSend))
  assert.equal(r.status, 200)
  const out = await r.json()
  assert.equal(out.totalRecipients, 500)
  assert.equal(out.successCount, 500)
  assert.equal(resendCalls(calls).length, 500)
})

await test('crm-send-bulk-email: CRM_BULK_EMAIL_MAX_RECIPIENTS moves the cap', async () => {
  process.env.CRM_BULK_EMAIL_MAX_RECIPIENTS = '3'
  bulkDb(4)
  let calls = mockFetch()
  let r = await H.bulk(staffPost(bulkUrl, listSend))
  assert.deepEqual(await r.json(), { error: 'Too many recipients: 4 (limit 3)' })
  assert.equal(resendCalls(calls).length, 0)
  bulkDb(3)
  calls = mockFetch()
  r = await H.bulk(staffPost(bulkUrl, listSend))
  assert.equal(r.status, 200)
  assert.equal(resendCalls(calls).length, 3)

  process.env.CRM_BULK_EMAIL_MAX_RECIPIENTS = '800'
  bulkDb(801)
  mockFetch()
  r = await H.bulk(staffPost(bulkUrl, listSend))
  assert.deepEqual(await r.json(), { error: 'Too many recipients: 801 (limit 800)' })
})

await test('crm-send-bulk-email: an invalid override means 500; a huge one stops at 5000', async () => {
  for (const v of ['abc', '0', '-5', '2.5', '', ' ', '1e2x']) {
    process.env.CRM_BULK_EMAIL_MAX_RECIPIENTS = v
    bulkDb(501)
    mockFetch()
    const r = await H.bulk(staffPost(bulkUrl, listSend))
    assert.deepEqual(await r.json(), { error: 'Too many recipients: 501 (limit 500)' }, 'override ' + JSON.stringify(v))
  }
  process.env.CRM_BULK_EMAIL_MAX_RECIPIENTS = '999999'
  bulkDb(5001)
  const calls = mockFetch()
  const r = await H.bulk(staffPost(bulkUrl, listSend))
  assert.deepEqual(await r.json(), { error: 'Too many recipients: 5001 (limit 5000)' })
  assert.equal(resendCalls(calls).length, 0)
})

await test('crm-send-bulk-email: too many recipientContactIds -> 400 before the contacts lookup', async () => {
  const db = bulkDb(0)
  mockFetch()
  const ids = Array.from({ length: 501 }, (_, i) => 'c' + i)
  const r = await H.bulk(staffPost(bulkUrl, { subject: 'Hi', htmlBody: '<p>x</p>', recipientContactIds: ids }))
  assert.deepEqual(await r.json(), { error: 'Too many recipients: 501 (limit 500)' })
  assert.equal(db.queries.length, 0)
})

await test('crm-send-bulk-email: signed in but not CRM staff -> 403, the database is never opened', async () => {
  const db = bulkDb(2)
  const calls = mockFetch({ crm: false })
  const r = await H.bulk(staffPost(bulkUrl, listSend))
  assert.equal(r.status, 403)
  assert.equal(db.clients.length, 0)
  assert.equal(resendCalls(calls).length, 0)
  const r2 = await H.bulk(new Request(bulkUrl, { method: 'POST', body: JSON.stringify(listSend) }))
  assert.equal(r2.status, 401)
})

// ---------------------------------------------------------------- the two jobs

const syncUrl = BASE + '/functions/v1/crm-outlook-sync'
const weeklyUrl = BASE + '/functions/v1/crm-weekly-diligence-report'

await test('crm-outlook-sync: Bearer <service role key> and x-cron-secret start it; nothing else does', async () => {
  for (const headers of [{ Authorization: 'Bearer ' + SERVICE_ROLE }, { Authorization: 'Bearer ' + ANON, 'x-cron-secret': CRON }]) {
    const db = fakeDb((q) => {
      if (q.table === 'mailboxes') return { data: [], error: null }
      throw new Error('unexpected table ' + q.table)
    })
    const r = await H.sync(new Request(syncUrl, { method: 'POST', headers }))
    assert.equal(r.status, 200, JSON.stringify(headers))
    assert.deepEqual(await r.json(), { success: true, results: [] })
    assert.equal(db.clients.length, 1)
  }
  for (const headers of [{}, { Authorization: 'Bearer ' + ANON }, { Authorization: 'Bearer ' + SESSION },
    { Authorization: 'Bearer ' + SERVICE_ROLE.slice(0, -1) + 'X' }, { 'x-cron-secret': SERVICE_ROLE },
    { Authorization: 'Bearer undefined' }]) {
    const db = fakeDb(() => { throw new Error('database opened') })
    const r = await H.sync(new Request(syncUrl, { method: 'POST', headers }))
    assert.equal(r.status, 401, JSON.stringify(headers))
    assert.equal(db.clients.length, 0)
  }
})

await test('crm-weekly-diligence-report: service role Bearer starts it; account fields in the email are escaped', async () => {
  const evil = '<script>alert(1)</script> & Co'
  fakeDb((q) => {
    if (q.table === 'accounts') {
      return { data: [{ id: 'a1', firm_name: evil, tier: 'Tier 1', type: 'Prospect', category: '<b>cat</b>', aum: 5 }], error: null }
    }
    if (q.table === 'tasks') return { data: [], error: null }
    if (q.table === 'email_outbound') return { data: [], error: null }
    if (q.table === 'distribution_lists') return { data: { id: 'dl-1', name: 'Weekly Diligence Report Recipients' }, error: null }
    if (q.table === 'distribution_list_members') return { data: [{ contacts: { email: 'ops@example.test' } }], error: null }
    throw new Error('unexpected table ' + q.table)
  })
  const calls = mockFetch()
  const r = await H.weekly(new Request(weeklyUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + SERVICE_ROLE } }))
  assert.equal(r.status, 200)
  const sent = resendCalls(calls)
  assert.equal(sent.length, 1)
  const html = JSON.parse(sent[0].init.body).html
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co'), 'escaped firm name')
  assert.ok(html.includes('&lt;b&gt;cat&lt;/b&gt;'), 'escaped category')
  assert.ok(!html.includes('<script>alert(1)'), 'raw firm name in the email')
  assert.ok(!html.includes('<b>cat</b>'), 'raw category in the email')

  const db = fakeDb(() => { throw new Error('database opened') })
  const r2 = await H.weekly(new Request(weeklyUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + ANON } }))
  assert.equal(r2.status, 401)
  assert.equal(db.clients.length, 0)
})

// ---------------------------------------------------------------- crm-search

await test("crm-search: O'Brien reaches .or() intact; brackets and commas cannot add a filter term", async () => {
  const seen = []
  fakeDb((q) => {
    seen.push(q)
    return { data: [], error: null }
  })
  mockFetch()
  const ask = (q) => H.search(new Request(BASE + '/functions/v1/crm-search?q=' + encodeURIComponent(q), {
    headers: { Authorization: 'Bearer ' + SESSION },
  }))
  let r = await ask("O'Brien")
  assert.equal(r.status, 200)
  const orOf = (table) => seen.filter((q) => q.table === table).pop().ops.find((o) => o[0] === 'or')[1]
  assert.equal(orOf('accounts'), "firm_name.ilike.%O'Brien%,website.ilike.%O'Brien%")
  r = await ask('a),id.not.is.null,(b')
  assert.equal(r.status, 200)
  assert.equal(orOf('accounts'), 'firm_name.ilike.%a__id.not.is.null__b%,website.ilike.%a__id.not.is.null__b%')
  assert.equal(orOf('contacts'),
    'first_name.ilike.%a__id.not.is.null__b%,last_name.ilike.%a__id.not.is.null__b%,email.ilike.%a__id.not.is.null__b%')
})

// ---------------------------------------------------------------- report

await test('nothing the handlers logged contains a key, token or secret', async () => {
  for (const line of logged) {
    for (const s of [ANON, SERVICE_ROLE, CRON, RESEND_KEY, SESSION, WHSEC, KEY.toString('base64')]) {
      assert.ok(!line.includes(s), 'logged a secret: ' + line.slice(0, 120))
    }
  }
})

let failed = 0
for (const [ok, name, err] of results) {
  print((ok ? 'PASS ' : 'FAIL ') + name)
  if (!ok) {
    failed++
    print('     ' + String((err && err.stack) || err).split('\n').slice(0, 5).join('\n     '))
  }
}
print(`\n${results.length - failed}/${results.length} passed (${logged.length} handler log lines kept out of the output)`)
process.exit(failed ? 1 : 0)
