// Market data (quotes, profiles, volumes, earnings dates) through our own /api/market function (2026-10-21).
// The page used to call TwelveData, Financial Modeling Prep and AlphaVantage directly, with API keys that Create React
// App had copied into the public JavaScript bundle. api/market.js now adds the keys on the server and answers only a
// signed-in Clearline account, so every call here carries the session header (flowAuthHeaders).
import { flowAuthHeaders } from './flowAuthHeaders';

// vendor: 'fmp' | 'td' | 'av'. path: the vendor's own path ('/quote', '/stable/earnings', '/api/v3/quote/7203.T').
// params: the vendor's own query params, WITHOUT apikey - the server adds it.
export function marketUrl(vendor, path, params) {
  return '/api/market?' + new URLSearchParams({ v: vendor, p: path, ...params }).toString();
}

// Fetch a URL made by marketUrl, signed in.
export async function marketFetchUrl(url, init) {
  return fetch(url, { ...init, headers: { ...(init && init.headers), ...(await flowAuthHeaders()) } });
}

export async function marketFetch(vendor, path, params, init) {
  return marketFetchUrl(marketUrl(vendor, path, params), init);
}
