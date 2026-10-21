// The /api/market rewrite asks the vendors for exactly what the old page asked for (2026-10-21).
//
// For EVERY vendor call site in src/App.js this rebuilds:
//   OLD - the vendor URL the previous code produced, from its own template literal (read from git, not retyped), with a
//         dummy key;
//   NEW - the /api/market URL the new code builds (its marketUrl(...) call, run through the real src/marketApi.js),
//         sent through the real api/market.js with a fake fetch, and the vendor URL the proxy then fetched.
// and asserts the two hit the same origin and path with the same query params (as a multiset, after decoding).
// No network: Supabase and the vendors are a fake fetch. Run: node tests/security/market_equivalence_check.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The previous code. HEAD while this change is uncommitted; once it is committed HEAD holds the new code, so fall back
// to the last commit before the rewrite (on origin/main). MARKET_OLD_REF overrides both.
const PRE_REWRITE = '33f4a09d06a7d0e4af50d4198f5543b7d1044620';
function gitShow(ref) {
  return execFileSync('git', ['show', ref + ':src/App.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
let oldRef = process.env.MARKET_OLD_REF || 'HEAD';
let OLD = gitShow(oldRef);
if (!process.env.MARKET_OLD_REF && !OLD.includes('process.env.REACT_APP_TWELVE_DATA_API_KEY')) {
  oldRef = PRE_REWRITE;
  OLD = gitShow(oldRef);
}
const NEW = readFileSync(path.join(ROOT, 'src', 'App.js'), 'utf8');
console.log('old code from git ' + oldRef + '; new code from the working tree');

// --- where the calls are ---------------------------------------------------------------------------------------------
function methodAt(lines, i) {
  for (let j = i; j >= 0; j--) {
    const m = /^ {2}async (\w+)\(/.exec(lines[j]);
    if (m) return m[1];
  }
  throw new Error('no enclosing method for line ' + (i + 1));
}
function oldSites(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    const m = /^\s*const url = `(.*)`;\s*$/.exec(line);
    if (m && /TWELVE_DATA_BASE_URL|FMP_BASE_URL|ALPHA_VANTAGE_BASE_URL|financialmodelingprep\.com|twelvedata\.com|alphavantage\.co/.test(m[1])) {
      out.push({ method: methodAt(lines, i), tpl: m[1], line: i + 1 });
    }
  });
  return out;
}
function newSites(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    const m = /^\s*const url = marketUrl\((.*)\);\s*$/.exec(line);
    if (m) {
      // The URL must then be fetched signed in, by the very next fetch in the method.
      const after = lines.slice(i + 1, i + 8).join('\n');
      assert.match(after, /await marketFetchUrl\(url\)/, 'line ' + (i + 1) + ': marketUrl result is not fetched with marketFetchUrl');
      out.push({ method: methodAt(lines, i), args: m[1], line: i + 1 });
    }
  });
  return out;
}
const olds = oldSites(OLD);
const news = newSites(NEW);
assert.ok(olds.length >= 13, 'expected the 13 old vendor call sites, found ' + olds.length);
assert.deepEqual(news.map((s) => s.method), olds.map((s) => s.method), 'every old call site has exactly one new one, in the same method');

// Nothing in the page still talks to a vendor or reads a key.
for (const banned of [/REACT_APP_FMP_API_KEY/, /REACT_APP_TWELVE_DATA_API_KEY/, /REACT_APP_ALPHA_VANTAGE_API_KEY/,
  /financialmodelingprep\.com/, /api\.twelvedata\.com/, /alphavantage\.co/, /apikey=/]) {
  assert.ok(!banned.test(NEW), 'src/App.js still contains ' + banned);
}

const consts = {};
for (const name of ['TWELVE_DATA_BASE_URL', 'FMP_BASE_URL', 'ALPHA_VANTAGE_BASE_URL']) {
  const m = new RegExp('^const ' + name + " = '([^']+)';", 'm').exec(OLD);
  assert.ok(m, 'old ' + name + ' not found');
  consts[name] = m[1];
}

// --- the real marketUrl (src/marketApi.js), with the session lookup stubbed out ---------------------------------------
const apiSrc = readFileSync(path.join(ROOT, 'src', 'marketApi.js'), 'utf8');
const importLine = "import { flowAuthHeaders } from './flowAuthHeaders';";
assert.equal(apiSrc.split(importLine).length, 2, 'src/marketApi.js import line changed - update this test');
const marketApi = await import('data:text/javascript;base64,' +
  Buffer.from(apiSrc.replace(importLine, "const flowAuthHeaders = async () => ({ Authorization: 'Bearer STUB_SESSION' });")).toString('base64'));

