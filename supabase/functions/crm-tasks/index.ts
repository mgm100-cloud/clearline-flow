// Supabase Edge Function: CRM Tasks API
// Handles CRUD operations for tasks (interactions)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders, failure, oneOf, requireStaff } from '../_shared/guard.ts'

// 2026-10-21: sortBy goes into the PostgREST order= parameter as-is, so only a real column of the table may.
const TASK_SORT_COLUMNS = [
  'id',
  'sf_ext_id',
  'account_id',
  'contact_id',
  'subject',
  'activity_date',
  'description',
  'extra_info',
  'interaction_type',
  'created_date',
  'updated_date',
  'created_at',
  'updated_at',
]

// 2026-10-21: activity_date is pasted into a PostgREST .or() filter when a task is created; only a plain date
// (or date-time) may go there, so a comma or bracket cannot add filter terms of the caller's choosing.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

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
    const taskId = uuidRegex.test(lastPart) ? lastPart : null

    // GET /crm-tasks - List tasks with pagination, filtering, sorting
    if (req.method === 'GET' && !taskId) {
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const accountId = url.searchParams.get('accountId') || ''
      const contactId = url.searchParams.get('contactId') || ''
      const interactionType = url.searchParams.get('interactionType') || ''
      // 2026-10-21: sort column and direction only from fixed lists (see the list at the top).
      const sortBy = oneOf(url.searchParams.get('sortBy'), TASK_SORT_COLUMNS, 'activity_date')
      const sortOrder = oneOf(url.searchParams.get('sortOrder'), ['asc', 'desc'], 'desc')

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
        typeof body.activity_date === 'string' &&
        ISO_DATE.test(body.activity_date) &&
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
    // 2026-10-21: the database's own message (table, column, constraint names) stays in the function log.
    return failure(error, 'crm-tasks')
  }
})

