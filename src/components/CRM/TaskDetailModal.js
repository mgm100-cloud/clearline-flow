import React, { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import { getTask, updateTask, createTask, updateAccount, fetchAllRows } from '../../services/crmService'
import './TaskDetailModal.css'

const TaskDetailModal = ({ taskId, accountId, contactId, onClose, onSave }) => {
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [firmOptions, setFirmOptions] = useState([])
  const [contactOptions, setContactOptions] = useState([])
  const [firmSearch, setFirmSearch] = useState('')
  const [contactSearch, setContactSearch] = useState('')

  useEffect(() => {
    if (taskId) {
      loadTask()
    } else {
      // New task
      setTask({
        account_id: accountId || '',
        contact_id: contactId || '',
        subject: '',
        activity_date: new Date().toISOString().split('T')[0],
        description: '',
        extra_info: '',
        interaction_type: 'UpdatedInfo',
      })
      loadFirms()
      if (accountId) loadContactsForAccount(accountId)
    }
  }, [taskId, accountId, contactId])

  const loadTask = async () => {
    setLoading(true)
    try {
      const data = await getTask(taskId)
      setTask(data)
      loadFirms()
      if (data.account_id) loadContactsForAccount(data.account_id)
    } catch (error) {
      console.error('Error loading task:', error)
      alert('Failed to load task: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const loadFirms = async () => {
    try {
      const data = await fetchAllRows(
        'accounts',
        'id, firm_name',
        [{ type: 'is', col: 'deleted_at', val: null }],
        'firm_name',
        true
      )
      setFirmOptions(data || [])
    } catch (error) {
      console.error('Error loading firms:', error)
    }
  }

  const loadContactsForAccount = async (accId) => {
    try {
      const data = await fetchAllRows(
        'contacts',
        'id, first_name, last_name, email',
        [
          { type: 'is', col: 'deleted_at', val: null },
          { type: 'eq', col: 'account_id', val: accId },
        ],
        'last_name',
        true
      )
      setContactOptions(data || [])
    } catch (error) {
      console.error('Error loading contacts:', error)
    }
  }

  const handleFieldChange = (field, value) => {
    const updated = { ...task, [field]: value }
    if (field === 'account_id' && value) {
      loadContactsForAccount(value)
      updated.contact_id = '' // Reset contact when firm changes
    }
    setTask(updated)
  }

  const handleSave = async () => {
    if (!task.subject || !task.activity_date) {
      alert('Subject and Activity Date are required')
      return
    }

    setSaving(true)
    try {
      const payload = { ...task }
      // Clean up: remove relationship data
      delete payload.accounts
      delete payload.contacts
      delete payload.id
      delete payload.created_at
      delete payload.updated_at
      delete payload.deleted_at
      delete payload.sf_ext_id
      delete payload.created_date
      delete payload.updated_date
      // Remove empty string fields  
      if (!payload.account_id) delete payload.account_id
      if (!payload.contact_id) delete payload.contact_id
      if (!payload.extra_info) delete payload.extra_info

      let savedTask
      if (taskId) {
        savedTask = await updateTask(taskId, payload)
      } else {
        savedTask = await createTask(payload)
      }

      // Business rule: update accounts.last_activity unless SentEmail or OutgoingCall
      if (payload.account_id && payload.activity_date &&
          payload.interaction_type !== 'SentEmail' && payload.interaction_type !== 'OutgoingCall') {
        try {
          await updateAccount(payload.account_id, { last_activity: payload.activity_date })
        } catch (e) {
          console.error('Failed to update last_activity on account:', e)
        }
      }

      onSave && onSave(savedTask)
      onClose()
    } catch (error) {
      console.error('Error saving task:', error)
      alert('Failed to save task: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const interactionTypes = [
    { value: 'SentEmail', label: 'Sent Email' },
    { value: 'ReceivedEmail', label: 'Received Email' },
    { value: 'OutgoingCall', label: 'Outgoing Call' },
    { value: 'ConnectedCall', label: 'Connected Call' },
    { value: 'VideoCall', label: 'Video Call' },
    { value: 'InPersonOffice', label: 'In Person (Office)' },
    { value: 'InPersonVisit', label: 'In Person (Visit)' },
    { value: 'ConferenceMeeting', label: 'Conference Meeting' },
    { value: 'UpdatedInfo', label: 'Updated Info' },
  ]

  const filteredFirms = firmSearch
    ? firmOptions.filter(f => f.firm_name.toLowerCase().includes(firmSearch.toLowerCase()))
    : firmOptions

  const filteredContacts = contactSearch
    ? contactOptions.filter(c =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(contactSearch.toLowerCase()) ||
        c.email?.toLowerCase().includes(contactSearch.toLowerCase())
      )
    : contactOptions

  if (loading) {
    return (
      <div className="task-modal-overlay" onClick={onClose}>
        <div className="task-modal" onClick={(e) => e.stopPropagation()}>
          <div className="task-modal-loading">
            <div className="data-grid-spinner" />
            <div>Loading task...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!task) return null

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div className="task-modal task-modal-wide" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="task-modal-header">
          <h2>{taskId ? 'Edit Task' : 'New Task'}</h2>
          <button className="task-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="task-modal-content">
          <div className="task-modal-field">
            <label>Subject *</label>
            <input
              type="text"
              value={task.subject || ''}
              onChange={(e) => handleFieldChange('subject', e.target.value)}
              placeholder="Enter task subject"
            />
          </div>

          <div className="task-modal-row">
            <div className="task-modal-field">
              <label>Activity Date *</label>
              <input
                type="date"
                value={task.activity_date || ''}
                onChange={(e) => handleFieldChange('activity_date', e.target.value)}
              />
            </div>

            <div className="task-modal-field">
              <label>Interaction Type</label>
              <select
                value={task.interaction_type || 'UpdatedInfo'}
                onChange={(e) => handleFieldChange('interaction_type', e.target.value)}
              >
                {interactionTypes.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="task-modal-row">
            <div className="task-modal-field">
              <label>Firm</label>
              <input
                type="text"
                placeholder="Search firms..."
                value={firmSearch}
                onChange={(e) => setFirmSearch(e.target.value)}
                className="task-modal-search-input"
              />
              <select
                value={task.account_id || ''}
                onChange={(e) => handleFieldChange('account_id', e.target.value)}
              >
                <option value="">-- No Firm --</option>
                {filteredFirms.map(f => (
                  <option key={f.id} value={f.id}>{f.firm_name}</option>
                ))}
              </select>
            </div>

            <div className="task-modal-field">
              <label>Contact</label>
              {task.account_id ? (
                <>
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="task-modal-search-input"
                  />
                  <select
                    value={task.contact_id || ''}
                    onChange={(e) => handleFieldChange('contact_id', e.target.value)}
                  >
                    <option value="">-- No Contact --</option>
                    {filteredContacts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}{c.email ? ` (${c.email})` : ''}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <div className="task-modal-hint">Select a firm first to choose a contact</div>
              )}
            </div>
          </div>

          <div className="task-modal-field">
            <label>Description</label>
            <textarea
              value={task.description || ''}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              rows={4}
              placeholder="Enter task description"
            />
          </div>

          <div className="task-modal-field">
            <label>Additional Info</label>
            <textarea
              value={task.extra_info || ''}
              onChange={(e) => handleFieldChange('extra_info', e.target.value)}
              rows={3}
              placeholder="Enter additional information"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="task-modal-footer">
          <button className="task-modal-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="task-modal-save" onClick={handleSave} disabled={saving}>
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TaskDetailModal