// marketFetch / marketFetchUrl send the session header (and keep the caller's own headers).
{
  const seen = [];
  globalThis.fetch = async (url, init) => { seen.push({ url, init }); return new Response('[]'); };
  await marketApi.marketFetch('td', '/quote', { symbol: 'AAPL' }, { headers: { 'X-Extra': '1' } });
  await marketApi.marketFetchUrl(marketApi.marketUrl('av', '/query', { function: 'OVERVIEW', symbol: 'IBM' }));
  assert.equal(seen[0].url, '/api/market?v=td&p=%2Fquote&symbol=AAPL');
  assert.deepEqual(seen[0].init.headers, { 'X-Extra': '1', Authorization: 'Bearer STUB_SESSION' });
  assert.equal(seen[1].url, '/api/market?v=av&p=%2Fquery&function=OVERVIEW&symbol=IBM');
  assert.deepEqual(seen[1].init.headers, { Authorization: 'Bearer STUB_SESSION' });
  console.log('ok   marketFetch / marketFetchUrl carry the session header');
}

// --- the real proxy, with Supabase and the vendors faked -------------------------------------------------------------
process.env.SUPABASE_URL = 'https://supabase.test.invalid';
process.env.SUPABASE_ANON_KEY = 'DUMMY_ANON_KEY_000';
const KEYS = { FMP_API_KEY: 'DUMMY_FMP_KEY_123456', TWELVE_DATA_API_KEY: 'DUMMY_TD_KEY_123456', ALPHA_VANTAGE_API_KEY: 'DUMMY_AV_KEY_123456' };
Object.assign(process.env, KEYS);
let fetched = [];
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input.url || String(input));
  if (url.startsWith('https://supabase.test.invalid/auth/v1/user')) {
    return new Response(JSON.stringify({ id: 'u1', email: 'analyst@clearlinecap.com', email_confirmed_at: '2026-01-01T00:00:00Z' }), { status: 200 });
  }
  const host = new URL(url).host;
  if (['financialmodelingprep.com', 'api.twelvedata.com', 'www.alphavantage.co'].includes(host)) {
    fetched.push(url);
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error('unexpected network call to ' + host);
};
const { default: handler } = await import('../../api/market.js');

async function callProxy(marketPath) {
  fetched = [];
  const res = {
    statusCode: 200, headers: {}, body: undefined,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    json(o) { this.body = JSON.stringify(o); return this; },
    send(b) { this.body = b; return this; },
  };
  await handler({ method: 'GET', url: marketPath, headers: { authorization: 'Bearer GOOD_TOKEN' } }, res);
  return { res, fetched: fetched.slice() };
}
async function viaProxy(marketPath) {
  const { res, fetched: f } = await callProxy(marketPath);
  assert.equal(res.statusCode, 200, 'proxy refused ' + marketPath + ': ' + res.body);
  assert.equal(f.length, 1);
  return f[0];
}

// --- compare ---------------------------------------------------------------------------------------------------------
const SCOPE_NAMES = ['TWELVE_DATA_BASE_URL', 'FMP_BASE_URL', 'ALPHA_VANTAGE_BASE_URL',
  'TWELVE_DATA_API_KEY', 'FMP_API_KEY', 'ALPHA_VANTAGE_API_KEY',
  'fmpSymbol', 'convertedSymbol', 'cleanSymbol', 'keywords', 'chunk', 'days'];
function scope(sym, days) {
  return { ...consts, ...KEYS, fmpSymbol: sym, convertedSymbol: sym, cleanSymbol: sym, keywords: sym, chunk: sym.split(','), days };
}
function shape(url) {
  const u = new URL(url);
  return {
    origin: u.origin,
    path: decodeURIComponent(u.pathname),
    params: [...u.searchParams].map(([k, v]) => JSON.stringify([k, v])).sort(),
  };
}

