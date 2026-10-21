// Who may call the Vercel functions (2026-10-21).
//
// Until today every function under /api answered ANYONE on the internet: /api/send-email sent whatever HTML
// a stranger posted, to whoever they named, FROM whatever address they chose (an open relay for phishing as
// Clearline); /api/superllm-stream spent the firm's OpenAI / Anthropic / Gemini keys for anyone; the job
// endpoints (/api/cron-*, /api/update-quarter-end-dates) ran with the Supabase SERVICE ROLE on any GET.
//
//   requireUser(req) -> { id, email } | null
//     The caller's Supabase session (Authorization: Bearer <access token>), checked with Supabase itself
//     (/auth/v1/user - the same check Prism's handlers make), and only a CONFIRMED @clearlinecap.com account.
//     The domain test matters because sign-up on the Supabase project has been open: an outsider could
//     register their own address and hold a valid session.
//   requireCron(req) -> boolean
//     The job endpoints are no longer scheduled here (vercel.json has no crons since 2026-07-21; the jobs run
//     on Azure). They now answer only `Authorization: Bearer <CRON_SECRET>` - the header Vercel Cron sends when
//     CRON_SECRET is set - and with no CRON_SECRET configured they answer nobody.
import crypto from 'crypto';

// Public by design (it is in every visitor's browser and in this public repository); never the service key.
const SUPA_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || 'https://zdlpbpcezvpkfqbqmefw.supabase.co';
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkbHBicGNlenZwa2ZxYnFtZWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzMDAwMzIsImV4cCI6MjA2Mzg3NjAzMn0._BgtRvJ0wNMaPj0k7Tu1WWjengFW8jc42u0vq9tTwA4';
const DOMAINS = ['clearlinecap.com'];

export async function requireUser(req) {
  const h = String((req.headers && (req.headers.authorization || req.headers['x-flow-auth'])) || '');
  if (!/^Bearer \S+$/i.test(h)) return null;
  let r;
  try {
    r = await fetch(SUPA_URL + '/auth/v1/user', { headers: { apikey: SUPA_ANON, Authorization: h }, signal: AbortSignal.timeout(8000) });
  } catch (_e) { return null; }
  if (!r.ok) return null;
  let u = null;
  try { u = await r.json(); } catch (_e) { return null; }
  const email = String((u && u.email) || '').toLowerCase();
  if (!email || !DOMAINS.some((d) => email.endsWith('@' + d))) return null;
  if (!(u.email_confirmed_at || u.confirmed_at)) return null;
  return { id: u.id, email };
}

export function requireCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(String((req.headers && req.headers.authorization) || ''));
  const want = Buffer.from('Bearer ' + secret);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export function deny(res, status, error) {
  return res.status(status).json({ error });
}
