import { createClient } from '@supabase/supabase-js';

// Helpers
function toCYQFromDate(ymd) {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd));
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let quarter = 'Q1';
  if (month >= 4 && month <= 6) quarter = 'Q2';
  else if (month >= 7 && month <= 9) quarter = 'Q3';
  else if (month >= 10 && month <= 12) quarter = 'Q4';
  return `${year}${quarter}`;
}

function getAllCYQsWindow() {
  const currentYear = new Date().getFullYear();
  const cyqs = [];
  for (let y = currentYear - 1; y <= currentYear + 2; y++) {
    for (let q = 1; q <= 4; q++) cyqs.push(`${y}Q${q}`);
  }
  return cyqs;
}

async function fetchFmpEarnings(symbol) {
  const apiKey = process.env.REACT_APP_FMP_API_KEY;
  if (!apiKey) {
    console.log(`FMP: No API key available`);
    return null;
  }
  
  const cleanSymbol = String(symbol || '').replace(/ US$/, '').trim().toUpperCase();
  const url = `https://financialmodelingprep.com/stable/earnings?symbol=${encodeURIComponent(cleanSymbol)}&apikey=${apiKey}`;
  
  console.log(`FMP API call for ${symbol} (clean: ${cleanSymbol}): ${url.replace(apiKey, 'API_KEY_HIDDEN')}`);
  
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`FMP API error for ${symbol}: ${res.status} ${res.statusText}`);
    throw new Error(`FMP ${res.status}`);
  }
  
  const data = await res.json();
  console.log(`FMP raw response for ${symbol}:`, JSON.stringify(data).substring(0, 500));
  
  if (!Array.isArray(data) || data.length === 0) {
    console.log(`FMP: No earnings data found for ${symbol}`);
    return null;
  }

  // Keep last 12 months + future
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twelveMonthsAgo = new Date(today);
  twelveMonthsAgo.setFullYear(today.getFullYear() - 1);

  const relevant = data.filter((e) => {
    const d = String(e?.date || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return false;
    const dt = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    dt.setHours(0, 0, 0, 0);
    return dt >= twelveMonthsAgo;
  });

  if (!relevant.length) {
    console.log(`FMP: No relevant earnings found for ${symbol} (filtered out old dates)`);
    return null;
  }
  
  relevant.sort((a, b) => new Date(a.date) - new Date(b.date));
  const result = relevant.map((e) => ({ date: e.date }));
  console.log(`FMP: Returning ${result.length} earnings dates for ${symbol}:`, result);
  return result;
}

