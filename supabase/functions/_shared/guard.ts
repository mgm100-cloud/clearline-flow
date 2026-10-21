// Who may call the CRM edge functions (2026-10-21).
//
// The ten crm-* functions are still deployed on the Supabase project, though nothing calls them any more (the
// separate CRM Tool replaced them). Until today they trusted the platform gate alone, and that gate (verify_jwt)
// only proves the caller holds SOME token signed by this project. The public anon key - in every visitor's
// browser and in this public repository - is one. So:
//   - crm-outlook-sync and crm-weekly-diligence-report ran with the SERVICE ROLE for anyone (read every connected
//     mailbox; email the distribution list);
//   - crm-resend-webhook wrote email events for anyone;
//   - crm-send-email / crm-send-bulk-email / crm-outlook-oauth asked only "is anybody signed in", and sign-up on
//     the project has been open, so an outsider could register their own address and send mail as Clearline;
//   - crm-accounts / -contacts / -tasks / -search leaned on RLS through has_crm_access(), whose answer comes from
//     a division the user can set on their own profile.
// The checks below run inside each function, so a redeploy of this code is deny-by-default.
//
//   requireStaff(req) -> { user: { id, email }, token } | Response (401 / 403)
//     The caller's Supabase session, checked with Supabase itself (/auth/v1/user - the same check
//     lib/flowAuth.js makes for the Vercel functions), a CONFIRMED address on ALLOWED_EMAIL_DOMAINS
//     (default clearlinecap.com), and has_crm_access() true for that session.
//   requireCronSecret(req, envName = 'CRM_CRON_SECRET') -> null | Response (401)
//     For the jobs. `x-cron-secret: <secret>` (or `Authorization: Bearer <secret>` where verify_jwt is off), or
//     `Authorization: Bearer <service role key>` - the shape the pg_cron jobs in CRM-DEPLOYMENT-GUIDE.md send.
//     Neither configured = nobody passes.
//   verifyResendWebhook(req, rawBody) -> null | Response (401)
//     Resend signs each delivery the Svix way; RESEND_WEBHOOK_SECRET unset = every delivery is refused.
//
// No imports on purpose: Node can load this file directly (tests/security/edge_guard_check.mjs) and Deno runs
// the same bytes.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

// Deno on Supabase, process.env under Node (the tests). Read on every call, never cached at load.
function env(name: string): string {
  const g = globalThis as any
  try {
    const v = g.Deno?.env?.get(name)
    if (typeof v === 'string') return v
  } catch (_e) {
    // Deno without env permission: fall through.
  }
  const p = g.process?.env?.[name]
  return typeof p === 'string' ? p : ''
}

const SIGN_IN = 'sign in required'
const STAFF_ONLY = 'Clearline CRM staff only'
const UNAUTHORIZED = 'unauthorized'
const enc = new TextEncoder()

function drain(r: Response): void {
  try {
    r.body?.cancel().catch(() => {})
  } catch (_e) {
    // nothing to release
  }
}

function allowedDomains(): string[] {
  return (env('ALLOWED_EMAIL_DOMAINS') || 'clearlinecap.com')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@+/, ''))
    .filter(Boolean)
}

