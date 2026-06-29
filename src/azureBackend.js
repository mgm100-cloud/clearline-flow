// azureBackend.js
// ----------------------------------------------------------------------------
// A drop-in, API-compatible replacement for the slice of the supabase-js client
// this app actually uses ( .from / .rpc / .auth.* ), backed by Azure instead of
// Supabase:
//   - DATA  -> self-hosted PostgREST (clflow-pgrst) over Azure Postgres (clflow-pg)
//   - AUTH  -> Microsoft Entra (MSAL) + a token-exchange (clflow-tokenexch) that
//             mints the short-lived PostgREST JWT { role:'authenticated', sub:oid }.
//
// Activated only when REACT_APP_BACKEND === 'azure' (see supabaseClient.js); the
// real Supabase client is used otherwise. This keeps the ~158 data call sites and
// authService.js completely unchanged across the cutover.
//
// NOTE (phasing): getSession().access_token returns the Entra ID token so that the
// Azure-ported Edge Functions (Phase 4) can verify it. Until those functions land,
// CRM email (which still posts to Supabase /functions/v1/*) is the only feature that
// won't work under the azure flag — everything data + auth does.
import { PublicClientApplication, EventType } from '@azure/msal-browser'
import { PostgrestClient } from '@supabase/postgrest-js'

const POSTGREST_URL = process.env.REACT_APP_AZURE_POSTGREST_URL   // https://clflow-pgrst.azurewebsites.net
const EXCHANGE_URL  = process.env.REACT_APP_AZURE_TOKENEXCH_URL   // https://clflow-tokenexch.azurewebsites.net/exchange
const TENANT_ID     = process.env.REACT_APP_AZURE_TENANT_ID
const CLIENT_ID     = process.env.REACT_APP_AZURE_FLOW_CLIENT_ID

// openid+profile+email is enough to get a refreshable ID token (aud = our app);
// that ID token is what the token-exchange verifies.
const LOGIN_SCOPES = ['openid', 'profile', 'email']

