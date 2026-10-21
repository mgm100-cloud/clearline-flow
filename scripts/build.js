// Production build, with the market-data API keys kept out of the public JavaScript (2026-10-21).
//
// Why this exists: Create React App hands webpack `process.env` as ONE object holding every REACT_APP_* variable in the
// build environment (node_modules/react-scripts/config/env.js). Any `process.env.REACT_APP_X` the build does not
// define is replaced by that whole object - so while the build environment holds REACT_APP_FMP_API_KEY and friends
// (Vercel does today, and api/market.js falls back to them), a single unset REACT_APP_ read anywhere in src/ prints all
// three paid keys into main.*.js. The page no longer reads the keys (src/marketApi.js -> api/market.js adds them on the
// server), so `npm run build` runs this script, which:
//   1. blanks the three REACT_APP_*_API_KEY variables for the React build only. Blank rather than deleted: CRA also
//      reads .env / .env.production / .env.local, and it never lets a file replace a variable that is already set.
//      The Vercel functions read their own runtime environment, not this process, so api/market.js keeps its keys.
//   2. runs `react-scripts build` with CI=false (as the old script did, so lint warnings stay warnings on Vercel);
//   3. fails the build if the value of any of the six key variables (FMP_API_KEY, TWELVE_DATA_API_KEY,
//      ALPHA_VANTAGE_API_KEY and their REACT_APP_ names), from the environment or a .env file, appears in any file of
//      the output folder. It names the variable and the file, never the value.
// `react-scripts build` run on its own does neither step 1 nor step 3.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const KEY_NAMES = ['FMP_API_KEY', 'TWELVE_DATA_API_KEY', 'ALPHA_VANTAGE_API_KEY'];
const WATCHED = KEY_NAMES.flatMap((n) => [n, 'REACT_APP_' + n]);
// The files react-scripts reads for a production build (react-scripts/config/env.js).
const ENV_FILES = ['.env.production.local', '.env.local', '.env.production', '.env'];
// Shorter values are placeholders, and searching for them would match ordinary text.
const MIN_LEN = 8;

// Every NAME=value line of the .env files react-scripts would read: [{ name, value, from }].
function envFileEntries(root) {
  const out = [];
  for (const file of ENV_FILES) {
    let text;
    try { text = fs.readFileSync(path.join(root, file), 'utf8'); } catch (_e) { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m) continue;
      let value = m[2];
      if (/^(["'`]).*\1$/.test(value)) value = value.slice(1, -1);
      else value = value.split(/\s+/)[0]; // an unquoted key has no spaces; drop a trailing "# comment"
      out.push({ name: m[1], value, from: file });
    }
  }
  return out;
}

// Every value the six key variables have, in the environment and in the .env files: [{ name, value, from }].
function keyValues(env, root) {
  const out = [];
  for (const name of WATCHED) if (env[name]) out.push({ name, value: String(env[name]), from: 'environment' });
  for (const e of envFileEntries(root)) if (WATCHED.includes(e.name) && e.value) out.push(e);
  return out;
}

// The environment react-scripts build runs with.
function buildEnv(env) {
  const out = { ...env, CI: 'false' };
  // 2026-10-21: blank, so neither this environment nor a .env file can hand the bundle a key (see the top of the file).
  for (const n of KEY_NAMES) out['REACT_APP_' + n] = '';
  return out;
}

// Files under dir holding one of the values: [{ name, file }]. The value itself is never returned or printed.
function findKeys(dir, values) {
  const usable = values.filter((x) => x.value.length >= MIN_LEN);
  const hits = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) { walk(p); continue; }
      if (!ent.isFile()) continue;
      const text = fs.readFileSync(p, 'latin1'); // keys are ASCII, so this finds them in any file without decoding errors
      const names = new Set(usable.filter((x) => text.includes(x.value)).map((x) => x.name));
      for (const name of names) hits.push({ name, file: path.relative(dir, p).split(path.sep).join('/') });
    }
  };
  walk(dir);
  return hits;
}

// The post-build check: 0 when the output holds no key, 1 (with one line per hit) when it does.
function checkOutput(dir, values, log = console) {
  for (const x of values) {
    if (x.value.length < MIN_LEN) log.warn(`build: ${x.name} (${x.from}) is shorter than ${MIN_LEN} characters - not searched for`);
  }
  const hits = findKeys(dir, values);
  if (hits.length) {
    for (const h of hits) log.error(`build: FAILED - the value of ${h.name} is in ${h.file}. Nothing served to browsers may hold a market-data key.`);
    return 1;
  }
  const names = [...new Set(values.filter((x) => x.value.length >= MIN_LEN).map((x) => x.name))];
  log.log(`build: no market-data key in ${dir}` + (names.length ? ` (searched for ${names.join(', ')})` : ' (no key variables set, nothing to search for)'));
  return 0;
}

function main() {
  const values = keyValues(process.env, ROOT);
  const wsSet = process.env.REACT_APP_WS_SERVER_URL ||
    envFileEntries(ROOT).some((e) => e.name === 'REACT_APP_WS_SERVER_URL' && e.value);
  if (!wsSet) {
    console.warn('build: REACT_APP_WS_SERVER_URL is not set - live price streaming will be off in this build ' +
      '(prices still load through /api/market).');
  }
  const r = spawnSync(process.execPath, [require.resolve('react-scripts/bin/react-scripts.js'), 'build'],
    { cwd: ROOT, stdio: 'inherit', env: buildEnv(process.env) });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status == null ? 1 : r.status);
  // react-scripts puts the output in BUILD_PATH (relative to the project) or build/.
  process.exit(checkOutput(path.resolve(ROOT, process.env.BUILD_PATH || 'build'), values));
}

if (require.main === module) main();

module.exports = { KEY_NAMES, WATCHED, ENV_FILES, MIN_LEN, envFileEntries, keyValues, buildEnv, findKeys, checkOutput };
