// api/market.js - the signed-in-only market data proxy (2026-10-21).
// Drives the real handler with fake req/res and a fake fetch: no network. Every case asserts what reached the vendor
// (or that nothing did). Run: node tests/security/market_proxy_check.mjs
import assert from 'node:assert/strict';

// Fake Supabase, so a bug here could never reach the real project. Set BEFORE lib/flowAuth.js is imported.
process.env.SUPABASE_URL = 'https://supabase.test.invalid';
process.env.SUPABASE_ANON_KEY = 'DUMMY_ANON_KEY_000';

const KEYS = {
  FMP_API_KEY: 'DUMMY_FMP_KEY_123456',
  TWELVE_DATA_API_KEY: 'DUMMY_TD_KEY_123456',
  ALPHA_VANTAGE_API_KEY: 'DUMMY_AV_KEY_123456',
};
const KEY_ENV = ['FMP_API_KEY', 'TWELVE_DATA_API_KEY', 'ALPHA_VANTAGE_API_KEY',
  'REACT_APP_FMP_API_KEY', 'REACT_APP_TWELVE_DATA_API_KEY', 'REACT_APP_ALPHA_VANTAGE_API_KEY'];
function setKeys(map) {
  for (const k of KEY_ENV) delete process.env[k];
  Object.assign(process.env, map);
}

const USERS = {
  'Bearer GOOD_TOKEN': { id: 'u1', email: 'analyst@clearlinecap.com', email_confirmed_at: '2026-01-01T00:00:00Z' },
  'Bearer OUTSIDER_TOKEN': { id: 'u2', email: 'someone@gmail.com', email_confirmed_at: '2026-01-01T00:00:00Z' },
  'Bearer UNCONFIRMED_TOKEN': { id: 'u3', email: 'new@clearlinecap.com' },
};

let vendorCalls = [];
let vendorReply = () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input.url || String(input));
  if (url.startsWith('https://supabase.test.invalid/auth/v1/user')) {
    const h = init.headers || {};
    const u = USERS[h.Authorization || h.authorization];
    return u ? new Response(JSON.stringify(u), { status: 200 }) : new Response('{"msg":"bad jwt"}', { status: 401 });
  }
  const host = new URL(url).host;
  if (['financialmodelingprep.com', 'api.twelvedata.com', 'www.alphavantage.co'].includes(host)) {
    vendorCalls.push({ url, init });
    return vendorReply(url, init);
  }
  throw new Error('unexpected network call to ' + host);
};

const { default: handler } = await import('../../api/market.js');

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    json(o) { this.body = JSON.stringify(o); this.jsonBody = o; return this; },
    send(b) { this.body = b; return this; },
  };
}
async function call(query, { method = 'GET', auth = 'Bearer GOOD_TOKEN' } = {}) {
  const res = fakeRes();
  const headers = auth ? { authorization: auth } : {};
  await handler({ method, url: '/api/market?' + query, headers }, res);
  return res;
}
const qs = (o) => new URLSearchParams(o).toString();
// n distinct made-up tickers as a comma list, e.g. SYMS(3) = 'T0,T1,T2'.
const SYMS = (n) => Array.from({ length: n }, (_, i) => 'T' + i).join(',');
function params(url) {
  return [...new URL(url).searchParams].map(([k, v]) => k + '=' + v).sort();
}

let passed = 0;
async function check(name, fn) {
  vendorCalls = [];
  setKeys(KEYS);
  vendorReply = () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    await fn();
    passed++;
    console.log('ok   ' + name);
  } catch (e) {
    console.log('FAIL ' + name);
    throw e;
  }
}
function noKeyIn(res) {
  for (const k of Object.values(KEYS)) assert.ok(!String(res.body).includes(k), 'reply must not echo a key');
}

// --- who may call -------------------------------------------------------------------------------------------------
await check('POST -> 405, nothing fetched', async () => {
  const res = await call(qs({ v: 'td', p: '/quote', symbol: 'AAPL' }), { method: 'POST' });
  assert.equal(res.statusCode, 405);
  assert.equal(vendorCalls.length, 0);
});
for (const [label, auth] of [['no session', null], ['bad token', 'Bearer NOPE'], ['not Bearer', 'Basic abc'],
  ['outside domain', 'Bearer OUTSIDER_TOKEN'], ['unconfirmed email', 'Bearer UNCONFIRMED_TOKEN']]) {
  await check(label + ' -> 401, no vendor call', async () => {
    const res = await call(qs({ v: 'td', p: '/quote', symbol: 'AAPL' }), { auth });
    assert.equal(res.statusCode, 401);
    assert.equal(vendorCalls.length, 0);
    noKeyIn(res);
  });
}

