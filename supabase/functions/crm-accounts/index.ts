// Supabase Edge Function: CRM Accounts API
// Handles CRUD operations for accounts (firms)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders, failure, oneOf, requireStaff, searchTerm } from '../_shared/guard.ts'

// 2026-10-21: sortBy goes into the PostgREST order= parameter as-is, so only a real column of the table may.
const ACCOUNT_SORT_COLUMNS = [
  'id',
  'sf_ext_id',
  'firm_name',
  'type',
  'address',
  'city',
  'state',
  'country',
  'zip_code',
  'phone_number',
  'website',
  'description',
  'created_date',
  'updated_date',
  'last_activity',
  'aum',
  'tier',
  'investment_size_min',
  'investment_size_max',
  'hf_investments',
  'category',
  'pb_introduction',
  'consultant',
  'third_party_marketer',
  'focus_list',
  'probability_of_investment',
  'pm_meeting',
  'status_summary',
  'status',
  'high_quality',
  'structure_issues',
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
    const accountId = uuidRegex.test(lastPart) ? lastPart : null

    // GET /crm-accounts - List accounts with pagination, filtering, sorting
    if (req.method === 'GET' && !accountId) {
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = parseInt(url.searchParams.get('limit') || '50')
      // 2026-10-21: the search text is pasted into a PostgREST .or() filter; a comma or bracket in it would add
      // filter terms of the caller's choosing, so those characters become '_' (any one character); length capped.
      const search = searchTerm(url.searchParams.get('search') || '')
      const status = url.searchParams.get('status') || ''
      // 2026-10-21: sort column and direction only from fixed lists (see the list at the top).
      const sortBy = oneOf(url.searchParams.get('sortBy'), ACCOUNT_SORT_COLUMNS, 'firm_name')
      const sortOrder = oneOf(url.searchParams.get('sortOrder'), ['asc', 'desc'], 'asc')

      let query = supabaseClient
        .from('accounts')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)

      // Search
      if (search) {
        query = query.or(`firm_name.ilike.%${search}%,website.ilike.%${search}%,description.ilike.%${search}%`)
      }

      // Filter by status
      if (status) {
        query = query.eq('status', status)
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

    // GET /crm-accounts/:id - Get single account
    if (req.method === 'GET' && accountId) {
      const { data, error } = await supabaseClient
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .is('deleted_at', null)
        .single()

      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // POST /crm-accounts - Create new account
    if (req.method === 'POST') {
      const body = await req.json()

      const { data, error } = await supabaseClient
        .from('accounts')
        .insert(body)
        .select()
        .single()

      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 201,
      })
    }

    // PATCH /crm-accounts/:id - Update account
    if (req.method === 'PATCH' && accountId) {
      const body = await req.json()

      const { data, error } = await supabaseClient
        .from('accounts')
        .update(body)
        .eq('id', accountId)
        .is('deleted_at', null)
        .select()
        .single()

      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // DELETE /crm-accounts/:id - Soft delete account
    if (req.method === 'DELETE' && accountId) {
      const { data, error } = await supabaseClient
        .from('accounts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', accountId)
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
    return failure(error, 'crm-accounts')
  }
})

