// `npm run build` keeps the market-data keys out of the public JavaScript (2026-10-21).
//
// scripts/build.js blanks REACT_APP_FMP_API_KEY / REACT_APP_TWELVE_DATA_API_KEY / REACT_APP_ALPHA_VANTAGE_API_KEY for
// the React build and fails the build if a key value turns up in the output. This checks, without running a real build:
//   1. package.json's build script is that script;
//   2. the environment it hands react-scripts, put through react-scripts' OWN env loader (config/env.js, which also
//      reads .env files), yields a client environment with no key in it - and, as a control, the same loader with the
//      keys left in DOES leak them, so a pass means something;
//   3. the key values are collected from the environment and from .env files;
//   4. the output scan fails on a planted key, names the variable and file, and never prints the value.
// Dummy keys only, temp folders only, no network. Run: node tests/security/market_build_check.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const build = require(path.join(ROOT, 'scripts', 'build.js'));

const DUMMY = {
  REACT_APP_FMP_API_KEY: 'DUMMYFMPKEY0000000000000000000001',
  REACT_APP_TWELVE_DATA_API_KEY: 'DUMMYTDKEY00000000000000000000002',
  REACT_APP_ALPHA_VANTAGE_API_KEY: 'DUMMYAVKEY000003',
};
// This PC's own key variables (if any) never take part.
function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (build.WATCHED.includes(k.toUpperCase())) delete env[k];
  return env;
}

let passed = 0;
const temps = [];
function temp() {
  const d = mkdtempSync(path.join(tmpdir(), 'flow-market-build-'));
  temps.push(d);
  return d;
}
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log('ok   ' + name);
  } catch (e) {
    console.log('FAIL ' + name);
    throw e;
  }
}

