// Supabase Edge Function: CRM Resend Webhook
// Handles webhooks from Resend for email events (opens, clicks, etc.)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders, failure, verifyResendWebhook } from '../_shared/guard.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 2026-10-21: this wrote email events with the SERVICE ROLE for anyone. Resend signs every delivery (Svix,
  // RESEND_WEBHOOK_SECRET); the signature covers the raw bytes, so read them first, check, and only then parse.
  // Unset secret = every delivery is refused.
  const rawBody = await req.text().catch(() => '')
  const denied = await verifyResendWebhook(req, rawBody)
  if (denied) return denied

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = JSON.parse(rawBody)

    // Resend webhook payload structure:
    // {
    //   type: 'email.opened' | 'email.clicked' | 'email.delivered' | 'email.bounced' | 'email.complained',
    //   created_at: '2023-01-01T00:00:00.000Z',
    //   data: {
    //     email_id: 'xxx',
    //     from: 'xxx',
    //     to: ['xxx'],
    //     subject: 'xxx',
    //     tags: [{ name: 'email_outbound_id', value: 'xxx' }]
    //   }
    // }

    const eventType = body.type
    const eventData = body.data
    const createdAt = body.created_at

    // Extract email_outbound_id and contact_id from tags
    const emailOutboundIdTag = eventData.tags?.find((t: any) => t.name === 'email_outbound_id')
    const contactIdTag = eventData.tags?.find((t: any) => t.name === 'contact_id')

    if (!emailOutboundIdTag) {
      console.warn('No email_outbound_id tag found in webhook')
      return new Response(JSON.stringify({ success: true, message: 'Ignored - no email_outbound_id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const emailOutboundId = emailOutboundIdTag.value
    const contactId = contactIdTag?.value || null

    // Find recipient
    let recipientId = null
    if (contactId) {
      const { data: recipient } = await supabaseClient
        .from('email_outbound_recipients')
        .select('id')
        .eq('email_outbound_id', emailOutboundId)
        .eq('contact_id', contactId)
        .single()

      recipientId = recipient?.id || null
    }

    // Map Resend event type to our event type
    let eventTypeNormalized = ''
    if (eventType === 'email.opened') {
      eventTypeNormalized = 'opened'
    } else if (eventType === 'email.clicked') {
      eventTypeNormalized = 'clicked'
    } else if (eventType === 'email.delivered') {
      eventTypeNormalized = 'delivered'
    } else if (eventType === 'email.bounced') {
      eventTypeNormalized = 'bounced'
    } else if (eventType === 'email.complained') {
      eventTypeNormalized = 'complained'
    } else {
      console.warn(`Unknown event type: ${eventType}`)
      return new Response(JSON.stringify({ success: true, message: 'Ignored - unknown event type' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 2026-10-21: a signed delivery stays valid for 5 minutes, so the same one can be posted again (or Svix can
    // retry it) and count an open or click twice. The body is signed, so a repeat carries the same email, type,
    // recipient and time: when that event is already stored, answer ok and store nothing. There is no unique
    // index yet, so two copies arriving at the same instant can still both land; a failed lookup never stops an
    // event being recorded.
    if (typeof createdAt === 'string' && createdAt) {
      let seenQuery = supabaseClient
        .from('email_events')
        .select('id')
        .eq('email_outbound_id', emailOutboundId)
        .eq('type', eventTypeNormalized)
        .eq('occurred_at', createdAt)
      seenQuery = recipientId ? seenQuery.eq('recipient_id', recipientId) : seenQuery.is('recipient_id', null)
      if (typeof eventData.email_id === 'string' && eventData.email_id) {
        seenQuery = seenQuery.eq('meta_json->>email_id', eventData.email_id)
      }
      const { data: seen, error: seenError } = await seenQuery.limit(1)
      if (seenError) {
        console.error('Duplicate check failed; recording the event anyway:', seenError)
      } else if (Array.isArray(seen) && seen.length > 0) {
        return new Response(JSON.stringify({ success: true, message: 'Ignored - duplicate delivery' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }
    }

    // Insert email event
    const { error: eventError } = await supabaseClient.from('email_events').insert({
      email_outbound_id: emailOutboundId,
      recipient_id: recipientId,
      type: eventTypeNormalized,
      occurred_at: createdAt,
      meta_json: eventData,
    })

    if (eventError) {
      console.error('Failed to insert email event:', eventError)
      throw eventError
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    // 2026-10-21: database text stays in the log.
    return failure(error, 'Webhook error')
  }
})

