// Supabase Edge Function: CRM Outlook OAuth
// Handles OAuth flow for connecting Outlook accounts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // GET /crm-outlook-oauth?action=authorize
    // Returns authorization URL
    if (req.method === 'GET' && action === 'authorize') {
      const redirectUri = url.searchParams.get('redirect_uri') || ''
      const state = url.searchParams.get('state') || ''

      const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
      authUrl.searchParams.set('client_id', Deno.env.get('MICROSOFT_CLIENT_ID') ?? '')
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_mode', 'query')
      authUrl.searchParams.set(
        'scope',
        'openid profile email offline_access Mail.ReadWrite Mail.Send User.Read'
      )
      authUrl.searchParams.set('state', state)

      return new Response(JSON.stringify({ authUrl: authUrl.toString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // POST /crm-outlook-oauth?action=callback
    // Exchanges code for tokens and saves mailbox
    if (req.method === 'POST' && action === 'callback') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        throw new Error('No authorization header')
      }

      const token = authHeader.replace('Bearer ', '')
      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser(token)

      if (userError || !user) {
        throw new Error('Unauthorized')
      }

      const body = await req.json()
      const { code, redirectUri } = body

      // Exchange code for tokens
      const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: Deno.env.get('MICROSOFT_CLIENT_ID') ?? '',
          client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET') ?? '',
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Failed to exchange code: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()

      // Get user profile from Graph
      const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      })

      if (!profileResponse.ok) {
        throw new Error('Failed to get user profile')
      }

      const profile = await profileResponse.json()

      // Save or update mailbox
      const { data: mailbox, error: mailboxError } = await supabaseClient
        .from('mailboxes')
        .upsert(
          {
            user_id: user.id,
            provider: 'outlook',
            email_address: profile.mail || profile.userPrincipalName,
            status: 'active',
            oauth_access_token: tokenData.access_token,
            oauth_refresh_token: tokenData.refresh_token,
            oauth_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
            oauth_scope: tokenData.scope,
          },
          {
            onConflict: 'user_id,email_address',
          }
        )
        .select()
        .single()

      if (mailboxError) throw mailboxError

      return new Response(
        JSON.stringify({
          success: true,
          mailbox: {
            id: mailbox.id,
            email_address: mailbox.email_address,
            status: mailbox.status,
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // GET /crm-outlook-oauth?action=status
    // Returns current mailbox status
    if (req.method === 'GET' && action === 'status') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        throw new Error('No authorization header')
      }

      const token = authHeader.replace('Bearer ', '')
      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser(token)

      if (userError || !user) {
        throw new Error('Unauthorized')
      }

      const { data: mailboxes, error: mailboxError } = await supabaseClient
        .from('mailboxes')
        .select('id, email_address, status, last_synced_at')
        .eq('user_id', user.id)

      if (mailboxError) throw mailboxError

      return new Response(JSON.stringify({ mailboxes }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action or method' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  } catch (error) {
    console.error('OAuth error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

