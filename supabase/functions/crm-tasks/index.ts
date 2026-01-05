// Supabase Edge Function: CRM Tasks API
// Handles CRUD operations for tasks (interactions)

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
    const taskId = pathParts[pathParts.length - 1]

    // GET /crm-tasks - List tasks with pagination, filtering, sorting
    if (req.method === 'GET' && !taskId) {
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const accountId = url.searchParams.get('accountId') || ''
      const contactId = url.searchParams.get('contactId') || ''
      const interactionType = url.searchParams.get('interactionType') || ''
      const sortBy = url.searchParams.get('sortBy') || 'activity_date'
      const sortOrder = url.searchParams.get('sortOrder') || 'desc'

      let query = supabaseClient
        .from('tasks')
        .select('*, accounts(firm_name), contacts(first_name, last_name, email)', { count: 'exact' })
        .is('deleted_at', null)

      // Filter by account
      if (accountId) {
        query = query.eq('account_id', accountId)
      }

      // Filter by contact
      if (contactId) {
        query = query.eq('contact_id', contactId)
      }

      // Filter by interaction type
      if (interactionType) {
        query = query.eq('interaction_type', interactionType)
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

    // GET /crm-tasks/:id - Get single task
    if (req.method === 'GET' && taskId) {
      const { data, error } = await supabaseClient
        .from('tasks')
        .select('*, accounts(firm_name), contacts(first_name, last_name, email), task_participants(*)')
        .eq('id', taskId)
        .is('deleted_at', null)
        .single()

      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // POST /crm-tasks - Create new task
    if (req.method === 'POST') {
      const body = await req.json()

      const { data, error } = await supabaseClient
        .from('tasks')
        .insert(body)
        .select('*, accounts(firm_name), contacts(first_name, last_name, email)')
        .single()

      if (error) throw error

      // Update account last_activity if not SentEmail or OutgoingCall
      if (
        body.account_id &&
        body.activity_date &&
        body.interaction_type &&
        !['SentEmail', 'OutgoingCall'].includes(body.interaction_type)
      ) {
        await supabaseClient
          .from('accounts')
          .update({ last_activity: body.activity_date })
          .eq('id', body.account_id)
          .or(`last_activity.is.null,last_activity.lt.${body.activity_date}`)
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 201,
      })
    }

    // PATCH /crm-tasks/:id - Update task
    if (req.method === 'PATCH' && taskId) {
      const body = await req.json()

      const { data, error } = await supabaseClient
        .from('tasks')
        .update(body)
        .eq('id', taskId)
        .is('deleted_at', null)
        .select('*, accounts(firm_name), contacts(first_name, last_name, email)')
        .single()

      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // DELETE /crm-tasks/:id - Soft delete task
    if (req.method === 'DELETE' && taskId) {
      const { data, error } = await supabaseClient
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', taskId)
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

