// Market data for the page, with the vendor API keys kept on the server (2026-10-21).
//
// Until today src/App.js read REACT_APP_FMP_API_KEY / REACT_APP_TWELVE_DATA_API_KEY / REACT_APP_ALPHA_VANTAGE_API_KEY
// and called the vendors straight from the browser. Create React App copies every REACT_APP_* value into the public
// JavaScript bundle, so the three paid keys were readable by anyone who loaded the site (the page even printed their
// first 8 characters to the console). Now the page calls
//     GET /api/market?v=<fmp|td|av>&p=<the vendor's own path>&<the vendor's own query params, no apikey>
// (src/marketApi.js builds that URL) and this function:
//   - answers only a signed-in, confirmed @clearlinecap.com account (requireUser, the same check /api/send-email makes);
//   - forwards only the vendor paths the page uses, so the keys cannot be spent on any other part of a vendor's API,
//     and only at the sizes the page uses (at most 30 symbols and 500 days per request);
//   - adds the key from the SERVER environment. FMP_API_KEY etc. win; the REACT_APP_* names are a fallback so this works
//     with today's Vercel settings. Reading process.env here never reaches a browser - only the React build inlines
//     REACT_APP_* values, and `npm run build` (scripts/build.js) blanks these three for the React build and fails if a
//     key value turns up in its output. The functions read their own runtime environment, so they still get the keys.
//     Once the keys are rotated, store the new ones under the server-only names and delete the REACT_APP_* ones.
import { requireUser, deny } from '../lib/flowAuth.js';

const VENDORS = {
  // Financial Modeling Prep: international quotes (Japan, Hong Kong, Italy, UK, Denmark), market cap, earnings dates.
  fmp: {
    origin: 'https://financialmodelingprep.com',
    key: () => process.env.FMP_API_KEY || process.env.REACT_APP_FMP_API_KEY,
    paths: ['/stable/market-capitalization', '/stable/earnings'],
    symbolPaths: ['/api/v3/quote/'], // + the symbol (or a comma list), e.g. /api/v3/quote/7203.T
  },
  // TwelveData: quotes, prices, profiles, daily volume, earnings fallback, symbol search.
  td: {
    origin: 'https://api.twelvedata.com',
    key: () => process.env.TWELVE_DATA_API_KEY || process.env.REACT_APP_TWELVE_DATA_API_KEY,
    paths: ['/quote', '/price', '/profile', '/time_series', '/earnings', '/symbol_search'],
    symbolPaths: [],
  },
  // AlphaVantage: company overview (CIK, fiscal year end) only.
  av: {
    origin: 'https://www.alphavantage.co',
    key: () => process.env.ALPHA_VANTAGE_API_KEY || process.env.REACT_APP_ALPHA_VANTAGE_API_KEY,
    paths: ['/query'],
    symbolPaths: [],
    functions: ['OVERVIEW'],
  },
};

// 2026-10-21: a symbol that goes INTO the vendor path is held to ticker characters. No '/', '?', '#', '%' or '\', so it
// cannot climb out of /api/v3/quote/ or smuggle in its own query string, and it must hold a letter or digit (so '.'
// and '..' are refused - a URL treats those as "this folder" / "up one folder").
const SYMBOL_RE = /^[A-Za-z0-9.^:=\-,_ ]{1,200}$/;
// Never forwarded from the caller: our own routing params, and anything that would replace the key we add.
const DROP_RE = /^(v|p|apikey|api_key|token)$/i;
const TIMEOUT_MS = 20000;
// 2026-10-21: the allowlist says WHICH vendor calls may be made; these say how big one may be, so one signed-in
// request cannot spend a pile of vendor credits. The page asks for at most 30 symbols at once (getBatchQuotes sends
// chunks of 30, getBatchDailyVolumeData chunks of 25) and at most 90 days of daily history.
const MAX_SYMBOLS = 30;
const MAX_OUTPUTSIZE = 500;
const tooManySymbols = (list) => String(list).split(',').length > MAX_SYMBOLS;

