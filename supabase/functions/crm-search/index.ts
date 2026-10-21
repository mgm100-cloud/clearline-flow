// Supabase Edge Function: CRM Global Search
// Searches across accounts, contacts, and tasks

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders, failure, requireStaff, searchTerm } from '../_shared/guard.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 2026-10-21: the gateway's verify_jwt lets in anyone holding the public anon key, and RLS alone
  // leans on has_crm_access(), whose division a user can set on their own profile. Confirmed Clearline CRM
  // staff only (_shared/guard.ts), before anything touches the database.
  const auth = await requireStaff(req)
  if (auth instanceof Response) return auth

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const url = new URL(req.url)
    // 2026-10-21: the query text is pasted into two PostgREST .or() filters; a comma or bracket in it would add
    // filter terms of the caller's choosing, so those characters become '_' (any one character); length capped.
    const query = searchTerm(url.searchParams.get('q') || '')
    const limit = parseInt(url.searchParams.get('limit') || '20')

    if (!query || query.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Query must be at least 2 characters' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    // Search accounts (firms)
    const { data: accounts, error: accountsError } = await supabaseClient
      .from('accounts')
      .select('id, firm_name, website, city, state, status')
      .is('deleted_at', null)
      .or(`firm_name.ilike.%${query}%,website.ilike.%${query}%`)
      .limit(limit)

    if (accountsError) throw accountsError

    // Search contacts
    const { data: contacts, error: contactsError } = await supabaseClient
      .from('contacts')
      .select('id, first_name, last_name, email, title, account_id, accounts(firm_name)')
      .is('deleted_at', null)
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(limit)

    if (contactsError) throw contactsError

    // Format results
    const results = {
      accounts: accounts.map((a) => ({
        type: 'account',
        id: a.id,
        title: a.firm_name,
        subtitle: [a.city, a.state].filter(Boolean).join(', '),
        metadata: a.status,
      })),
      contacts: contacts.map((c) => ({
        type: 'contact',
        id: c.id,
        title: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
        subtitle: c.accounts?.firm_name || '',
        metadata: c.email,
      })),
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    // 2026-10-21: the database's own message (table, column, constraint names) stays in the function log.
    return failure(error, 'crm-search')
  }
})