export function createAzureBackend() {
  if (!POSTGREST_URL || !EXCHANGE_URL || !TENANT_ID || !CLIENT_ID) {
    console.error('❌ Azure backend selected but config is missing. Need REACT_APP_AZURE_POSTGREST_URL / _TOKENEXCH_URL / _TENANT_ID / _FLOW_CLIENT_ID')
  }
  console.log('🔧 Backend: AZURE (PostgREST + Entra). PostgREST:', POSTGREST_URL ? 'Set' : 'Missing')

  const msal = new PublicClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: `https://login.microsoftonline.com/${TENANT_ID}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
  })

  let initPromise = null
  const ensureInit = () => (initPromise = initPromise || msal.initialize())

  // ---- auth-state listeners (bridge MSAL -> supabase-style onAuthStateChange) ----
  const listeners = new Set()
  const emit = (event, session) =>
    listeners.forEach(cb => { try { cb(event, session) } catch (e) { console.error('auth listener error', e) } })

  const activeAccount = () => msal.getActiveAccount() || msal.getAllAccounts()[0] || null

  // ---- token plumbing -------------------------------------------------------
  let pgrstToken = null
  let pgrstExp = 0

  async function getEntraIdToken(interactiveOk = false) {
    await ensureInit()
    const account = activeAccount()
    if (!account) return null
    try {
      const r = await msal.acquireTokenSilent({ account, scopes: LOGIN_SCOPES })
      return r.idToken
    } catch (e) {
      if (!interactiveOk) throw e
      const r = await msal.acquireTokenPopup({ scopes: LOGIN_SCOPES })
      msal.setActiveAccount(r.account)
      return r.idToken
    }
  }

  // PostgREST JWT, cached until ~2 min before expiry.
  async function getPgrstToken() {
    const now = Math.floor(Date.now() / 1000)
    if (pgrstToken && now < pgrstExp - 120) return pgrstToken
    const idToken = await getEntraIdToken()
    if (!idToken) return null
    const res = await fetch(EXCHANGE_URL, { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } })
    if (!res.ok) throw new Error(`token exchange failed: ${res.status}`)
    const j = await res.json()
    pgrstToken = j.token
    pgrstExp = j.exp || (now + 3000)
    return pgrstToken
  }

  const clearTokenCache = () => { pgrstToken = null; pgrstExp = 0 }

  // ---- data client: PostgREST, with the minted JWT injected per request -----
  const authedFetch = async (input, init = {}) => {
    let token = null
    try { token = await getPgrstToken() } catch (e) { console.warn('pgrst token unavailable:', e.message) }
    const headers = new Headers(init.headers || {})
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers })
  }
  const rest = new PostgrestClient(POSTGREST_URL, { schema: 'public', fetch: authedFetch })

  // ---- build the supabase-shaped user from the Entra account + user_profiles -
  // role/division/analyst_code/full_name live in user_profiles (keyed by Entra oid
  // after the re-key), NOT in Entra — mirror what user_metadata held under Supabase.
  async function buildUser() {
    await ensureInit()
    const account = activeAccount()
    if (!account) return null
    const oid = account.idTokenClaims?.oid || account.localAccountId
    const email = (account.username || account.idTokenClaims?.preferred_username || '').toLowerCase()
    let meta = { role: 'readonly', full_name: account.name || email, division: '', analyst_code: '' }
    try {
      const { data } = await rest.from('user_profiles')
        .select('role, full_name, division, analyst_code').eq('id', oid).single()
      if (data) meta = { ...meta, ...data }
    } catch (_) { /* no profile row yet -> safe defaults */ }
    return { id: oid, email, user_metadata: meta, app_metadata: {} }
  }

  async function buildSession() {
    const user = await buildUser()
    if (!user) return null
    const access_token = await getEntraIdToken().catch(() => null)
    return { access_token, token_type: 'bearer', user }
  }

  // ---- auth shim (covers exactly the surface authService.js / app use) ------
  const auth = {
    async getUser() {
      try { return { data: { user: await buildUser() }, error: null } }
      catch (error) { return { data: { user: null }, error } }
    },

    async getSession() {
      try { return { data: { session: await buildSession() }, error: null } }
      catch (error) { return { data: { session: null }, error } }
    },

    // Entra owns credentials — email/password args are ignored; we open the MSAL flow.
    async signInWithPassword() {
      await ensureInit()
      try {
        const r = await msal.loginPopup({ scopes: LOGIN_SCOPES, prompt: 'select_account' })
        msal.setActiveAccount(r.account)
        clearTokenCache()
        const session = await buildSession()
        emit('SIGNED_IN', session)
        return { data: { user: session?.user || null, session }, error: null }
      } catch (error) { return { data: { user: null, session: null }, error } }
    },

    async signOut() {
      await ensureInit()
      const account = activeAccount()
      clearTokenCache()
      emit('SIGNED_OUT', null)
      try { await msal.logoutPopup({ account }) } catch (_) { /* popup closed is fine */ }
      return { error: null }
    },

    // Users are provisioned in Entra, not self-signup.
    async signUp() {
      return { data: { user: null, session: null }, error: new Error('Sign-up is managed in Microsoft Entra — contact an administrator.') }
    },

    // user_metadata lives in user_profiles under Entra -> persist there.
    async updateUser({ data } = {}) {
      try {
        const user = await buildUser()
        if (!user) throw new Error('no active user')
        const patch = {}
        for (const k of ['role', 'full_name', 'division', 'analyst_code']) {
          if (data && k in data) patch[k] = data[k]
        }
        if (Object.keys(patch).length) {
          const { error } = await rest.from('user_profiles').update(patch).eq('id', user.id)
          if (error) throw error
        }
        return { data: { user: await buildUser() }, error: null }
      } catch (error) { return { data: { user: null }, error } }
    },

    // Entra self-service password reset handles this — nothing to do client-side.
    async resetPasswordForEmail() { return { data: {}, error: null } },

    onAuthStateChange(callback) {
      listeners.add(callback)
      ;(async () => {
        try {
          await ensureInit()
          callback('INITIAL_SESSION', activeAccount() ? await buildSession() : null)
        } catch (e) { console.error('initial session error', e) }
      })()
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } }
    },

    // MFA is enforced by Entra Conditional Access at login -> session is always AAL2.
    mfa: {
      async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null } },
      async listFactors() { return { data: { all: [], totp: [], phone: [] }, error: null } },
      async enroll() { return { data: null, error: new Error('MFA is managed by Microsoft Entra.') } },
      async challenge() { return { data: null, error: new Error('MFA is managed by Microsoft Entra.') } },
      async verify() { return { data: null, error: new Error('MFA is managed by Microsoft Entra.') } },
      async unenroll() { return { data: null, error: null } },
    },
  }

  // keep the active account in sync on background login events
  ensureInit().then(() => {
    msal.addEventCallback((evt) => {
      if (evt.eventType === EventType.LOGIN_SUCCESS && evt.payload?.account) {
        msal.setActiveAccount(evt.payload.account)
      }
    })
  }).catch(e => console.error('msal init failed', e))

  // The supabase-compatible surface the app consumes.
  return {
    from: (...a) => rest.from(...a),
    rpc: (...a) => rest.rpc(...a),
    schema: (s) => rest.schema(s),
    auth,
    __backend: 'azure',
  }
}
