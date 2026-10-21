// Supabase Edge Function: CRM Contacts API
// Handles CRUD operations for contacts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders, failure, oneOf, requireStaff, searchTerm } from '../_shared/guard.ts'

// 2026-10-21: sortBy goes into the PostgREST order= parameter as-is, so only a real column of the table may.
const CONTACT_SORT_COLUMNS = [
  'id',
  'sf_ext_id',
  'account_id',
  'salutation',
  'first_name',
  'last_name',
  'mailing_street',
  'mailing_city',
  'mailing_state',
  'mailing_postal_code',
  'mailing_country',
  'phone',
  'mobile_phone',
  'email',
  'assistant_name',
  'assistant_phone',
  'reports_to_contact_id',
  'title',
  'lead_source',
  'description',
  'created_date',
  'updated_date',
  'last_activity',
  'distribution_list',
  'main_contact',
  'which_fund',
  'created_at',
  'updated_at',
]

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
    const pathParts = url.pathname.split('/').filter(Boolean)
    const lastPart = pathParts[pathParts.length - 1]
    // Only treat as an ID if it looks like a UUID (not the function name itself)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const contactId = uuidRegex.test(lastPart) ? lastPart : null

    // GET /crm-contacts - List contacts with pagination, filtering, sorting
    if (req.method === 'GET' && !contactId) {
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = parseInt(url.searchParams.get('limit') || '50')
      // 2026-10-21: the search text is pasted into a PostgREST .or() filter; a comma or bracket in it would add
      // filter terms of the caller's choosing, so those characters become '_' (any one character); length capped.
      const search = searchTerm(url.searchParams.get('search') || '')
      const accountId = url.searchParams.get('accountId') || ''
      // 2026-10-21: sort column and direction only from fixed lists (see the list at the top).
      const sortBy = oneOf(url.searchParams.get('sortBy'), CONTACT_SORT_COLUMNS, 'last_name')
      const sortOrder = oneOf(url.searchParams.get('sortOrder'), ['asc', 'desc'], 'asc')

      let query = supabaseClient
        .from('contacts')
        .select('*, accounts(firm_name)', { count: 'exact' })
        .is('deleted_at', null)

      // Search
      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
      }

      // Filter by account
      if (accountId) {
        query = query.eq('account_id', accountId)
      }

      // Sorting
      query = query.order(sortBy, { ascending: sortOrder === 'asc' })

      // Pagination
      const from = (page - 1) * limit
      const to = from + limit - 1
      query = query.range(from, to)

      const { data, error, count } = await query

      if (error) throw error

      return new Response(
        JSON.stringify({
          data,
          pagination: {
            page,
            limit,
            total: count,
            totalPages: Math.ceil((count || 0) / limit),
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // GET /crm-contacts/:id - Get single contact
    if (req.method === 'GET' && contactId) {
      const { data, error } = await supabaseClient
        .from('contacts')
        .select('*, accounts(firm_name)')
        .eq('id', contactId)
        .is('deleted_at', null)
        .single()

      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // POST /crm-contacts - Create new contact
    if (req.method === 'POST') {
      const body = await req.json()

      const { data, error } = await supabaseClient
        .from('contacts')
        .insert(body)
        .select('*, accounts(firm_name)')
        .single()

      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 201,
      })
    }

    // PATCH /crm-contacts/:id - Update contact
    if (req.method === 'PATCH' && contactId) {
      const body = await req.json()

      const { data, error } = await supabaseClient
        .from('contacts')
        .update(body)
        .eq('id', contactId)
        .is('deleted_at', null)
        .select('*, accounts(firm_name)')
        .single()

      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // DELETE /crm-contacts/:id - Soft delete contact
    if (req.method === 'DELETE' && contactId) {
      const { data, error } = await supabaseClient
        .from('contacts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', contactId)
        .select()
        .single()

      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    })
  } catch (error) {
    // 2026-10-21: the database's own message (table, column, constraint names) stays in the function log.
    return failure(error, 'crm-contacts')
  }
})