// --- every allowlisted path -----------------------------------------------------------------------------------------
const ALLOWED = [
  // [query, expected origin, expected path, expected params (sorted, apikey included)]
  [{ v: 'fmp', p: '/api/v3/quote/AAPL' }, 'https://financialmodelingprep.com', '/api/v3/quote/AAPL', ['apikey=' + KEYS.FMP_API_KEY]],
  [{ v: 'fmp', p: '/api/v3/quote/7203.T' }, 'https://financialmodelingprep.com', '/api/v3/quote/7203.T', ['apikey=' + KEYS.FMP_API_KEY]],
  [{ v: 'fmp', p: '/api/v3/quote/BT-A.L' }, 'https://financialmodelingprep.com', '/api/v3/quote/BT-A.L', ['apikey=' + KEYS.FMP_API_KEY]],
  [{ v: 'fmp', p: '/api/v3/quote/SPY,QQQ' }, 'https://financialmodelingprep.com', '/api/v3/quote/SPY,QQQ', ['apikey=' + KEYS.FMP_API_KEY]],
  [{ v: 'fmp', p: '/api/v3/quote/^GSPC' }, 'https://financialmodelingprep.com', '/api/v3/quote/^GSPC', ['apikey=' + KEYS.FMP_API_KEY]],
  [{ v: 'fmp', p: '/stable/market-capitalization', symbol: 'AAPL' }, 'https://financialmodelingprep.com', '/stable/market-capitalization', ['apikey=' + KEYS.FMP_API_KEY, 'symbol=AAPL']],
  [{ v: 'fmp', p: '/stable/earnings', symbol: 'BRK.B' }, 'https://financialmodelingprep.com', '/stable/earnings', ['apikey=' + KEYS.FMP_API_KEY, 'symbol=BRK.B']],
  [{ v: 'td', p: '/quote', symbol: '7203:TSE' }, 'https://api.twelvedata.com', '/quote', ['apikey=' + KEYS.TWELVE_DATA_API_KEY, 'symbol=7203:TSE']],
  [{ v: 'td', p: '/quote', symbol: 'SPY,QQQ,BT.A:LSE' }, 'https://api.twelvedata.com', '/quote', ['apikey=' + KEYS.TWELVE_DATA_API_KEY, 'symbol=SPY,QQQ,BT.A:LSE']],
  [{ v: 'td', p: '/price', symbol: 'AAPL' }, 'https://api.twelvedata.com', '/price', ['apikey=' + KEYS.TWELVE_DATA_API_KEY, 'symbol=AAPL']],
  [{ v: 'td', p: '/profile', symbol: '005930:KRX' }, 'https://api.twelvedata.com', '/profile', ['apikey=' + KEYS.TWELVE_DATA_API_KEY, 'symbol=005930:KRX']],
  [{ v: 'td', p: '/time_series', symbol: 'AAPL', interval: '1day', outputsize: '90' }, 'https://api.twelvedata.com', '/time_series',
    ['apikey=' + KEYS.TWELVE_DATA_API_KEY, 'interval=1day', 'outputsize=90', 'symbol=AAPL']],
  [{ v: 'td', p: '/earnings', symbol: 'MSFT' }, 'https://api.twelvedata.com', '/earnings', ['apikey=' + KEYS.TWELVE_DATA_API_KEY, 'symbol=MSFT']],
  [{ v: 'td', p: '/symbol_search', symbol: 'toyota motor & co' }, 'https://api.twelvedata.com', '/symbol_search',
    ['apikey=' + KEYS.TWELVE_DATA_API_KEY, 'symbol=toyota motor & co']],
  [{ v: 'av', p: '/query', function: 'OVERVIEW', symbol: 'IBM' }, 'https://www.alphavantage.co', '/query',
    ['apikey=' + KEYS.ALPHA_VANTAGE_API_KEY, 'function=OVERVIEW', 'symbol=IBM']],
  // 2026-10-21: right at the size caps - still allowed.
  [{ v: 'td', p: '/quote', symbol: SYMS(30) }, 'https://api.twelvedata.com', '/quote', ['apikey=' + KEYS.TWELVE_DATA_API_KEY, 'symbol=' + SYMS(30)]],
  [{ v: 'td', p: '/time_series', symbol: SYMS(25), interval: '1day', outputsize: '500' }, 'https://api.twelvedata.com', '/time_series',
    ['apikey=' + KEYS.TWELVE_DATA_API_KEY, 'interval=1day', 'outputsize=500', 'symbol=' + SYMS(25)]],
  [{ v: 'td', p: '/time_series', symbol: 'AAPL', interval: '1day', outputsize: '1' }, 'https://api.twelvedata.com', '/time_series',
    ['apikey=' + KEYS.TWELVE_DATA_API_KEY, 'interval=1day', 'outputsize=1', 'symbol=AAPL']],
  [{ v: 'fmp', p: '/api/v3/quote/' + SYMS(30) }, 'https://financialmodelingprep.com', '/api/v3/quote/' + SYMS(30), ['apikey=' + KEYS.FMP_API_KEY]],
];
for (const [q, origin, path, want] of ALLOWED) {
  await check(`allowed ${q.v} ${q.p} -> forwarded with the server key`, async () => {
    const body = JSON.stringify({ echo: q.p, n: 1 });
    vendorReply = () => new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
    const res = await call(qs(q));
    assert.equal(vendorCalls.length, 1);
    const u = new URL(vendorCalls[0].url);
    assert.equal(u.origin, origin);
    assert.equal(decodeURIComponent(u.pathname), path);
    assert.deepEqual(params(vendorCalls[0].url), want);
    assert.ok(vendorCalls[0].init.signal instanceof AbortSignal, 'vendor call has a timeout signal');
    assert.equal(vendorCalls[0].init.redirect, 'manual', 'vendor redirects are never followed');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, body);
    assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(res.headers['cache-control'], 'private, no-store');
  });
}

