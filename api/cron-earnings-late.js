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
    const who = item.who || 'UNKNOWN';
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
    subject: `Earnings Late Check: ${lateItems.length} late`,
    html
  };
}

async function getAnalystEmailMap(lateItems) {
  // Build a set of analyst codes we need emails for
  const codes = Array.from(new Set((lateItems || []).map(i => i.who).filter(Boolean)));
  if (!codes.length) return {};

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // List all users, then filter by metadata.analyst_code
  const users = [];
  let nextPage = null;
  do {
    const { data, error } = await supabase.auth.admin.listUsers({ page: nextPage || 1 });
    if (error) throw error;
    users.push(...(data?.users || []));
    // listUsers in v2 returns { users, nextPage } if paginated; fall back if not provided
    nextPage = data?.nextPage || null;
  } while (nextPage);

  const map = {};
  for (const u of users) {
    const code = u?.user_metadata?.analyst_code;
    if (code && codes.includes(code)) {
      map[code] = u.email;
    }
  }
  return map;
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

    if (!forceRun && hourNY !== 17) {
      return res.status(200).json({ success: true, skipped: true, reason: `Current NY hour ${hourNY} != 17` });
    }

    const lateItems = await fetchLateTickers();

    // Always email MM
    const adminEmail = 'mmajzner@clearlinecap.com';
    const adminSummary = buildSummaryEmail(lateItems);
    await resend.emails.send({
      from: `${process.env.FROM_NAME || 'Clearline Flow App'} <${process.env.FROM_EMAIL || 'noreply@clearlineflow.com'}>`,
      to: [adminEmail],
      subject: adminSummary.subject,
      html: adminSummary.html
    });

    // Email each analyst
    const byAnalyst = lateItems.reduce((acc, item) => {
      const key = item.who || 'UNKNOWN';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    let analystEmailMap = {};
    try {
      analystEmailMap = await getAnalystEmailMap(lateItems);
    } catch (err) {
      console.warn('Skipping analyst emails; failed to fetch users:', err?.message || err);
      analystEmailMap = {};
    }

    for (const [analyst, items] of Object.entries(byAnalyst)) {
      const toEmail = analystEmailMap[analyst];
      if (!toEmail) continue; // skip if we cannot find an email for this analyst
      const msg = buildAnalystEmail(analyst, items);
      await resend.emails.send({
        from: `${process.env.FROM_NAME || 'Clearline Flow App'} <${process.env.FROM_EMAIL || 'noreply@clearlineflow.com'}>`,
        to: [toEmail],
        subject: msg.subject,
        html: msg.html
      });
    }

    return res.status(200).json({ success: true, forced: !!forceRun, sentToAnalysts: Object.keys(analystEmailMap).length, lateCount: lateItems.length });
  } catch (error) {
    console.error('Error in cron-earnings-late:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 