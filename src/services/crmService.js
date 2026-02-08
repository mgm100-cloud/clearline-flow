// CRM Service - Direct Supabase queries for CRM functionality
// Uses the Supabase JS client directly instead of Edge Functions
import { supabase } from '../supabaseClient'

// ============================================================================
// ACCOUNTS (FIRMS)
// ============================================================================

export const getAccounts = async (params = {}) => {
  const { page = 1, limit = 50, search = '', status = '', sortBy = 'firm_name', sortOrder = 'asc' } = params

  let query = supabase
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

  return {
    data,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil((count || 0) / limit),
    },
  }
}

export const getAccount = async (id) => {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) throw error
  return data
}

export const createAccount = async (accountData) => {
  const { data, error } = await supabase
    .from('accounts')
    .insert(accountData)
    .select()
    .single()

  if (error) throw error
  return data
}

export const updateAccount = async (id, accountData) => {
  const { data, error } = await supabase
    .from('accounts')
    .update(accountData)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) throw error
  return data
}

export const deleteAccount = async (id) => {
  const { data, error } = await supabase
    .from('accounts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// CONTACTS
// ============================================================================

export const getContacts = async (params = {}) => {
  const { page = 1, limit = 50, search = '', accountId = '', sortBy = 'last_name', sortOrder = 'asc' } = params

  let query = supabase
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

  return {
    data,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil((count || 0) / limit),
    },
  }
}

export const getContact = async (id) => {
  const { data, error } = await supabase
    .from('contacts')
    .select('*, accounts(firm_name)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) throw error
  return data
}

export const createContact = async (contactData) => {
  const { data, error } = await supabase
    .from('contacts')
    .insert(contactData)
    .select()
    .single()

  if (error) throw error
  return data
}

export const updateContact = async (id, contactData) => {
  const { data, error } = await supabase
    .from('contacts')
    .update(contactData)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) throw error
  return data
}

export const deleteContact = async (id) => {
  const { data, error } = await supabase
    .from('contacts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// TASKS (INTERACTIONS)
// ============================================================================

export const getTasks = async (params = {}) => {
  const {
    page = 1,
    limit = 50,
    accountId = '',
    contactId = '',
    interactionType = '',
    sortBy = 'activity_date',
    sortOrder = 'desc',
  } = params

  let query = supabase
    .from('tasks')
    .select('*, accounts(firm_name), contacts(first_name, last_name)', { count: 'exact' })
    .is('deleted_at', null)

  // Filter by account
  if (accountId) {
    query = query.eq('related_account_id', accountId)
  }

  // Filter by contact
  if (contactId) {
    query = query.eq('related_contact_id', contactId)
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

  return {
    data,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil((count || 0) / limit),
    },
  }
}

export const getTask = async (id) => {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, accounts(firm_name), contacts(first_name, last_name)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) throw error
  return data
}

export const createTask = async (taskData) => {
  const { data, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single()

  if (error) throw error
  return data
}

export const updateTask = async (id, taskData) => {
  const { data, error } = await supabase
    .from('tasks')
    .update(taskData)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) throw error
  return data
}

export const deleteTask = async (id) => {
  const { data, error } = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// GLOBAL SEARCH
// ============================================================================

export const globalSearch = async (query) => {
  if (!query || query.length < 2) {
    throw new Error('Query must be at least 2 characters')
  }

  // Search accounts (firms)
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, firm_name, website, city, state, status')
    .is('deleted_at', null)
    .or(`firm_name.ilike.%${query}%,website.ilike.%${query}%`)
    .limit(20)

  if (accountsError) throw accountsError

  // Search contacts
  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, title, account_id, accounts(firm_name)')
    .is('deleted_at', null)
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(20)

  if (contactsError) throw contactsError

  // Format results
  return {
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
}

// ============================================================================
// EMAIL (still uses Edge Functions - requires server-side email sending)
// ============================================================================

const getAuthHeaders = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return {
    Authorization: `Bearer ${session?.access_token}`,
    'Content-Type': 'application/json',
  }
}

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL

export const sendEmail = async (data) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-send-email`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to send email')
  }

  return response.json()
}

export const sendBulkEmail = async (data) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-send-bulk-email`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to send bulk email')
  }

  return response.json()
}

// ============================================================================
// OUTLOOK OAUTH (still uses Edge Functions - requires server-side OAuth)
// ============================================================================

export const getOutlookAuthUrl = async (redirectUri, state) => {
  const queryParams = new URLSearchParams({
    action: 'authorize',
    redirect_uri: redirectUri,
    state,
  })

  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-outlook-oauth?${queryParams}`, {
    headers,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to get auth URL')
  }

  return response.json()
}

export const completeOutlookAuth = async (code, redirectUri) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-outlook-oauth?action=callback`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code, redirectUri }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to complete auth')
  }

  return response.json()
}

export const getMailboxStatus = async () => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-outlook-oauth?action=status`, {
    headers,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to get mailbox status')
  }

  return response.json()
}

// ============================================================================
// CLIENT DATA
// ============================================================================

export const getClientCapital = async (firmId) => {
  const { data, error } = await supabase
    .from('client_data_capital')
    .select('*')
    .eq('firm_id', firmId)
    .order('date', { ascending: true })

  if (error) throw error
  return data
}

export const getClientSubscriptions = async (firmId) => {
  const { data, error } = await supabase
    .from('client_data_subs')
    .select('*')
    .eq('firm_id', firmId)
    .order('date_subscribed', { ascending: true })

  if (error) throw error
  return data
}

export const getClientRedemptions = async (firmId) => {
  const { data, error } = await supabase
    .from('client_data_reds')
    .select('*')
    .eq('firm_id', firmId)
    .order('date_redeemed', { ascending: true })

  if (error) throw error
  return data
}

// ============================================================================
// DISTRIBUTION LISTS
// ============================================================================

export const getDistributionLists = async () => {
  const { data, error } = await supabase
    .from('distribution_lists')
    .select('*, distribution_list_members(count)')
    .is('deleted_at', null)
    .order('name')

  if (error) throw error
  return data
}

export const getDistributionList = async (id) => {
  const { data, error } = await supabase
    .from('distribution_lists')
    .select('*, distribution_list_members(*, contacts(*))')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) throw error
  return data
}

export const createDistributionList = async (listData) => {
  const { data, error } = await supabase
    .from('distribution_lists')
    .insert(listData)
    .select()
    .single()

  if (error) throw error
  return data
}

export const updateDistributionList = async (id, listData) => {
  const { data, error } = await supabase
    .from('distribution_lists')
    .update(listData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export const deleteDistributionList = async (id) => {
  const { error } = await supabase
    .from('distribution_lists')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

export const addContactToList = async (listId, contactId) => {
  const { error } = await supabase
    .from('distribution_list_members')
    .insert({ list_id: listId, contact_id: contactId })

  if (error) throw error
}

export const removeContactFromList = async (listId, contactId) => {
  const { error } = await supabase
    .from('distribution_list_members')
    .delete()
    .eq('list_id', listId)
    .eq('contact_id', contactId)

  if (error) throw error
}
