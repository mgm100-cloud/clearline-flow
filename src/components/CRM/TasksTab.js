import React, { useState, useEffect } from 'react'
import { Plus, Filter, Search } from 'lucide-react'
import DataGrid from './DataGrid'
import TaskDetailModal from './TaskDetailModal'
import { getTasks, updateTask, deleteTask } from '../../services/crmService'
import './TasksTab.css'

const TasksTab = ({ onTaskClick, accountId = null, contactId = null }) => {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState(null)
  const [filters, setFilters] = useState({
    search: '',
    accountId: accountId || '',
    contactId: contactId || '',
    interactionType: '',
    page: 1,
    limit: 50,
    sortBy: 'activity_date',
    sortOrder: 'desc',
  })
  const [showFilters, setShowFilters] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState(null)

  useEffect(() => {
    loadTasks()
  }, [filters])

  useEffect(() => {
    if (accountId || contactId) {
      setFilters((prev) => ({
        ...prev,
        accountId: accountId || '',
        contactId: contactId || '',
        page: 1,
      }))
    }
  }, [accountId, contactId])

  const loadTasks = async () => {
    setLoading(true)
    try {
      const response = await getTasks(filters)
      setTasks(response.data)
      setPagination(response.pagination)
    } catch (error) {
      console.error('Error loading tasks:', error)
      alert('Failed to load tasks: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePageChange = (page) => {
    setFilters({ ...filters, page })
  }

  const handleSort = (sortBy, sortOrder) => {
    setFilters({ ...filters, sortBy, sortOrder, page: 1 })
  }

  const handleSearch = (e) => {
    const search = e.target.value
    setFilters({ ...filters, search, page: 1 })
  }

  const handleInteractionTypeFilter = (e) => {
    const interactionType = e.target.value
    setFilters({ ...filters, interactionType, page: 1 })
  }

  const handleCellEdit = async (rowId, columnId, value) => {
    try {
      await updateTask(rowId, { [columnId]: value })
      await loadTasks()
    } catch (error) {
      console.error('Error updating task:', error)
      alert('Failed to update: ' + error.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteTask(id)
      await loadTasks()
    } catch (error) {
      console.error('Error deleting task:', error)
      alert('Failed to delete: ' + error.message)
    }
  }

  const handleAddTask = () => {
    setSelectedTaskId(null)
    setShowTaskModal(true)
  }

  const handleRowClick = (row) => {
    setSelectedTaskId(row.id)
    setShowTaskModal(true)
  }

  const handleTaskSaved = () => {
    loadTasks()
  }

  const interactionTypes = [
    'SentEmail', 'ReceivedEmail', 'OutgoingCall', 'ConnectedCall',
    'VideoCall', 'InPersonOffice', 'InPersonVisit', 'ConferenceMeeting', 'UpdatedInfo',
  ]

  const getInteractionIcon = (type) => {
    const icons = {
      SentEmail: '📤', ReceivedEmail: '📥', OutgoingCall: '📞',
      ConnectedCall: '☎️', VideoCall: '📹', InPersonOffice: '🏢',
      InPersonVisit: '🚗', ConferenceMeeting: '🎤', UpdatedInfo: '📝',
    }
    return icons[type] || '📝'
  }

  const columns = [
    {
      id: 'activity_date', label: 'Date', sortable: true, editable: true, width: '110px',
      render: (value) => (value ? new Date(value).toLocaleDateString() : '-'),
    },
    {
      id: 'interaction_type', label: 'Type', sortable: true, width: '150px',
      render: (value) => value ? (
        <span className="interaction-type">
          <span className="interaction-icon">{getInteractionIcon(value)}</span>
          {value.replace(/([A-Z])/g, ' $1').trim()}
        </span>
      ) : '-',
    },
    { id: 'subject', label: 'Subject', sortable: true, editable: true, width: '280px' },
    {
      id: 'accounts', label: 'Firm', sortable: false, width: '180px',
      render: (value) => value?.firm_name || '-',
    },
    {
      id: 'contacts', label: 'Contact', sortable: false, width: '160px',
      render: (value) => value ? `${value.first_name || ''} ${value.last_name || ''}`.trim() || '-' : '-',
    },
    {
      id: 'description', label: 'Description', sortable: false, width: '220px',
      render: (value) => {
        if (!value) return '-'
        const preview = value.length > 80 ? value.substring(0, 80) + '...' : value
        return <span className="task-description">{preview}</span>
      },
    },
  ]

  return (
    <div className="tasks-tab">
      {/* Toolbar */}
      <div className="tasks-toolbar">
        <div className="tasks-toolbar-left">
          <div className="tasks-search-wrapper">
            <Search size={16} className="tasks-search-icon" />
            <input
              type="text"
              className="tasks-search"
              placeholder="Search tasks..."
              value={filters.search}
              onChange={handleSearch}
            />
          </div>
          <button
            className={`tasks-filter-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={18} />
            Filters
          </button>
        </div>
        <div className="tasks-toolbar-right">
          <button className="tasks-add-btn" onClick={handleAddTask}>
            <Plus size={18} />
            Add Task
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="tasks-filters">
          <div className="tasks-filter-group">
            <label>Interaction Type</label>
            <select value={filters.interactionType} onChange={handleInteractionTypeFilter}>
              <option value="">All Types</option>
              {interactionTypes.map((type) => (
                <option key={type} value={type}>{type.replace(/([A-Z])/g, ' $1').trim()}</option>
              ))}
            </select>
          </div>
          <div className="tasks-filter-group">
            <label>Results per page</label>
            <select
              value={filters.limit}
              onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value), page: 1 })}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>
      )}

      {/* Data Grid */}
      <DataGrid
        columns={columns}
        data={tasks}
        loading={loading}
        pagination={pagination}
        onPageChange={handlePageChange}
        onSort={handleSort}
        onRowClick={handleRowClick}
        onCellEdit={handleCellEdit}
        onDelete={handleDelete}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
      />

      {/* Task Detail Modal */}
      {showTaskModal && (
        <TaskDetailModal
          taskId={selectedTaskId}
          accountId={accountId}
          contactId={contactId}
          onClose={() => setShowTaskModal(false)}
          onSave={handleTaskSaved}
        />
      )}
    </div>
  )
}

export default TasksTab
