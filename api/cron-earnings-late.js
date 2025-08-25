import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

// Helpers to compute days difference using America/New_York calendar
function parseYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return null;
  return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };
}

function epochDaysUtc(y, m, d) {
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function getTodayInNYEpochDays() {
  // Build today components in America/New_York without DST confusion
  const nowNY = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const year = nowNY.getFullYear();
  const month = nowNY.getMonth() + 1;
  const day = nowNY.getDate();
  return epochDaysUtc(year, month, day);
}

function daysUntilInNY(ymd) {
  const parts = parseYmd(ymd);
  if (!parts) return null;
  const todayDays = getTodayInNYEpochDays();
  const dateDays = epochDaysUtc(parts.y, parts.m, parts.d);
  return dateDays - todayDays;
}

function formatDateMMDDYY(ymd) {
  const p = parseYmd(ymd);
  if (!p) return ymd || '-';
  const mm = String(p.m).padStart(2, '0');
  const dd = String(p.d).padStart(2, '0');
  const yy = String(p.y).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

async function fetchLateTickers() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: 'public' },
    global: { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' } }
  });

  // Get earnings data with ticker join (include NULL earnings_date for debugging)
  const { data: earningsData, error: earningsError } = await supabase
    .from('earnings_tracking')
    .select(`
      id,
      ticker_id,
      earnings_date,
      preview_date,
      callback_date,
      cyq,
      updated_at,
      tickers!ticker_id (
        ticker,
        analyst,
        status
      )
    `)
    .order('updated_at', { ascending: false })
    .limit(1000);

  if (earningsError) throw earningsError;

  // Filter to only portfolio tickers
  const portfolioEarnings = (earningsData || []).filter(row => 
    row.tickers?.status === 'Portfolio'
  );

  if (earningsError) throw earningsError;

  // Debug logging
  const portfolioWithDates = portfolioEarnings.filter(row => row.earnings_date);
  const portfolioWithoutDates = portfolioEarnings.filter(row => !row.earnings_date);
  
  console.log(`Debug: Found ${earningsData?.length || 0} total earnings records`);
  console.log(`Debug: Found ${portfolioEarnings.length} earnings records for portfolio tickers`);
  console.log(`Debug: Portfolio records WITH earnings_date: ${portfolioWithDates.length}`);
  console.log(`Debug: Portfolio records WITHOUT earnings_date (NULL): ${portfolioWithoutDates.length}`);

  // Show today's date for reference
  const todayNY = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  console.log(`Debug: Today (NY): ${todayNY.toISOString().split('T')[0]}`);

  // Show sample of recent records (with and without dates)
  console.log(`Debug: Recent records with dates:`, portfolioWithDates.slice(0, 3).map(r => ({
    ticker: r.tickers?.ticker,
    earningsDate: r.earnings_date,
    updatedAt: r.updated_at
  })));
  console.log(`Debug: Recent records without dates:`, portfolioWithoutDates.slice(0, 3).map(r => ({
    ticker: r.tickers?.ticker,
    earningsDate: r.earnings_date,
    updatedAt: r.updated_at
  })));

  const results = [];
  let processedCount = 0;
  let inRangeCount = 0;
  let lateInRangeCount = 0;

  // Only process records that have earnings dates
  for (const row of portfolioWithDates) {
    const ticker = row.tickers?.ticker;
    const who = row.tickers?.analyst || '';
    const earningsDate = row.earnings_date;
    const previewDate = row.preview_date || null;
    const callbackDate = row.callback_date || null;

    // Skip if no ticker info
    if (!ticker) {
      console.warn('Skipping earnings record with missing ticker:', row);
      continue;
    }

    processedCount++;
    console.log(`Debug: Processing Portfolio ticker: ${ticker}, earnings: ${earningsDate}, analyst: ${who}`);
    
    const days = daysUntilInNY(earningsDate);
    if (days == null) {
      console.log(`Debug: Skipping ${ticker} - invalid date calculation for ${earningsDate}`);
      continue;
    }
    
    console.log(`Debug: ${ticker} - days until earnings: ${days}`);
    
    // Temporarily expand range to see if we have ANY current earnings dates
    if (days >= -30 && days <= 90) {
      const isInNormalRange = days >= 0 && days <= 14;
      if (isInNormalRange) {
        inRangeCount++;
      }
      const isLate = !previewDate || !callbackDate;
      console.log(`Debug: ${ticker} - ${isInNormalRange ? 'IN RANGE' : 'EXPANDED RANGE'} - days: ${days}, isLate: ${isLate}, preview: ${previewDate || 'NULL'}, callback: ${callbackDate || 'NULL'}`);
      if (isInNormalRange && isLate) {
        lateInRangeCount++;
        console.log(`Debug: *** ADDING LATE TICKER: ${ticker} ***`);
        results.push({
          ticker,
          who,
          earningsDate,
          previewDate,
          callbackDate,
          cyq: row.cyq,
          days
        });
      } else if (isInNormalRange) {
        console.log(`Debug: ${ticker} - not late (has both preview and callback dates)`);
      }
    } else {
      console.log(`Debug: Skipping ${ticker} - outside expanded range (${days} days)`);
    }
  }

  console.log(`Debug: SUMMARY - Processed: ${processedCount}, In range (0-14): ${inRangeCount}, Late in range: ${lateInRangeCount}`);
  console.log(`Debug: Final results count: ${results.length}`);
  console.log('Debug: Results:', results.map(r => ({ ticker: r.ticker, days: r.days, isLate: !r.previewDate || !r.callbackDate })));

  return {
    results,
    debugInfo: {
      totalEarningsRecords: earningsData?.length || 0,
      portfolioEarningsCount: portfolioEarnings.length,
      portfolioWithDates: portfolioWithDates.length,
      portfolioWithoutDates: portfolioWithoutDates.length,
      processedCount,
      inRangeCount,
      lateInRangeCount,
      todayNY: todayNY.toISOString().split('T')[0],
      sampleWithDates: portfolioWithDates.slice(0, 3).map(row => ({
        ticker: row.tickers?.ticker,
        earningsDate: row.earnings_date,
        previewDate: row.preview_date,
        callbackDate: row.callback_date,
        analyst: row.tickers?.analyst,
        updatedAt: row.updated_at
      })),
      sampleWithoutDates: portfolioWithoutDates.slice(0, 3).map(row => ({
        ticker: row.tickers?.ticker,
        earningsDate: row.earnings_date,
        previewDate: row.preview_date,
        callbackDate: row.callback_date,
        analyst: row.tickers?.analyst,
        updatedAt: row.updated_at
      }))
    }
  };
}