export async function requireStaff(
  req: Request
): Promise<{ user: { id: string; email: string }; token: string } | Response> {
  // 2026-10-21: no Bearer session, no entry. Nothing is fetched for a caller who sent none.
  const m = /^Bearer\s+(\S+)$/i.exec((req.headers.get('authorization') || '').trim())
  if (!m) return json(401, { error: SIGN_IN })
  const token = m[1]

  const base = env('SUPABASE_URL').replace(/\/+$/, '')
  const anon = env('SUPABASE_ANON_KEY')
  if (!base || !anon) {
    console.error('requireStaff: SUPABASE_URL / SUPABASE_ANON_KEY not set; refusing every caller')
    return json(401, { error: SIGN_IN })
  }

  // 2026-10-21: ask Supabase who the token belongs to. verify_jwt passes the anon key; /auth/v1/user does not,
  // because the anon key names no user. Supabase's own error text is never passed on.
  let u: any = null
  try {
    const r = await fetch(base + '/auth/v1/user', {
      headers: { apikey: anon, Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(8000),
    })
    if (r.status !== 200) {
      drain(r)
      return json(401, { error: SIGN_IN })
    }
    u = await r.json()
  } catch (e) {
    console.error('requireStaff: /auth/v1/user check failed', e)
    return json(401, { error: SIGN_IN })
  }
  const id = u && typeof u.id === 'string' ? u.id : ''
  const email = String((u && u.email) || '').trim().toLowerCase()
  if (!id || !email) return json(401, { error: SIGN_IN })

  // 2026-10-21: sign-up on the project has been open, so a session alone proves nothing. The address must be
  // confirmed and sit exactly on an allowed domain ('x@evil.clearlinecap.com' does not end in '@clearlinecap.com').
  // "Confirmed" only means something while the project's 'Confirm email' setting is ON (auth settings
  // mailer_autoconfirm false): with it off, Supabase stamps email_confirmed_at at sign-up for any address,
  // including a made-up one on clearlinecap.com. Check that setting before redeploying.
  if (!u.email_confirmed_at) return json(403, { error: STAFF_ONLY })
  if (email.split('@').length !== 2) return json(403, { error: STAFF_ONLY })
  if (!allowedDomains().some((d) => email.endsWith('@' + d))) return json(403, { error: STAFF_ONLY })

  // 2026-10-21: and the CRM's own rule for this session (Marketing / Engineering / Super division), asked of the
  // database as the caller. Only a literal JSON true counts; an error or anything else is a no.
  let crm = false
  try {
    const r = await fetch(base + '/rest/v1/rpc/has_crm_access', {
      method: 'POST',
      headers: { apikey: anon, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 200) crm = (await r.json()) === true
    else drain(r)
  } catch (e) {
    console.error('requireStaff: has_crm_access check failed', e)
    crm = false
  }
  if (!crm) return json(403, { error: STAFF_ONLY })

  return { user: { id, email }, token }
}

// Equal-length byte compare that looks at every byte, so the time taken does not say how much matched.
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// Compare two strings by their SHA-256 digests: always 32 bytes each, so neither the length nor the first
// differing character of the secret shows in the timing.
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  return sameBytes(new Uint8Array(x), new Uint8Array(y))
}

export async function requireCronSecret(req: Request, envName = 'CRM_CRON_SECRET'): Promise<Response | null> {
  // 2026-10-21: the jobs run with the SERVICE ROLE, so only the scheduler may start one. An unset or empty
  // secret is never compared - otherwise 'Bearer ' or 'Bearer undefined' would match it - and with neither it
  // nor the service role key configured NOBODY passes.
  const secret = env(envName).trim()
  // 2026-10-21: the pg_cron jobs written from CRM-DEPLOYMENT-GUIDE.md send `Authorization: Bearer <service role
  // key>` and nothing else; refusing that would stop sync and the weekly report without a word. Whoever holds
  // that key can already read and write the whole database, so accepting it gives nobody anything new. Never
  // when it is unset, or when it equals the public anon key (a misconfiguration that would let everyone in).
  const serviceRole = env('SUPABASE_SERVICE_ROLE_KEY').trim()
  const serviceRoleOk = !!serviceRole && serviceRole !== env('SUPABASE_ANON_KEY').trim()
  if (!secret && !serviceRoleOk) return json(401, { error: UNAUTHORIZED })

  // 2026-10-21: two places to carry the secret. With verify_jwt on, the gateway insists Authorization is a
  // project JWT, so the scheduler sends it in x-cron-secret; with verify_jwt off, Authorization: Bearer works.
  const m = /^Bearer\s+(\S+)$/i.exec((req.headers.get('authorization') || '').trim())
  const bearer = m ? m[1] : ''
  const x = (req.headers.get('x-cron-secret') || '').trim()

  let ok = false
  if (secret) {
    for (const c of [bearer, x]) {
      if (c && (await sameSecret(c, secret))) ok = true
    }
  }
  // The service role key only as the Bearer value, the one place the documented jobs put it.
  if (serviceRoleOk && bearer && (await sameSecret(bearer, serviceRole))) ok = true
  return ok ? null : json(401, { error: UNAUTHORIZED })
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

// No return type written on purpose (2026-10-21): left to inference it is Uint8Array<ArrayBuffer> under
// TypeScript 5.7+ (what current Deno ships), which crypto.subtle.importKey accepts; a plain `: Uint8Array`
// widens to ArrayBufferLike and `deno check` rejects the importKey call. Older TypeScript infers Uint8Array.
function fromBase64(b64: string) {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

const WEBHOOK_TOLERANCE_SECONDS = 300

export async function verifyResendWebhook(req: Request, rawBody: string): Promise<Response | null> {
  const deny = () => json(401, { error: 'invalid signature' })

  // 2026-10-21: without the signing secret there is no way to tell Resend from anyone else, so refuse all.
  const secret = env('RESEND_WEBHOOK_SECRET').trim()
  if (!secret) {
    console.error('verifyResendWebhook: RESEND_WEBHOOK_SECRET not set; refusing every delivery')
    return deny()
  }

  const id = req.headers.get('svix-id') || ''
  const ts = req.headers.get('svix-timestamp') || ''
  const sigHeader = req.headers.get('svix-signature') || ''
  if (!id || !ts || !sigHeader || typeof rawBody !== 'string') return deny()

  // 2026-10-21: a signed delivery is only good for 5 minutes either side of now, so a captured one cannot be
  // replayed later.
  if (!/^\d{1,12}$/.test(ts)) return deny()
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > WEBHOOK_TOLERANCE_SECONDS) return deny()

  // 2026-10-21: Svix signs `${id}.${timestamp}.${raw body}` with HMAC-SHA256, keyed by the base64 part of
  // 'whsec_<base64>'. The raw bytes matter: a re-serialised JSON body would not match.
  let expected: Uint8Array
  try {
    const key = fromBase64(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret)
    if (!key.length) return deny()
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const mac = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(`${id}.${ts}.${rawBody}`))
    expected = enc.encode(toBase64(new Uint8Array(mac)))
  } catch (e) {
    console.error('verifyResendWebhook: could not use RESEND_WEBHOOK_SECRET', e)
    return deny()
  }

  // 'v1,<base64> v1,<base64> ...' - several entries while a secret is being rotated; any v1 match is enough.
  let ok = false
  for (const entry of sigHeader.trim().split(/\s+/)) {
    const comma = entry.indexOf(',')
    if (comma < 0 || entry.slice(0, comma) !== 'v1') continue
    if (sameBytes(enc.encode(entry.slice(comma + 1)), expected)) ok = true
  }
  return ok ? null : deny()
}

// ---- Small hardening helpers shared by the CRM functions (2026-10-21) ----

// Text pasted into a PostgREST .or()/.ilike() filter. A comma or bracket there would add filter terms of the
// caller's choosing, '*' and '%' are wildcards, and a double quote / backslash changes how the value is read.
// 2026-10-21: each of those (and backticks and control characters) becomes '_', ilike's match-any-ONE-character
// wildcard, rather than a space, so 'Smith, Jones' still finds 'Smith, Jones'. The apostrophe is not special to
// PostgREST and is kept, so O'Brien still matches. Whitespace is collapsed and the length capped.
export function searchTerm(text: unknown, max = 100): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[,()*%\\"`\u0000-\u001f\u007f]/g, '_')
    .trim()
    .slice(0, max)
    .trim()
}

// A query-string value that must be one of a fixed list (a sort column, a sort direction); anything else is the
// fallback.
export function oneOf(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback
}

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// An error whose message was written for the caller (never database / Microsoft / Resend text).
export function publicError(message: string, status = 400): Error {
  const e = new Error(message) as Error & { publicStatus?: number }
  e.publicStatus = status
  return e
}

// The catch-all reply: the full error goes to the function log; the caller gets either a publicError's own
// message or a fixed 'Request failed', never the upstream text (table, column, constraint or token details).
export function failure(error: unknown, where: string, status = 400): Response {
  console.error(where + ':', error)
  const e = error as { publicStatus?: unknown; message?: unknown } | null
  if (e && typeof e.publicStatus === 'number') return json(e.publicStatus, { error: String(e.message) })
  return json(status, { error: 'Request failed' })
}