try {
  await check('package.json "build" runs scripts/build.js', async () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.build, 'node scripts/build.js');
  });

  await check('buildEnv blanks the three REACT_APP_ keys, sets CI=false, leaves everything else alone', async () => {
    const env = build.buildEnv({ ...DUMMY, FMP_API_KEY: 'DUMMY_SERVER_NAME_KEY', REACT_APP_SUPABASE_URL: 'https://x.invalid', CI: 'true' });
    assert.equal(env.REACT_APP_FMP_API_KEY, '');
    assert.equal(env.REACT_APP_TWELVE_DATA_API_KEY, '');
    assert.equal(env.REACT_APP_ALPHA_VANTAGE_API_KEY, '');
    assert.equal(env.CI, 'false');
    assert.equal(env.FMP_API_KEY, 'DUMMY_SERVER_NAME_KEY', 'not a REACT_APP_ name, so CRA never inlines it');
    assert.equal(env.REACT_APP_SUPABASE_URL, 'https://x.invalid');
  });

  // react-scripts' own loader, in a child process (it reads process.cwd() and process.env), on a throwaway project
  // whose .env files also hold dummy keys.
  const envJs = require.resolve('react-scripts/config/env.js', { paths: [ROOT] });
  function clientEnv(env, cwd) {
    const code = `process.env.NODE_ENV = 'production';
      const { stringified } = require(${JSON.stringify(envJs)})('');
      process.stdout.write(JSON.stringify(stringified['process.env']));`;
    const r = spawnSync(process.execPath, ['-e', code], { cwd, env, encoding: 'utf8' });
    assert.equal(r.status, 0, 'react-scripts env loader failed: ' + r.stderr);
    return JSON.parse(r.stdout);
  }
  const proj = temp();
  writeFileSync(path.join(proj, 'package.json'), '{}');
  writeFileSync(path.join(proj, '.env'), 'REACT_APP_FMP_API_KEY=DUMMYFMPFROMDOTENVFILE00000000004\n');
  writeFileSync(path.join(proj, '.env.production'), 'REACT_APP_TWELVE_DATA_API_KEY="DUMMYTDFROMDOTENVFILE000000000005"\n');
  const dotenvDummies = ['DUMMYFMPFROMDOTENVFILE00000000004', 'DUMMYTDFROMDOTENVFILE000000000005'];

  await check('control: react-scripts left alone puts the keys (env and .env files) in the client environment', async () => {
    const leaked = JSON.stringify(clientEnv({ ...cleanEnv(), REACT_APP_ALPHA_VANTAGE_API_KEY: DUMMY.REACT_APP_ALPHA_VANTAGE_API_KEY }, proj));
    for (const v of [DUMMY.REACT_APP_ALPHA_VANTAGE_API_KEY, ...dotenvDummies]) assert.ok(leaked.includes(v), 'control should leak a dummy');
  });

  await check('through buildEnv, neither the environment nor a .env file gets a key into the client environment', async () => {
    const ce = clientEnv(build.buildEnv({ ...cleanEnv(), ...DUMMY }), proj);
    const text = JSON.stringify(ce);
    for (const v of [...Object.values(DUMMY), ...dotenvDummies]) assert.ok(!text.includes(v), 'a dummy key reached the client environment');
    for (const k of Object.keys(DUMMY)) assert.equal(ce[k], '""', k + ' is defined, and blank');
  });

  await check('keyValues collects the six variables from the environment and from .env files', async () => {
    const root = temp();
    writeFileSync(path.join(root, '.env'), [
      '# a comment',
      'export ALPHA_VANTAGE_API_KEY=DUMMYAVSERVERNAME0006 # trailing comment',
      'REACT_APP_SUPABASE_URL=https://not-a-key.invalid',
      'TWELVE_DATA_API_KEY=',
    ].join('\r\n'));
    writeFileSync(path.join(root, '.env.local'), "REACT_APP_TWELVE_DATA_API_KEY='DUMMYTDQUOTED0007'\n");
    const got = build.keyValues({ FMP_API_KEY: 'DUMMYFMPENV0008', PATH: '/usr/bin' }, root)
      .map((x) => x.name + '=' + x.value + '@' + x.from).sort();
    assert.deepEqual(got, [
      'ALPHA_VANTAGE_API_KEY=DUMMYAVSERVERNAME0006@.env',
      'FMP_API_KEY=DUMMYFMPENV0008@environment',
      'REACT_APP_TWELVE_DATA_API_KEY=DUMMYTDQUOTED0007@.env.local',
    ]);
  });

  function captureLog() {
    const lines = { log: [], warn: [], error: [] };
    return { lines, log: { log: (m) => lines.log.push(m), warn: (m) => lines.warn.push(m), error: (m) => lines.error.push(m) } };
  }
  const values = [
    { name: 'REACT_APP_FMP_API_KEY', value: DUMMY.REACT_APP_FMP_API_KEY, from: 'environment' },
    { name: 'ALPHA_VANTAGE_API_KEY', value: DUMMY.REACT_APP_ALPHA_VANTAGE_API_KEY, from: '.env' },
    { name: 'TWELVE_DATA_API_KEY', value: 'abc', from: 'environment' },
  ];

  await check('the output scan fails on a planted key and names the variable and file - never the value', async () => {
    const out = temp();
    mkdirSync(path.join(out, 'static', 'js'), { recursive: true });
    writeFileSync(path.join(out, 'static', 'js', 'main.abc123.js'), 'var e={REACT_APP_FMP_API_KEY:"' + DUMMY.REACT_APP_FMP_API_KEY + '"};');
    writeFileSync(path.join(out, 'index.html'), '<script>abc</script>' + DUMMY.REACT_APP_ALPHA_VANTAGE_API_KEY);
    writeFileSync(path.join(out, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00, 0xfe]));
    const { lines, log } = captureLog();
    assert.equal(build.checkOutput(out, values, log), 1);
    assert.equal(lines.error.length, 2);
    assert.ok(lines.error.some((m) => m.includes('REACT_APP_FMP_API_KEY') && m.includes('static/js/main.abc123.js')));
    assert.ok(lines.error.some((m) => m.includes('ALPHA_VANTAGE_API_KEY') && m.includes('index.html')));
    const all = JSON.stringify(lines);
    for (const v of values) if (v.value.length >= build.MIN_LEN) assert.ok(!all.includes(v.value), 'a key value was printed');
    assert.ok(lines.warn.some((m) => m.includes('TWELVE_DATA_API_KEY') && m.includes('not searched')), 'a short value is skipped, with a warning');
  });

  await check('the output scan passes a clean output folder', async () => {
    const out = temp();
    mkdirSync(path.join(out, 'static', 'js'), { recursive: true });
    writeFileSync(path.join(out, 'static', 'js', 'main.abc123.js'), 'var e={REACT_APP_FMP_API_KEY:""};fetch("/api/market?v=td")');
    const { lines, log } = captureLog();
    assert.equal(build.checkOutput(out, values, log), 0);
    assert.equal(lines.error.length, 0);
    assert.ok(lines.log[0].includes('no market-data key'));
  });
} finally {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
}

console.log(`\nmarket_build_check: ${passed} checks passed`);
