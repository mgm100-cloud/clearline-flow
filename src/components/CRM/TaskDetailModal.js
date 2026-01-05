import React, { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import { getTask, updateTask, createTask } from '../../services/crmService'
import './TaskDetailModal.css'

const TaskDetailModal = ({ taskId, accountId, contactId, onClose, onSave }) => {
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (taskId) {
      loadTask()
    } else {
      // New task
      setTask({
        account_id: accountId || null,
        contact_id: contactId || null,
        subject: '',
        activity_date: new Date().toISOString().split('T')[0],
        description: '',
        extra_info: '',
        interaction_type: 'UpdatedInfo',
      })
    }
  }, [taskId, accountId, contactId])

  const loadTask = async () => {
    setLoading(true)
    try {
      const data = await getTask(taskId)
      setTask(data)
    } catch (error) {
      console.error('Error loading task:', error)
      alert('Failed to load task: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFieldChange = (field, value) => {
    setTask({ ...task, [field]: value })
  }

  const handleSave = async () => {
    if (!task.subject || !task.activity_date) {
      alert('Subject and Activity Date are required')
      return
    }

    setSaving(true)
    try {
      let savedTask
      if (taskId) {
        savedTask = await updateTask(taskId, task)
      } else {
        savedTask = await createTask(task)
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
    'SentEmail',
    'ReceivedEmail',
    'OutgoingCall',
    'ConnectedCall',
    'VideoCall',
    'InPersonOffice',
    'InPersonVisit',
    'ConferenceMeeting',
    'UpdatedInfo',
  ]

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
      <div className="task-modal" onClick={(e) => e.stopPropagation()}>
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
                  <option key={type} value={type}>
                    {type.replace(/([A-Z])/g, ' $1').trim()}
                  </option>
                ))}
              </select>
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

          {task.accounts && (
            <div className="task-modal-info">
              <strong>Firm:</strong> {task.accounts.firm_name}
            </div>
          )}

          {task.contacts && (
            <div className="task-modal-info">
              <strong>Contact:</strong> {task.contacts.first_name} {task.contacts.last_name}
            </div>
          )}
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

