// Supabase Edge Function: CRM Outlook Sync
// Syncs emails from Outlook using Microsoft Graph Delta API

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

    // Get all active mailboxes
    const { data: mailboxes, error: mailboxError } = await supabaseClient
      .from('mailboxes')
      .select('*')
      .eq('status', 'active')

    if (mailboxError) throw mailboxError

    const results = []

    for (const mailbox of mailboxes) {
      try {
        // Check if token is expired and refresh if needed
        let accessToken = mailbox.oauth_access_token
        if (new Date(mailbox.oauth_token_expires_at) <= new Date()) {
          // Refresh token
          const refreshResponse = await fetch(
            'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            {
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
            }
          )

          if (!refreshResponse.ok) {
            console.error(`Failed to refresh token for mailbox ${mailbox.id}`)
            continue
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

        // Sync inbox and sent items
        const folders = ['inbox', 'sentitems']

        for (const folder of folders) {
          // Get sync state
          const { data: syncState } = await supabaseClient
            .from('mailbox_sync_state')
            .select('*')
            .eq('mailbox_id', mailbox.id)
            .eq('folder', folder)
            .single()

          // Build delta URL
          let deltaUrl = syncState?.last_delta_token
            ? syncState.last_delta_token
            : `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages/delta`

          // Fetch messages
          let hasMore = true
          let processedCount = 0

          while (hasMore) {
            const response = await fetch(deltaUrl, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Prefer: 'odata.maxpagesize=50',
              },
            })

            if (!response.ok) {
              console.error(`Failed to fetch messages for mailbox ${mailbox.id}, folder ${folder}`)
              break
            }

            const data = await response.json()

            // Process messages
            for (const message of data.value || []) {
              try {
                // Determine direction
                const direction = folder === 'sentitems' ? 'outbound' : 'inbound'

                // Extract from address
                const fromAddress = message.from?.emailAddress?.address || ''

                // Upsert email
                const { data: email, error: emailError } = await supabaseClient
                  .from('emails')
                  .upsert(
                    {
                      mailbox_id: mailbox.id,
                      message_id: message.id,
                      conversation_id: message.conversationId,
                      direction,
                      subject: message.subject,
                      preview: message.bodyPreview?.substring(0, 200),
                      from_address: fromAddress,
                      sent_at: message.sentDateTime,
                    },
                    {
                      onConflict: 'mailbox_id,message_id',
                    }
                  )
                  .select()
                  .single()

                if (emailError) {
                  console.error(`Failed to upsert email: ${emailError.message}`)
                  continue
                }

                // Insert recipients
                const recipients = []
                if (message.toRecipients) {
                  recipients.push(
                    ...message.toRecipients.map((r: any) => ({
                      email_id: email.id,
                      kind: 'to',
                      address: r.emailAddress.address,
                    }))
                  )
                }
                if (message.ccRecipients) {
                  recipients.push(
                    ...message.ccRecipients.map((r: any) => ({
                      email_id: email.id,
                      kind: 'cc',
                      address: r.emailAddress.address,
                    }))
                  )
                }
                if (message.bccRecipients) {
                  recipients.push(
                    ...message.bccRecipients.map((r: any) => ({
                      email_id: email.id,
                      kind: 'bcc',
                      address: r.emailAddress.address,
                    }))
                  )
                }

                if (recipients.length > 0) {
                  // Delete existing recipients and insert new ones
                  await supabaseClient.from('email_recipients').delete().eq('email_id', email.id)
                  await supabaseClient.from('email_recipients').insert(recipients)
                }

                processedCount++
              } catch (error) {
                console.error(`Error processing message ${message.id}:`, error)
              }
            }

            // Check for next page or delta link
            if (data['@odata.nextLink']) {
              deltaUrl = data['@odata.nextLink']
            } else if (data['@odata.deltaLink']) {
              // Save delta token for next sync
              await supabaseClient
                .from('mailbox_sync_state')
                .upsert(
                  {
                    mailbox_id: mailbox.id,
                    folder,
                    last_delta_token: data['@odata.deltaLink'],
                  },
                  {
                    onConflict: 'mailbox_id,folder',
                  }
                )
              hasMore = false
            } else {
              hasMore = false
            }
          }

          results.push({
            mailboxId: mailbox.id,
            folder,
            processedCount,
          })
        }

        // Update last_synced_at
        await supabaseClient
          .from('mailboxes')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', mailbox.id)
      } catch (error) {
        console.error(`Error syncing mailbox ${mailbox.id}:`, error)
        results.push({
          mailboxId: mailbox.id,
          error: error.message,
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

