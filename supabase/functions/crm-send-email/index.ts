// Supabase Edge Function: CRM Send Email via Microsoft Graph
// Sends emails through Outlook using Microsoft Graph API

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailRecipient {
  address: string
  kind: 'to' | 'cc' | 'bcc'
  contactId?: string
}

interface SendEmailRequest {
  subject: string
  htmlBody: string
  recipients: EmailRecipient[]
  relatedAccountId?: string
  relatedContactId?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get current user
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

    const body: SendEmailRequest = await req.json()

    // Get user's mailbox OAuth token
    const { data: mailbox, error: mailboxError } = await supabaseClient
      .from('mailboxes')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (mailboxError || !mailbox) {
      throw new Error('No active mailbox found. Please connect your Outlook account.')
    }

    // Check if token is expired and refresh if needed
    let accessToken = mailbox.oauth_access_token
    if (new Date(mailbox.oauth_token_expires_at) <= new Date()) {
      // Refresh token
      const refreshResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: Deno.env.get('MICROSOFT_CLIENT_ID') ?? '',
          client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET') ?? '',
          refresh_token: mailbox.oauth_refresh_token,
          grant_type: 'refresh_token',
        }),
      })

      if (!refreshResponse.ok) {
        throw new Error('Failed to refresh access token')
      }

      const refreshData = await refreshResponse.json()
      accessToken = refreshData.access_token

      // Update mailbox with new tokens
      await supabaseClient
        .from('mailboxes')
        .update({
          oauth_access_token: refreshData.access_token,
          oauth_refresh_token: refreshData.refresh_token || mailbox.oauth_refresh_token,
          oauth_token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
        })
        .eq('id', mailbox.id)
    }

    // Build Microsoft Graph message
    const toRecipients = body.recipients
      .filter((r) => r.kind === 'to')
      .map((r) => ({ emailAddress: { address: r.address } }))
    const ccRecipients = body.recipients
      .filter((r) => r.kind === 'cc')
      .map((r) => ({ emailAddress: { address: r.address } }))
    const bccRecipients = body.recipients
      .filter((r) => r.kind === 'bcc')
      .map((r) => ({ emailAddress: { address: r.address } }))

    const message = {
      subject: body.subject,
      body: {
        contentType: 'HTML',
        content: body.htmlBody,
      },
      toRecipients,
      ccRecipients,
      bccRecipients,
    }

    // Create draft message
    const createResponse = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    if (!createResponse.ok) {
      const errorData = await createResponse.text()
      throw new Error(`Failed to create message: ${errorData}`)
    }

    const createdMessage = await createResponse.json()

    // Send the message
    const sendResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${createdMessage.id}/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!sendResponse.ok) {
      const errorData = await sendResponse.text()
      throw new Error(`Failed to send message: ${errorData}`)
    }

    // Save to email_outbound
    const { data: emailOutbound, error: emailError } = await supabaseClient
      .from('email_outbound')
      .insert({
        created_by: user.id,
        subject: body.subject,
        html_body: body.htmlBody,
        sent_via: 'graph',
        sent_at: new Date().toISOString(),
        outlook_message_id: createdMessage.id,
        internet_message_id: createdMessage.internetMessageId,
        related_account_id: body.relatedAccountId || null,
        related_contact_id: body.relatedContactId || null,
      })
      .select()
      .single()

    if (emailError) throw emailError

    // Save recipients
    const recipientInserts = body.recipients.map((r) => ({
      email_outbound_id: emailOutbound.id,
      contact_id: r.contactId || null,
      address: r.address,
      kind: r.kind,
    }))

    await supabaseClient.from('email_outbound_recipients').insert(recipientInserts)

    // Create task for SentEmail
    if (body.relatedAccountId) {
      await supabaseClient.from('tasks').insert({
        account_id: body.relatedAccountId,
        contact_id: body.relatedContactId || null,
        subject: body.subject,
        activity_date: new Date().toISOString().split('T')[0],
        description: body.htmlBody.substring(0, 500), // First 500 chars
        interaction_type: 'SentEmail',
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailId: emailOutbound.id,
        outlookMessageId: createdMessage.id,
        internetMessageId: createdMessage.internetMessageId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error sending email:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