const SYMBOLS = ['AAPL', 'BRK.B', '7203:TSE', '005930.KS', 'SPY,QQQ', 'AAPL,BRK.B,7203:TSE,005930.KS', 'BT.A:LSE', '^GSPC'];
let compared = 0;
for (let k = 0; k < olds.length; k++) {
  const o = olds[k];
  const n = news[k];
  const oldFn = new Function(...SCOPE_NAMES, 'return `' + o.tpl + '`;');
  const newFn = new Function('marketUrl', ...SCOPE_NAMES, 'return marketUrl(' + n.args + ');');
  for (const sym of SYMBOLS) {
    for (const days of [90, 30]) {
      const sc = scope(sym, days);
      const vals = SCOPE_NAMES.map((x) => sc[x]);
      const oldUrl = oldFn(...vals);
      const marketPath = newFn(marketApi.marketUrl, ...vals);
      assert.ok(marketPath.startsWith('/api/market?'), 'new call does not go to /api/market: ' + marketPath);
      assert.ok(!Object.values(KEYS).some((key) => marketPath.includes(key)), 'the page URL must not carry a key');
      const newUrl = await viaProxy(marketPath);
      assert.deepEqual(shape(newUrl), shape(oldUrl),
        `${o.method} (old line ${o.line}, new line ${n.line}) with ${JSON.stringify(sym)}:\n  old ${oldUrl}\n  new ${newUrl}`);
      compared++;
    }
  }
  console.log(`ok   ${o.method.padEnd(36)} old line ${String(o.line).padStart(5)} -> new line ${String(n.line).padStart(5)}  ${shape(oldFn(...SCOPE_NAMES.map((x) => scope('AAPL', 90)[x]))).path}`);
}

// --- symbols the old templates mangled: the one intended difference (2026-10-21) ---------------------------------------
// Seven old templates pasted the symbol into the query unencoded, so a '+' reached the vendor as a space, '&' split the
// param in two and '#' cut the rest of the URL (the key included) off. marketUrl encodes every value, so the vendor now
// gets the literal symbol. No ticker the page produces holds these characters; this pins the difference down:
//   - templates that already used encodeURIComponent: old == new, the same as for ordinary tickers;
//   - templates that pasted the symbol raw: old != new, and the new request carries the symbol exactly as given;
//   - the FMP quote PATH (/api/v3/quote/<symbol>): refused with a 400 and no vendor call (SYMBOL_RE in api/market.js).
const ODD = ['A+B', 'M&M', 'A#B'];
const kinds = { encoded: 0, raw: 0, path: 0 };
let oddChecked = 0;
for (let k = 0; k < olds.length; k++) {
  const o = olds[k];
  const n = news[k];
  const kind = n.args.includes('/api/v3/quote/') ? 'path' : (o.tpl.includes('encodeURIComponent(') ? 'encoded' : 'raw');
  kinds[kind]++;
  const oldFn = new Function(...SCOPE_NAMES, 'return `' + o.tpl + '`;');
  const newFn = new Function('marketUrl', ...SCOPE_NAMES, 'return marketUrl(' + n.args + ');');
  for (const sym of ODD) {
    const sc = scope(sym, 90);
    const vals = SCOPE_NAMES.map((x) => sc[x]);
    const marketPath = newFn(marketApi.marketUrl, ...vals);
    const where = `${o.method} (new line ${n.line}) with ${JSON.stringify(sym)}`;
    oddChecked++;
    if (kind === 'path') {
      const { res, fetched: f } = await callProxy(marketPath);
      assert.equal(res.statusCode, 400, where + ': a path symbol outside ticker characters must be refused');
      assert.equal(f.length, 0, where + ': no vendor call');
      continue;
    }
    const got = shape(await viaProxy(marketPath));
    const symbols = got.params.map((x) => JSON.parse(x)).filter(([key]) => key === 'symbol');
    assert.deepEqual(symbols, [['symbol', sym]], where + ': the vendor must get the symbol exactly as given');
    const was = shape(oldFn(...vals));
    if (kind === 'encoded') assert.deepEqual(got, was, where + ': this template already encoded, so nothing changes');
    else assert.notDeepEqual(got, was, where + ': the old raw template mangled this symbol');
  }
}
assert.deepEqual(kinds, { encoded: 5, raw: 7, path: 1 }, 'call sites by how the old template placed the symbol');
console.log(`ok   symbols with + & # (${oddChecked} cases): ${kinds.encoded} sites unchanged, ${kinds.raw} sites now send the`
  + ` literal symbol (the old raw templates mangled it), the FMP quote path refuses them (400)`);

console.log(`\nmarket_equivalence_check: ${olds.length} call sites, ${compared} old/new URL pairs identical (origin, path, params), plus ${oddChecked} special-character cases`);
