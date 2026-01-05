// CRM Service - API calls for CRM functionality
import { supabase } from '../supabaseClient'

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL

// Helper to get auth headers
const getAuthHeaders = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return {
    Authorization: `Bearer ${session?.access_token}`,
    'Content-Type': 'application/json',
  }
}

// ============================================================================
// ACCOUNTS (FIRMS)
// ============================================================================

export const getAccounts = async (params = {}) => {
  const { page = 1, limit = 50, search = '', status = '', sortBy = 'firm_name', sortOrder = 'asc' } = params

  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    search,
    status,
    sortBy,
    sortOrder,
  })

  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-accounts?${queryParams}`, {
    headers,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch accounts')
  }

  return response.json()
}

export const getAccount = async (id) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-accounts/${id}`, {
    headers,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch account')
  }

  return response.json()
}

export const createAccount = async (data) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-accounts`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create account')
  }

  return response.json()
}

export const updateAccount = async (id, data) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-accounts/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update account')
  }

  return response.json()
}

export const deleteAccount = async (id) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-accounts/${id}`, {
    method: 'DELETE',
    headers,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete account')
  }

  return response.json()
}

// ============================================================================
// CONTACTS
// ============================================================================

export const getContacts = async (params = {}) => {
  const { page = 1, limit = 50, search = '', accountId = '', sortBy = 'last_name', sortOrder = 'asc' } = params

  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    search,
    accountId,
    sortBy,
    sortOrder,
  })

  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-contacts?${queryParams}`, {
    headers,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch contacts')
  }

  return response.json()
}

export const getContact = async (id) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-contacts/${id}`, {
    headers,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch contact')
  }

  return response.json()
}

export const createContact = async (data) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-contacts`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create contact')
  }

  return response.json()
}

export const updateContact = async (id, data) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-contacts/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update contact')
  }

  return response.json()
}

export const deleteContact = async (id) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-contacts/${id}`, {
    method: 'DELETE',
    headers,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete contact')
  }

  return response.json()
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

  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    accountId,
    contactId,
    interactionType,
    sortBy,
    sortOrder,
  })

  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-tasks?${queryParams}`, {
    headers,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch tasks')
  }

  return response.json()
}

export const getTask = async (id) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-tasks/${id}`, {
    headers,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch task')
  }

  return response.json()
}

export const createTask = async (data) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create task')
  }

  return response.json()
}

export const updateTask = async (id, data) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-tasks/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update task')
  }

  return response.json()
}

export const deleteTask = async (id) => {
  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-tasks/${id}`, {
    method: 'DELETE',
    headers,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete task')
  }

  return response.json()
}

// ============================================================================
// GLOBAL SEARCH
// ============================================================================

export const globalSearch = async (query) => {
  const queryParams = new URLSearchParams({
    q: query,
    limit: '20',
  })

  const headers = await getAuthHeaders()
  const response = await fetch(`${SUPABASE_URL}/functions/v1/crm-search?${queryParams}`, {
    headers,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Search failed')
  }

  return response.json()
}

// ============================================================================
// EMAIL
// ============================================================================

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
// OUTLOOK OAUTH
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

export const createDistributionList = async (data) => {
  const { data: list, error } = await supabase
    .from('distribution_lists')
    .insert(data)
    .select()
    .single()

  if (error) throw error
  return list
}

export const updateDistributionList = async (id, data) => {
  const { data: list, error } = await supabase
    .from('distribution_lists')
    .update(data)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return list
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