async function fetchTwelveDataEarnings(symbol) {
  const key = process.env.REACT_APP_TWELVE_DATA_API_KEY;
  if (!key) {
    console.log(`TwelveData: No API key available`);
    return null;
  }
  
  // Convert Bloomberg suffix to Twelve Data style when present (basic pass)
  const converted = String(symbol || '').replace(/ US$/, '').trim().toUpperCase();
  const url = `https://api.twelvedata.com/earnings?symbol=${encodeURIComponent(converted)}&apikey=${key}`;
  
  console.log(`TwelveData API call for ${symbol} (converted: ${converted}): ${url.replace(key, 'API_KEY_HIDDEN')}`);
  
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`TwelveData API error for ${symbol}: ${res.status} ${res.statusText}`);
    throw new Error(`TwelveData ${res.status}`);
  }
  
  const data = await res.json();
  console.log(`TwelveData raw response for ${symbol}:`, JSON.stringify(data).substring(0, 500));
  
  if (data && data.data && Array.isArray(data.data)) {
    // Normalize shape: [{date: 'YYYY-MM-DD'}, ...]
    const result = data.data
      .filter((row) => row && row.date)
      .map((row) => ({ date: row.date }));
    console.log(`TwelveData: Returning ${result.length} earnings dates for ${symbol}:`, result);
    return result;
  }
  
  console.log(`TwelveData: No valid earnings data found for ${symbol}`);
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Debug API key availability
    console.log('API Key Status:');
    console.log('- REACT_APP_FMP_API_KEY:', process.env.REACT_APP_FMP_API_KEY ? `Available (${process.env.REACT_APP_FMP_API_KEY.length} chars)` : 'Missing');
    console.log('- REACT_APP_TWELVE_DATA_API_KEY:', process.env.REACT_APP_TWELVE_DATA_API_KEY ? `Available (${process.env.REACT_APP_TWELVE_DATA_API_KEY.length} chars)` : 'Missing');

    // Determine if we should run now: every midnight America/New_York
    const hourNY = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false
    }).format(new Date()), 10);

    const forceRun = (
      (req.query && (req.query.force === '1' || req.query.force === 'true')) ||
      (req.body && (req.body.force === '1' || req.body.force === 'true'))
    );

    if (!forceRun && hourNY !== 0) {
      return res.status(200).json({ success: true, skipped: true, reason: `Current NY hour ${hourNY} != 0` });
    }

    // Load all Portfolio tickers
    const { data: tickers, error: tickersErr } = await supabase
      .from('tickers')
      .select('id, ticker, status')
      .eq('status', 'Portfolio');
    if (tickersErr) throw tickersErr;

    const allCYQs = getAllCYQsWindow();
    const results = { processed: 0, updatedTickers: 0, errors: {} };

    for (const t of tickers || []) {
      const symbol = t.ticker;
      results.processed += 1;
      try {
        // Fetch earnings dates (prefer FMP, fallback to Twelve Data)
        console.log(`Fetching earnings for ${symbol}...`);
        let earnings = await fetchFmpEarnings(symbol);
        console.log(`FMP result for ${symbol}:`, earnings ? `${earnings.length} dates` : 'null');
        
        if (!earnings) {
          earnings = await fetchTwelveDataEarnings(symbol);
          console.log(`TwelveData result for ${symbol}:`, earnings ? `${earnings.length} dates` : 'null');
        }

        // CRITICAL: Only clear existing data if we have new data to replace it
        if (!earnings || !earnings.length) {
          console.log(`No earnings data found for ${symbol}, skipping (preserving existing data)`);
          continue;
        }

        // Clear existing earnings_date in the target CYQ window for this ticker (preserve other columns)
        console.log(`Clearing existing earnings for ${symbol} and updating with ${earnings.length} new dates`);
        await supabase
          .from('earnings_tracking')
          .update({ earnings_date: null, updated_at: new Date().toISOString() })
          .eq('ticker_id', t.id)
          .in('cyq', allCYQs);

        // Build upserts - handle multiple earnings dates in same quarter by appending 'L'
        const cyqMap = new Map();
        const sortedEarnings = earnings.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        for (const e of sortedEarnings) {
          const baseCyq = toCYQFromDate(e.date);
          if (!baseCyq) continue;
          
          let cyq = baseCyq;
          // If we already have an entry for this CYQ, append 'L' for the later earnings
          if (cyqMap.has(cyq)) {
            cyq = baseCyq + 'L';
            console.log(`Multiple earnings in ${baseCyq} for ${symbol}, using ${cyq} for ${e.date}`);
          }
          
          cyqMap.set(cyq, { ticker_id: t.id, cyq, earnings_date: e.date, updated_at: new Date().toISOString() });
        }
        
        const rows = Array.from(cyqMap.values());

        if (rows.length) {
          const { error: upsertErr } = await supabase
            .from('earnings_tracking')
            .upsert(rows, { onConflict: 'ticker_id,cyq' });
          if (upsertErr) throw upsertErr;
          results.updatedTickers += 1;
        }
      } catch (e) {
        results.errors[symbol] = String(e?.message || e);
      }
    }

    return res.status(200).json({ success: true, ...results });
  } catch (error) {
    console.error('Error in cron-refresh-earnings:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}