// --- the vendor's answer passes through, minus anything dangerous --------------------------------------------------
await check('vendor status passes through (429 rate limit)', async () => {
  vendorReply = () => new Response('{"code":429,"message":"run out of credits"}', { status: 429, headers: { 'content-type': 'application/json' } });
  const res = await call(qs({ v: 'td', p: '/quote', symbol: 'AAPL' }));
  assert.equal(res.statusCode, 429);
  assert.equal(res.body, '{"code":429,"message":"run out of credits"}');
});
await check('vendor HTML is relabelled as JSON (never rendered as our page)', async () => {
  vendorReply = () => new Response('<html><script>alert(1)</script></html>', { status: 502, headers: { 'content-type': 'text/html' } });
  const res = await call(qs({ v: 'fmp', p: '/stable/earnings', symbol: 'AAPL' }));
  assert.equal(res.statusCode, 502);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});
await check('a vendor reply that echoes the key has it blanked out', async () => {
  vendorReply = (url) => new Response(JSON.stringify({ error: 'bad request ' + url }), { status: 400, headers: { 'content-type': 'application/json' } });
  const res = await call(qs({ v: 'td', p: '/quote', symbol: 'AAPL' }));
  assert.equal(res.statusCode, 400);
  noKeyIn(res);
  assert.ok(res.body.includes('[redacted]'));
});
await check('vendor unreachable -> 502, no key and no vendor URL in the reply', async () => {
  vendorReply = (url) => { throw new TypeError('fetch failed for ' + url); };
  const res = await call(qs({ v: 'td', p: '/quote', symbol: 'AAPL' }));
  assert.equal(res.statusCode, 502);
  noKeyIn(res);
  assert.ok(!res.body.includes('twelvedata'), 'no vendor URL in the reply');
});
await check('vendor redirect -> 502, not followed, and neither the key nor the target in the reply', async () => {
  vendorReply = (url) => new Response('moved to https://evil.example/collect?k=' + new URL(url).searchParams.get('apikey'),
    { status: 302, headers: { location: 'https://evil.example/collect', 'content-type': 'text/plain' } });
  const res = await call(qs({ v: 'fmp', p: '/stable/earnings', symbol: 'AAPL' }));
  assert.equal(res.statusCode, 502);
  assert.equal(res.jsonBody.error, 'market data vendor redirected');
  assert.equal(vendorCalls.length, 1, 'only the first hop, to the vendor itself');
  noKeyIn(res);
  assert.ok(!res.body.includes('evil.example'));
});
await check('vendor timeout -> 504', async () => {
  vendorReply = () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; };
  const res = await call(qs({ v: 'av', p: '/query', function: 'OVERVIEW', symbol: 'IBM' }));
  assert.equal(res.statusCode, 504);
  noKeyIn(res);
});