function buildSummaryEmail(lateItems) {
  if (!lateItems.length) {
    return {
      subject: 'Earnings Late Check: No late tickers today',
      html: '<p>There are no late tickers (0-14 days) today.</p>'
    };
  }

  // Group by analyst (who)
  const groups = lateItems.reduce((acc, item) => {
    const who = (item.who || 'UNKNOWN').trim().toUpperCase();
    if (!acc[who]) acc[who] = [];
    acc[who].push(item);
    return acc;
  }, {});

  const sections = Object.keys(groups)
    .sort()
    .map((who) => {
      const rows = groups[who]
        .sort((a, b) => (a.earningsDate < b.earningsDate ? -1 : 1))
        .map(item => {
          const previewBlank = item.previewDate ? 'No' : 'Yes';
          const callbackBlank = item.callbackDate ? 'No' : 'Yes';
          const emphasize = item.days < 10;
          const rowStyle = emphasize
            ? 'color:#b91c1c; font-weight:700;'
            : '';
          return `
            <tr style="${rowStyle}">
              <td style=\"padding:6px 8px; border:1px solid #e5e7eb; font-family:Arial, sans-serif;\">${item.ticker}</td>
              <td style=\"padding:6px 8px; border:1px solid #e5e7eb; font-family:Arial, sans-serif;\">${formatDateMMDDYY(item.earningsDate)}</td>
              <td style=\"padding:6px 8px; border:1px solid #e5e7eb; font-family:Arial, sans-serif;\">${item.days}</td>
              <td style=\"padding:6px 8px; border:1px solid #e5e7eb; font-family:Arial, sans-serif;\">${previewBlank}</td>
              <td style=\"padding:6px 8px; border:1px solid #e5e7eb; font-family:Arial, sans-serif;\">${callbackBlank}</td>
            </tr>`;
        })
        .join('');

      return `
        <h3 style=\"margin:16px 0 8px 0; font-family:Arial, sans-serif;\">${who}</h3>
        <table style=\"border-collapse: collapse;\">
          <thead>
            <tr>
              <th style=\"padding:6px 8px; border:1px solid #e5e7eb; text-align:left;\">Ticker</th>
              <th style=\"padding:6px 8px; border:1px solid #e5e7eb; text-align:left;\">Earnings</th>
              <th style=\"padding:6px 8px; border:1px solid #e5e7eb; text-align:left;\">Days</th>
              <th style=\"padding:6px 8px; border:1px solid #e5e7eb; text-align:left;\">Preview Blank</th>
              <th style=\"padding:6px 8px; border:1px solid #e5e7eb; text-align:left;\">Callback Blank</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>`;
    })
    .join('\n');

  const html = `
    <div style=\"font-family: Arial, sans-serif; color: #111;\">
      <h2 style=\"margin:0 0 8px 0;\">Late Earnings (0-14 days)</h2>
      <p style=\"margin:0 0 12px 0;\">Tickers with blank Preview or Callback dates.</p>
      ${sections}
    </div>`;

  return {
    subject: `Earnings Late Check: ${lateItems.length} late`,
    html
  };
}

