// `npm start` + `npm run api:dev` still gets market data (2026-10-21).
//
// CRA's dev server sends /api/* to local-api-server.js (package.json "proxy"), which used to answer only
// POST /api/superllm-stream - so every GET /api/market came back 404 locally. It now hands GET /api/market to the real
// api/market.js. This starts local-api-server.js on a free local port, with Supabase pointed at a fake one on
// 127.0.0.1, and checks it answers with the handler's own replies. Requests that pass the sign-in check use a vendor or
// key setup that stops before any vendor call, so nothing leaves this machine. Run: node tests/security/market_local_dev_check.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const listen = (srv) => new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv.address().port)));

// Fake Supabase: one confirmed staff account.
const supa = http.createServer((req, res) => {
  const ok = req.url.startsWith('/auth/v1/user') && req.headers.authorization === 'Bearer GOOD_TOKEN';
  res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(ok ? { id: 'u1', email: 'analyst@clearlinecap.com', email_confirmed_at: '2026-01-01T00:00:00Z' } : { msg: 'bad jwt' }));
});
const supaPort = await listen(supa);
const free = net.createServer();
const port = await listen(free);
await new Promise((ok) => free.close(ok));

const env = { ...process.env, PORT: String(port), SUPABASE_URL: 'http://127.0.0.1:' + supaPort, SUPABASE_ANON_KEY: 'DUMMY_ANON_KEY_000' };
for (const k of ['FMP_API_KEY', 'TWELVE_DATA_API_KEY', 'ALPHA_VANTAGE_API_KEY',
  'REACT_APP_FMP_API_KEY', 'REACT_APP_TWELVE_DATA_API_KEY', 'REACT_APP_ALPHA_VANTAGE_API_KEY']) delete env[k];
const child = spawn(process.execPath, ['local-api-server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', (d) => { stderr += d; });

let passed = 0;
try {
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('local-api-server.js did not start: ' + stderr)), 15000);
    child.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); ok(); } });
    child.on('exit', (c) => fail(new Error('local-api-server.js exited ' + c + ': ' + stderr)));
  });
  async function get(p, headers = {}, method = 'GET') {
    const r = await fetch('http://127.0.0.1:' + port + p, { method, headers });
    return { status: r.status, type: r.headers.get('content-type'), methods: r.headers.get('access-control-allow-methods'), body: await r.text() };
  }
  async function check(name, fn) {
    try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name); throw e; }
  }

  await check('GET /api/market without a session -> the handler\'s 401 (it was a 404 before)', async () => {
    const r = await get('/api/market?v=td&p=%2Fquote&symbol=AAPL');
    assert.equal(r.status, 401);
    assert.match(r.type, /application\/json/);
    assert.deepEqual(JSON.parse(r.body), { error: 'sign in required' });
  });
  await check('signed in, outside the allowlist -> the handler\'s 400', async () => {
    const r = await get('/api/market?v=xyz&p=%2Fquote', { Authorization: 'Bearer GOOD_TOKEN' });
    assert.equal(r.status, 400);
    assert.deepEqual(JSON.parse(r.body), { error: 'unknown market data vendor' });
  });
  // local-api-server.js loads .env / .env.local; with keys in them this request would reach the vendor, so skip it.
  if (existsSync(path.join(ROOT, '.env')) || existsSync(path.join(ROOT, '.env.local'))) {
    console.log('skip signed in, no key -> 503 (this checkout has a .env file with possibly real keys)');
  } else {
    await check('signed in, allowlisted, no key configured -> the handler\'s 503 (no vendor call)', async () => {
      const r = await get('/api/market?v=td&p=%2Fquote&symbol=AAPL', { Authorization: 'Bearer GOOD_TOKEN' });
      assert.equal(r.status, 503);
      assert.deepEqual(JSON.parse(r.body), { error: 'market data not configured' });
    });
  }
  await check('OPTIONS lists GET as allowed', async () => {
    const r = await get('/api/market', {}, 'OPTIONS');
    assert.equal(r.status, 204);
    assert.match(r.methods, /\bGET\b/);
  });
  await check('anything else is still a 404', async () => {
    assert.equal((await get('/api/nope')).status, 404);
  });
} finally {
  child.kill();
  supa.close();
}
console.log(`\nmarket_local_dev_check: ${passed} checks passed`);