// --- outside the allowlist: 400 and the vendor never hears of it ---------------------------------------------------
const DENIED = [
  qs({ p: '/quote', symbol: 'AAPL' }),
  qs({ v: 'xyz', p: '/quote' }),
  qs({ v: '__proto__', p: '/quote' }),
  qs({ v: 'constructor', p: '/quote' }),
  qs({ v: 'TD', p: '/quote', symbol: 'AAPL' }),
  qs({ v: 'td' }),
  qs({ v: 'td', p: '/api_usage' }),
  qs({ v: 'td', p: '/quote/../api_usage' }),
  qs({ v: 'td', p: '/quote/' }),
  qs({ v: 'td', p: 'quote' }),
  qs({ v: 'td', p: '//evil.example/quote' }),
  qs({ v: 'td', p: '/statistics', symbol: 'AAPL' }),
  qs({ v: 'fmp', p: '/api/v3/profile/AAPL' }),
  qs({ v: 'fmp', p: '/api/v3/quote/' }),
  qs({ v: 'fmp', p: '/api/v3/quote/..' }),
  qs({ v: 'fmp', p: '/api/v3/quote/.' }),
  qs({ v: 'fmp', p: '/api/v3/quote/../../api/v4/insider-trading' }),
  qs({ v: 'fmp', p: '/api/v3/quote/AAPL/../../v4/x' }),
  qs({ v: 'fmp', p: '/api/v3/quote/AAPL?apikey=x' }),
  qs({ v: 'fmp', p: '/api/v3/quote/AAPL#frag' }),
  qs({ v: 'fmp', p: '/api/v3/quote/%2e%2e' }),
  qs({ v: 'fmp', p: '/api/v3/quote/A%2FB' }),
  qs({ v: 'fmp', p: '/api/v3/quote/A\\B' }),
  qs({ v: 'fmp', p: '/api/v3/quote/<script>' }),
  qs({ v: 'fmp', p: '/api/v3/quote/' + 'A'.repeat(201) }),
  qs({ v: 'fmp', p: '/api/v3/quote/AAPL\n' }),
  qs({ v: 'fmp', p: '/stable/earnings/' }),
  qs({ v: 'fmp', p: '/stable/insider-trading', symbol: 'AAPL' }),
  qs({ v: 'fmp', p: '/quote', symbol: 'AAPL' }),
  qs({ v: 'av', p: '/query', function: 'TIME_SERIES_DAILY', symbol: 'IBM' }),
  qs({ v: 'av', p: '/query', symbol: 'IBM' }),
  qs({ v: 'av', p: '/query', function: 'overview', symbol: 'IBM' }),
  qs({ v: 'av', p: '/query', Function: 'OVERVIEW', symbol: 'IBM' }),
  'v=av&p=%2Fquery&function=OVERVIEW&function=TIME_SERIES_DAILY&symbol=IBM',
  'v=av&p=%2Fquery&function=OVERVIEW&FUNCTION=NEWS_SENTIMENT&symbol=IBM',
  qs({ v: 'av', p: '/query/x', function: 'OVERVIEW', symbol: 'IBM' }),
  // 2026-10-21: size caps - at most 30 symbols (the page's largest chunk) and outputsize 1..500 (the page asks for 90).
  qs({ v: 'td', p: '/quote', symbol: SYMS(31) }),
  qs({ v: 'td', p: '/time_series', symbol: SYMS(31), interval: '1day', outputsize: '90' }),
  qs({ v: 'td', p: '/symbol_search', symbol: SYMS(31) }),
  qs({ v: 'fmp', p: '/api/v3/quote/' + SYMS(31) }),
  qs({ v: 'fmp', p: '/stable/earnings', symbol: SYMS(31) }),
  qs({ v: 'td', p: '/time_series', symbol: 'AAPL', interval: '1day', outputsize: '501' }),
  qs({ v: 'td', p: '/time_series', symbol: 'AAPL', interval: '1day', outputsize: '5000' }),
  qs({ v: 'td', p: '/time_series', symbol: 'AAPL', interval: '1day', outputsize: '0' }),
  qs({ v: 'td', p: '/time_series', symbol: 'AAPL', interval: '1day', outputsize: '90.5' }),
  qs({ v: 'td', p: '/time_series', symbol: 'AAPL', interval: '1day', outputsize: '-1' }),
  qs({ v: 'td', p: '/time_series', symbol: 'AAPL', interval: '1day', outputsize: '' }),
  qs({ v: 'td', p: '/time_series', symbol: 'AAPL', interval: '1day', outputsize: 'undefined' }),
  // ... and each param once, so a second symbol / outputsize cannot ride past those caps.
  'v=td&p=%2Fquote&symbol=AAPL&symbol=MSFT',
  'v=td&p=%2Fquote&symbol=AAPL&Symbol=MSFT',
  'v=td&p=%2Ftime_series&symbol=AAPL&interval=1day&outputsize=90&outputsize=5000',
  'v=td&p=%2Ftime_series&symbol=AAPL&interval=1day&outputsize=90&OUTPUTSIZE=5000',
];
for (const q of DENIED) {
  await check('denied ' + decodeURIComponent(q).replace(/\n/g, '\\n') + ' -> 400, no vendor call', async () => {
    const res = await call(q);
    assert.equal(res.statusCode, 400);
    assert.equal(vendorCalls.length, 0);
    noKeyIn(res);
  });
}
for (const [q, why] of [
  [qs({ v: 'td', p: '/quote', symbol: SYMS(31) }), 'too many symbols in one market data request'],
  [qs({ v: 'fmp', p: '/api/v3/quote/' + SYMS(31) }), 'too many symbols in one market data request'],
  [qs({ v: 'td', p: '/time_series', symbol: 'AAPL', interval: '1day', outputsize: '501' }), 'market data outputsize not allowed'],
  ['v=td&p=%2Fquote&symbol=AAPL&Symbol=MSFT', 'repeated market data param'],
]) {
  await check('denied for the right reason: ' + why, async () => {
    const res = await call(q);
    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody.error, why);
    assert.equal(vendorCalls.length, 0);
  });
}
await check('the session is checked before the allowlist (unknown vendor, no session -> 401)', async () => {
  const res = await call(qs({ v: 'xyz', p: '/x' }), { auth: null });
  assert.equal(res.statusCode, 401);
  assert.equal(vendorCalls.length, 0);
});