// The vendor URL for this request, or { error } when the request is outside the allowlist.
function vendorTarget(searchParams) {
  const v = searchParams.get('v');
  const vendor = Object.prototype.hasOwnProperty.call(VENDORS, v) ? VENDORS[v] : null;
  if (!vendor) return { error: 'unknown market data vendor' };
  const path = String(searchParams.get('p') || '');
  let urlPath = null;
  if (vendor.paths.includes(path)) {
    urlPath = path;
  } else {
    const prefix = vendor.symbolPaths.find((x) => path.startsWith(x));
    const symbol = prefix ? path.slice(prefix.length) : '';
    if (!prefix || !SYMBOL_RE.test(symbol) || !/[A-Za-z0-9]/.test(symbol)) return { error: 'market data path not allowed' };
    if (tooManySymbols(symbol)) return { error: 'too many symbols in one market data request' };
    urlPath = prefix + symbol;
  }
  const params = [];
  const seen = new Set();
  for (const [k, val] of searchParams) {
    if (DROP_RE.test(k)) continue;
    // 2026-10-21: each param once. The page never repeats one, and a repeat would let a second symbol / outputsize /
    // function ride past the checks below (which vendors read the first, which the last, is theirs to decide).
    const name = k.toLowerCase();
    if (seen.has(name)) return { error: 'repeated market data param' };
    seen.add(name);
    if (name === 'symbol' && tooManySymbols(val)) return { error: 'too many symbols in one market data request' };
    if (name === 'outputsize' && !(/^\d{1,6}$/.test(val) && Number(val) >= 1 && Number(val) <= MAX_OUTPUTSIZE)) {
      return { error: 'market data outputsize not allowed' };
    }
    params.push([k, val]);
  }
  // 2026-10-21: AlphaVantage serves every dataset from /query, chosen by `function`, so the allowlist is on that
  // param too - exactly one, and only the ones the page uses.
  if (vendor.functions) {
    const fns = params.filter(([k]) => k.toLowerCase() === 'function');
    if (fns.length !== 1 || fns[0][0] !== 'function' || !vendor.functions.includes(fns[0][1])) {
      return { error: 'market data function not allowed' };
    }
  }
  // The path is inserted as the page used to write it (`${base}/quote/${symbol}`); the URL parser then encodes it
  // exactly as the browser did. Re-check the parsed path anyway, so nothing above can be talked out of its prefix.
  const url = new URL(vendor.origin + urlPath);
  if (url.origin !== vendor.origin || url.search || url.hash || decodeURIComponent(url.pathname) !== urlPath) {
    return { error: 'market data path not allowed' };
  }
  return { vendor, url, params };
}

export default async function handler(req, res) {
  // 2026-10-21: read-only market data, so only GET.
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2026-10-21: signed-in Clearline accounts only. Without this check the function would spend the firm's paid
  // keys for anyone on the internet who found the URL - the same leak as before, one step removed.
  const me = await requireUser(req);
  if (!me) return deny(res, 401, 'sign in required');

  let target;
  try {
    target = vendorTarget(new URL(req.url || '/', 'http://localhost').searchParams);
  } catch (_e) {
    target = { error: 'bad market data request' };
  }
  if (target.error) return deny(res, 400, target.error);

  const key = target.vendor.key();
  if (!key) return deny(res, 503, 'market data not configured');

  const query = target.params.concat([['apikey', key]])
    .map(([k, val]) => encodeURIComponent(k) + '=' + encodeURIComponent(val)).join('&');
  const vendorUrl = target.url.href + '?' + query;

  // What a log line may say about the call: vendor and path, never the query (it carries the key).
  const where = target.vendor.origin + target.url.pathname;
  let r;
  let body;
  try {
    r = await fetch(vendorUrl, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'manual' });
    // 2026-10-21: never follow a vendor redirect. The key rode on the URL we sent, and where a 3xx points next is not
    // ours to check, so a redirect is answered as a vendor failure instead of being chased with the key attached.
    if (r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400)) {
      console.error('market: vendor redirected', where, r.status);
      return deny(res, 502, 'market data vendor redirected');
    }
    body = await r.text();
  } catch (e) {
    // 2026-10-21: the vendor URL carries the key, so it never goes into an error, a reply or a log line.
    const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    console.error('market: vendor call failed', where, timedOut ? 'timeout' : (e && e.name));
    return deny(res, timedOut ? 504 : 502, timedOut ? 'market data vendor timed out' : 'market data vendor unreachable');
  }

  // 2026-10-21: belt and braces - if a vendor ever echoes the request (key included) in its reply, blank the key out.
  if (key.length >= 12 && body.includes(key)) body = body.split(key).join('[redacted]');

  // 2026-10-21: the reply is served from OUR origin, so only data types go out as the vendor sent them; anything else
  // (an HTML error page, say) is labelled JSON so a browser never renders it as a page of clearlineflow.com.
  const vendorType = String((r.headers && r.headers.get('content-type')) || '');
  res.setHeader('Content-Type', /^(application\/json|text\/plain|text\/csv)\b/i.test(vendorType) ? vendorType : 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(r.status).send(body);
}
