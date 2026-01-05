// Supabase Edge Function: CRM Accounts API
// Handles CRUD operations for accounts (firms)

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
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const accountId = pathParts[pathParts.length - 1]

    // GET /crm-accounts - List accounts with pagination, filtering, sorting
    if (req.method === 'GET' && !accountId) {
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const search = url.searchParams.get('search') || ''
      const status = url.searchParams.get('status') || ''
      const sortBy = url.searchParams.get('sortBy') || 'firm_name'
      const sortOrder = url.searchParams.get('sortOrder') || 'asc'

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
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