// --- the caller cannot choose the key -------------------------------------------------------------------------------
await check('caller apikey / token / api_key params are dropped; only the server key goes out', async () => {
  const res = await call('v=td&p=%2Fquote&symbol=AAPL&apikey=CALLER_KEY&token=CALLER_TOKEN&APIKEY=X&ApiKey=Y&api_key=Z&V=fmp&P=%2Fx');
  assert.equal(res.statusCode, 200);
  assert.equal(vendorCalls.length, 1);
  assert.deepEqual(params(vendorCalls[0].url), ['apikey=' + KEYS.TWELVE_DATA_API_KEY, 'symbol=AAPL']);
});
await check('FMP_API_KEY wins over REACT_APP_FMP_API_KEY', async () => {
  setKeys({ FMP_API_KEY: 'DUMMY_SERVER_NAME_KEY', REACT_APP_FMP_API_KEY: 'DUMMY_OLD_NAME_KEY' });
  await call(qs({ v: 'fmp', p: '/stable/earnings', symbol: 'AAPL' }));
  assert.equal(new URL(vendorCalls[0].url).searchParams.get('apikey'), 'DUMMY_SERVER_NAME_KEY');
});
for (const [v, p, extra, envName] of [['fmp', '/stable/earnings', {}, 'REACT_APP_FMP_API_KEY'],
  ['td', '/quote', {}, 'REACT_APP_TWELVE_DATA_API_KEY'], ['av', '/query', { function: 'OVERVIEW' }, 'REACT_APP_ALPHA_VANTAGE_API_KEY']]) {
  await check(`${v}: falls back to ${envName} (today's Vercel setting)`, async () => {
    setKeys({ [envName]: 'DUMMY_FALLBACK_KEY_1' });
    const res = await call(qs({ v, p, symbol: 'AAPL', ...extra }));
    assert.equal(res.statusCode, 200);
    assert.equal(new URL(vendorCalls[0].url).searchParams.get('apikey'), 'DUMMY_FALLBACK_KEY_1');
  });
  await check(`${v}: no key configured -> 503, no vendor call`, async () => {
    setKeys({});
    const res = await call(qs({ v, p, symbol: 'AAPL', ...extra }));
    assert.equal(res.statusCode, 503);
    assert.equal(res.jsonBody.error, 'market data not configured');
    assert.equal(vendorCalls.length, 0);
  });
}

console.log(`\nmarket_proxy_check: ${passed} checks passed`);