function buildAnalystEmail(analyst, lateItems) {
  const rows = lateItems
    .sort((a, b) => (a.earningsDate < b.earningsDate ? -1 : 1))
    .map(item => {
      const previewBlank = item.previewDate ? 'No' : 'Yes';
      const callbackBlank = item.callbackDate ? 'No' : 'Yes';
      const emphasize = item.days < 10;
      const rowStyle = emphasize
        ? 'color:#b91c1c; font-weight:700;'
        : '';
      return `
        <tr style="${rowStyle}">
          <td style=\"padding:6px 8px; border:1px solid #e5e7eb; font-family:Arial, sans-serif;\">${item.ticker}</td>
          <td style=\"padding:6px 8px; border:1px solid #e5e7eb; font-family:Arial, sans-serif;\">${formatDateMMDDYY(item.earningsDate)}</td>
          <td style=\"padding:6px 8px; border:1px solid #e5e7eb; font-family:Arial, sans-serif;\">${item.days}</td>
          <td style=\"padding:6px 8px; border:1px solid #e5e7eb; font-family:Arial, sans-serif;\">${previewBlank}</td>
          <td style=\"padding:6px 8px; border:1px solid #e5e7eb; font-family:Arial, sans-serif;\">${callbackBlank}</td>
        </tr>`;
    })
    .join('');

  const html = `
    <div style=\"font-family: Arial, sans-serif; color: #111;\">
      <h2 style=\"margin:0 0 8px 0;\">Late Earnings (0-14 days)</h2>
      <p style=\"margin:0 0 12px 0;\">Tickers with blank Preview or Callback dates.</p>
      <table style=\"border-collapse: collapse;\">
        <thead>
          <tr>
            <th style=\"padding:6px 8px; border:1px solid #e5e7eb; text-align:left;\">Ticker</th>
            <th style=\"padding:6px 8px; border:1px solid #e5e7eb; text-align:left;\">Earnings</th>
            <th style=\"padding:6px 8px; border:1px solid #e5e7eb; text-align:left;\">Days</th>
            <th style=\"padding:6px 8px; border:1px solid #e5e7eb; text-align:left;\">Preview Blank</th>
            <th style=\"padding:6px 8px; border:1px solid #e5e7eb; text-align:left;\">Callback Blank</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;

  return {
    subject: `Earnings Late Check [${analyst}]: ${lateItems.length} late`,
    html
  };
}

async function getAnalystEmailMap(lateItems, debug = false) {
  // Build a set of analyst identifiers we need emails for
  const needed = Array.from(new Set((lateItems || []).map(i => (i.who || 'UNKNOWN').trim().toUpperCase()).filter(Boolean)));
  if (!needed.length) return debug ? { map: {}, userKeyMap: {} } : {};

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: 'public' },
    global: { headers: { 'Cache-Control': 'no-cache' } }
  });

  // List all users, then build a flexible key->email map
  const users = [];
  let page = 1;
  let keepPaging = true;
  while (keepPaging) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...(data?.users || []));
    if (data?.users && data.users.length === 1000) {
      page += 1;
    } else {
      keepPaging = false;
    }
  }

  const keyToEmail = {};
  const userKeyMap = {}; // debug: email -> keys

  const normalize = (s) => String(s || '').trim().toUpperCase();
  const initialsOf = (fullName) => {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    return parts.map(p => p[0]).join('').toUpperCase();
  };

  for (const u of users) {
    const email = u?.email;
    if (!email) continue;
    const meta = u?.user_metadata || {};
    const code = normalize(meta.analyst_code);
    const fullName = normalize(meta.full_name);
    const initials = initialsOf(meta.full_name);
    const localPart = normalize(email.split('@')[0]);

    // Collect possible keys
    const keys = Array.from(new Set([code, fullName, initials, localPart].filter(Boolean)));
    userKeyMap[email] = keys;
    for (const k of keys) {
      if (!keyToEmail[k]) keyToEmail[k] = email;
    }
  }

  // Return only keys that are needed
  const result = {};
  for (const k of needed) {
    if (keyToEmail[k]) result[k] = keyToEmail[k];
  }

  return debug ? { map: result, userKeyMap } : result;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Prevent any CDN/proxy caching
    try { res.setHeader('Cache-Control', 'no-store'); } catch (e) {}
    // Only execute at 5pm America/New_York (robust hour extraction)
    const hourNY = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false
    }).format(new Date()), 10);

    // Test override: allow force run via query or body
    const forceRun = (
      (req.query && (req.query.force === '1' || req.query.force === 'true')) ||
      (req.body && (req.body.force === '1' || req.body.force === 'true'))
    );

    // Optional: trigger a fresh earnings refresh in the same environment before reading
    const doRefresh = (
      (req.query && (req.query.refresh === '1' || req.query.refresh === 'true')) ||
      (req.body && (req.body.refresh === '1' || req.body.refresh === 'true'))
    );

    // Env override (useful for Vercel "Run" button): FORCE_CRON=1/true/yes/on
    const envForce = ['1','true','yes','on'].includes(String(process.env.FORCE_CRON || '').toLowerCase());

    // Optional test recipient override for analyst emails
    const testTo = (
      (req.query && typeof req.query.testTo === 'string' && req.query.testTo) ||
      (req.body && typeof req.body.testTo === 'string' && req.body.testTo) ||
      ''
    );

    // Optional debug flag to return grouping info
    const debug = (
      (req.query && (req.query.debug === '1' || req.query.debug === 'true')) ||
      (req.body && (req.body.debug === '1' || req.body.debug === 'true'))
    );

    if (!forceRun && !envForce && hourNY !== 17) {
      return res.status(200).json({ success: true, skipped: true, reason: `Current NY hour ${hourNY} != 17` });
    }

    if (doRefresh) {
      const host = (req.headers && req.headers.host) || '';
      const proto = 'https:'; // Vercel production uses HTTPS
      const url = `${proto}//${host}/api/cron-refresh-earnings?force=1`;
      try {
        const r = await fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-store' } });
        // best-effort; ignore body
        if (!r.ok) {
          console.warn('Pre-refresh call failed:', r.status);
        }
        // Small delay to let writes settle
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.warn('Pre-refresh call error:', e?.message || e);
      }
    }

    const fetchResult = await fetchLateTickers();
    const lateItems = fetchResult.results || fetchResult; // Handle both old and new return formats
    const fetchDebugInfo = fetchResult.debugInfo || {};

    // Always email MM
    const adminEmail = 'mmajzner@clearlinecap.com';
    const adminSummary = buildSummaryEmail(lateItems);
    const adminSendRes = await resend.emails.send({
      from: `${process.env.FROM_NAME || 'Clearline Flow App'} <${process.env.FROM_EMAIL || 'noreply@clearlineflow.com'}>`,
      to: [adminEmail],
      subject: adminSummary.subject,
      html: adminSummary.html
    });
    const adminSend = { id: (adminSendRes && (adminSendRes.id || (adminSendRes.data && adminSendRes.data.id))) || null };

    // Simple sleep helper
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Small delay after admin email to respect provider rate limits
    await sleep(800);

    // Email each analyst
    const byAnalyst = lateItems.reduce((acc, item) => {
      const key = (item.who || 'UNKNOWN').trim().toUpperCase();
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    // Load optional static mapping from env
    let staticMap = {};
    const rawMap = process.env.ANALYST_EMAIL_MAP;
    if (rawMap && typeof rawMap === 'string') {
      try {
        const parsed = JSON.parse(rawMap);
        // Normalize keys to uppercase
        Object.keys(parsed || {}).forEach(k => {
          if (parsed[k]) staticMap[k.toUpperCase()] = parsed[k];
        });
      } catch (e) {
        console.warn('Invalid ANALYST_EMAIL_MAP JSON:', e?.message || e);
      }
    }

    let analystEmailMap = {};
    let userKeyMap = {};
    try {
      const lookup = await getAnalystEmailMap(lateItems, debug);
      analystEmailMap = debug ? lookup.map : lookup;
      userKeyMap = debug ? lookup.userKeyMap : {};
    } catch (err) {
      console.warn('Skipping analyst emails; failed to fetch users:', err?.message || err);
      analystEmailMap = {};
    }

    // Normalize Supabase map keys to uppercase and merge static map (static overrides)
    const mergedMap = { ...Object.fromEntries(Object.entries(analystEmailMap).map(([k,v]) => [String(k).toUpperCase(), v])), ...staticMap };

    const groupsInfo = Object.fromEntries(Object.entries(byAnalyst).map(([k, v]) => [k, v.length]));
    const whoKeys = Object.keys(byAnalyst);

    // Helper to send one analyst email with retry/backoff on rate limits
    const sendOne = async (analyst, items) => {
      const toEmail = testTo || mergedMap[analyst];
      const source = testTo ? 'testTo' : (mergedMap[analyst] ? 'map' : 'none');
      if (!toEmail) return { analyst, ok: false, source, toEmail: null, id: null, error: 'no-email' };
      const msg = buildAnalystEmail(analyst, items);

      const maxRetries = 3;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = await resend.emails.send({
            from: `${process.env.FROM_NAME || 'Clearline Flow App'} <${process.env.FROM_EMAIL || 'noreply@clearlineflow.com'}>`,
            to: [toEmail],
            subject: msg.subject,
            html: msg.html
          });
          const errorMsg = res?.error?.message || res?.error;
          if (errorMsg) throw new Error(String(errorMsg));
          const id = (res && (res.id || (res.data && res.data.id))) || null;
          return { analyst, ok: true, source, toEmail, id };
        } catch (e) {
          const msgText = String(e?.message || e);
          const isRate = msgText.toLowerCase().includes('too many requests') || msgText.includes('429');
          if (isRate && attempt < maxRetries) {
            // Exponential backoff with base 900ms
            await sleep(900 * (attempt + 1));
            continue;
          }
          return { analyst, ok: false, source, toEmail, id: null, error: msgText };
        }
      }
    };

    // Always send sequentially with delays to respect rate limit across admin + analysts
    const analystMessageIds = [];
    const lookupDetails = [];
    let sentCount = 0;
    for (const [analyst, items] of Object.entries(byAnalyst)) {
      const r = await sendOne(analyst, items);
      if (r.ok) sentCount += 1;
      analystMessageIds.push({ analyst: r.analyst, id: r.id, status: r.ok ? 'ok' : 'error', error: r.error });
      lookupDetails.push({ analyst: r.analyst, resolved: r.ok, source: r.source, toEmail: r.toEmail, error: r.error });
      await sleep(800);
    }

    const response = {
      success: true,
      forced: !!forceRun,
      envForced: !!envForce,
      adminMessageId: adminSend?.id || null,
      sentToAnalysts: sentCount,
      lateCount: lateItems.length,
      testTo: testTo || undefined,
      analystMessageIds
    };
    if (debug) {
      response.groups = groupsInfo;
      response.mappedAnalysts = Object.keys(mergedMap);
      response.whoKeys = whoKeys;
      response.lookupDetails = lookupDetails;
      // Add debug info from fetchLateTickers
      response.fetchDebugInfo = fetchDebugInfo;
      // Limit userKeyMap sample size for response
      const sample = {};
      let count = 0;
      for (const [email, keys] of Object.entries(userKeyMap)) {
        sample[email] = keys;
        count += 1;
        if (count >= 25) break;
      }
      response.userKeyMapSample = sample;
    }
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in cron-earnings-late:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 