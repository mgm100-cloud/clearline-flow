// Supabase Edge Function: CRM Contacts API
// Handles CRUD operations for contacts

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
    const contactId = pathParts[pathParts.length - 1]

    // GET /crm-contacts - List contacts with pagination, filtering, sorting
    if (req.method === 'GET' && !contactId) {
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const search = url.searchParams.get('search') || ''
      const accountId = url.searchParams.get('accountId') || ''
      const sortBy = url.searchParams.get('sortBy') || 'last_name'
      const sortOrder = url.searchParams.get('sortOrder') || 'asc'

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
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

