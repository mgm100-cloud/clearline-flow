// Supabase Edge Function: CRM Send Bulk Email via Resend
// Sends bulk emails to distribution lists using Resend API

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SendBulkEmailRequest {
  subject: string
  htmlBody: string
  distributionListId?: string
  recipientContactIds?: string[]
  relatedAccountId?: string
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

    const body: SendBulkEmailRequest = await req.json()

    // Get recipients
    let recipients: any[] = []

    if (body.distributionListId) {
      // Get contacts from distribution list
      const { data: members, error: membersError } = await supabaseClient
        .from('distribution_list_members')
        .select('contacts(id, email, first_name, last_name)')
        .eq('list_id', body.distributionListId)

      if (membersError) throw membersError

      recipients = members
        .map((m: any) => m.contacts)
        .filter((c: any) => c && c.email)
    } else if (body.recipientContactIds && body.recipientContactIds.length > 0) {
      // Get specific contacts
      const { data: contacts, error: contactsError } = await supabaseClient
        .from('contacts')
        .select('id, email, first_name, last_name')
        .in('id', body.recipientContactIds)
        .not('email', 'is', null)

      if (contactsError) throw contactsError

      recipients = contacts
    } else {
      throw new Error('Must provide either distributionListId or recipientContactIds')
    }

    if (recipients.length === 0) {
      throw new Error('No valid recipients found')
    }

    // Create email_outbound record
    const { data: emailOutbound, error: emailError } = await supabaseClient
      .from('email_outbound')
      .insert({
        created_by: user.id,
        subject: body.subject,
        html_body: body.htmlBody,
        sent_via: 'resend',
        sent_at: new Date().toISOString(),
        related_account_id: body.relatedAccountId || null,
      })
      .select()
      .single()

    if (emailError) throw emailError

    // Save recipients
    const recipientInserts = recipients.map((r) => ({
      email_outbound_id: emailOutbound.id,
      contact_id: r.id,
      address: r.email,
      kind: 'to',
    }))

    const { data: savedRecipients, error: recipientsError } = await supabaseClient
      .from('email_outbound_recipients')
      .insert(recipientInserts)
      .select()

    if (recipientsError) throw recipientsError

    // Send emails via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured')
    }

    const sendResults = []

    for (const recipient of recipients) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@clearlinecapital.com',
            to: [recipient.email],
            subject: body.subject,
            html: body.htmlBody,
            tags: [
              {
                name: 'email_outbound_id',
                value: emailOutbound.id,
              },
              {
                name: 'contact_id',
                value: recipient.id,
              },
            ],
          }),
        })

        if (!response.ok) {
          const errorData = await response.text()
          console.error(`Failed to send to ${recipient.email}: ${errorData}`)
          sendResults.push({
            email: recipient.email,
            success: false,
            error: errorData,
          })
        } else {
          const data = await response.json()
          sendResults.push({
            email: recipient.email,
            success: true,
            resendId: data.id,
          })
        }
      } catch (error) {
        console.error(`Error sending to ${recipient.email}:`, error)
        sendResults.push({
          email: recipient.email,
          success: false,
          error: error.message,
        })
      }
    }

    // Create tasks for sent emails
    if (body.relatedAccountId) {
      for (const recipient of recipients) {
        await supabaseClient.from('tasks').insert({
          account_id: body.relatedAccountId,
          contact_id: recipient.id,
          subject: body.subject,
          activity_date: new Date().toISOString().split('T')[0],
          description: body.htmlBody.substring(0, 500),
          interaction_type: 'SentEmail',
        })
      }
    }

    const successCount = sendResults.filter((r) => r.success).length
    const failureCount = sendResults.filter((r) => !r.success).length

    return new Response(
      JSON.stringify({
        success: true,
        emailId: emailOutbound.id,
        totalRecipients: recipients.length,
        successCount,
        failureCount,
        results: sendResults,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error sending bulk email:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

