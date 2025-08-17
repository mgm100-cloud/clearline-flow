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
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Pull all earnings tracking with joined ticker + analyst
  const { data, error } = await supabase
    .from('earnings_tracking')
    .select(`
      id,
      earnings_date,
      preview_date,
      callback_date,
      cyq,
      tickers!ticker_id (
        ticker,
        analyst
      )
    `);

  if (error) throw error;

  const results = [];
  for (const row of data || []) {
    const ticker = row.tickers?.ticker;
    const who = row.tickers?.analyst || '';
    const earningsDate = row.earnings_date || null;
    const previewDate = row.preview_date || null;
    const callbackDate = row.callback_date || null;

    if (!earningsDate) continue;
    const days = daysUntilInNY(earningsDate);
    if (days == null) continue;
    if (days >= 0 && days <= 14) {
      const isLate = !previewDate || !callbackDate;
      if (isLate) {
        results.push({
          ticker,
          who,
          earningsDate,
          previewDate,
          callbackDate,
          cyq: row.cyq,
          days
        });
      }
    }
  }

  return results;
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
  const supabase = createClient(supabaseUrl, serviceRoleKey);

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
    // Only execute at 5pm America/New_York to avoid DST discrepancies if scheduled twice
    const nowNY = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hourNY = nowNY.getHours();

    // Test override: allow force run via query or body
    const forceRun = (
      (req.query && (req.query.force === '1' || req.query.force === 'true')) ||
      (req.body && (req.body.force === '1' || req.body.force === 'true'))
    );

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

    if (!forceRun && hourNY !== 17) {
      return res.status(200).json({ success: true, skipped: true, reason: `Current NY hour ${hourNY} != 17` });
    }

    const lateItems = await fetchLateTickers();

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

    const analystTasks = Object.entries(byAnalyst).map(async ([analyst, items]) => {
      const toEmail = testTo || mergedMap[analyst];
      const source = testTo ? 'testTo' : (mergedMap[analyst] ? 'map' : 'none');
      if (!toEmail) {
        return { analyst, ok: false, source, toEmail: null, id: null, error: 'no-email' };
      }
      const msg = buildAnalystEmail(analyst, items);
      try {
        const res = await resend.emails.send({
          from: `${process.env.FROM_NAME || 'Clearline Flow App'} <${process.env.FROM_EMAIL || 'noreply@clearlineflow.com'}>`,
          to: [toEmail],
          subject: msg.subject,
          html: msg.html
        });
        const id = (res && (res.id || (res.data && res.data.id))) || null;
        return { analyst, ok: true, source, toEmail, id };
      } catch (e) {
        return { analyst, ok: false, source, toEmail, id: null, error: e?.message || String(e) };
      }
    });
    const settled = await Promise.allSettled(analystTasks);
    const analystMessageIds = [];
    const lookupDetails = [];
    let sentCount = 0;
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        const r = s.value;
        if (r.ok) sentCount += 1;
        analystMessageIds.push({ analyst: r.analyst, id: r.id, status: r.ok ? 'ok' : 'error', error: r.error });
        lookupDetails.push({ analyst: r.analyst, resolved: r.ok, source: r.source, toEmail: r.toEmail, error: r.error });
      } else {
        analystMessageIds.push({ analyst: 'unknown', id: null, status: 'error', error: s.reason?.message || String(s.reason) });
      }
    }

    const response = {
      success: true,
      forced: !!forceRun,
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