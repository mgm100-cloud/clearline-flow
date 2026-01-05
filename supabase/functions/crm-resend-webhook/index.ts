// Supabase Edge Function: CRM Resend Webhook
// Handles webhooks from Resend for email events (opens, clicks, etc.)

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

    const body = await req.json()

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
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

