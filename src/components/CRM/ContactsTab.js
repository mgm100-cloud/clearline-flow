import React, { useState, useEffect } from 'react'
import { Plus, Filter, Download, Mail } from 'lucide-react'
import DataGrid from './DataGrid'
import { getContacts, updateContact, deleteContact } from '../../services/crmService'
import './ContactsTab.css'

const ContactsTab = ({ onContactClick, accountId = null }) => {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState(null)
  const [filters, setFilters] = useState({
    search: '',
    accountId: accountId || '',
    page: 1,
    limit: 50,
    sortBy: 'last_name',
    sortOrder: 'asc',
  })
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadContacts()
  }, [filters])

  useEffect(() => {
    if (accountId) {
      setFilters((prev) => ({ ...prev, accountId, page: 1 }))
    }
  }, [accountId])

  const loadContacts = async () => {
    setLoading(true)
    try {
      const response = await getContacts(filters)
      setContacts(response.data)
      setPagination(response.pagination)
    } catch (error) {
      console.error('Error loading contacts:', error)
      alert('Failed to load contacts: ' + error.message)
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

  const handleCellEdit = async (rowId, columnId, value) => {
    try {
      await updateContact(rowId, { [columnId]: value })
      await loadContacts()
    } catch (error) {
      console.error('Error updating contact:', error)
      alert('Failed to update: ' + error.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteContact(id)
      await loadContacts()
    } catch (error) {
      console.error('Error deleting contact:', error)
      alert('Failed to delete: ' + error.message)
    }
  }

  const handleExport = () => {
    alert('Export functionality coming soon')
  }

  const columns = [
    {
      id: 'first_name',
      label: 'First Name',
      sortable: true,
      editable: true,
      width: '150px',
    },
    {
      id: 'last_name',
      label: 'Last Name',
      sortable: true,
      editable: true,
      width: '150px',
    },
    {
      id: 'title',
      label: 'Title',
      sortable: true,
      editable: true,
      width: '180px',
    },
    {
      id: 'accounts',
      label: 'Firm',
      sortable: false,
      width: '200px',
      render: (value) => value?.firm_name || '-',
    },
    {
      id: 'email',
      label: 'Email',
      sortable: true,
      editable: true,
      width: '220px',
      render: (value) =>
        value ? (
          <a href={`mailto:${value}`} className="contact-email" onClick={(e) => e.stopPropagation()}>
            {value}
          </a>
        ) : (
          '-'
        ),
    },
    {
      id: 'phone',
      label: 'Phone',
      sortable: true,
      editable: true,
      width: '140px',
    },
    {
      id: 'main_contact',
      label: 'Key Contact',
      sortable: true,
      width: '100px',
      render: (value) => (value ? '✓' : ''),
    },
    {
      id: 'distribution_list',
      label: 'Distribution',
      sortable: true,
      width: '100px',
      render: (value) =>
        value ? (
          <span className="distribution-badge">
            <Mail size={14} />
          </span>
        ) : (
          ''
        ),
    },
  ]

  return (
    <div className="contacts-tab">
      {/* Toolbar */}
      <div className="contacts-toolbar">
        <div className="contacts-toolbar-left">
          <input
            type="text"
            className="contacts-search"
            placeholder="Search contacts..."
            value={filters.search}
            onChange={handleSearch}
          />
          <button
            className={`contacts-filter-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={18} />
            Filters
          </button>
        </div>
        <div className="contacts-toolbar-right">
          <button className="contacts-export-btn" onClick={handleExport}>
            <Download size={18} />
            Export
          </button>
          <button className="contacts-add-btn" onClick={() => alert('Add contact coming soon')}>
            <Plus size={18} />
            Add Contact
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="contacts-filters">
          <div className="contacts-filter-group">
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
        data={contacts}
        loading={loading}
        pagination={pagination}
        onPageChange={handlePageChange}
        onSort={handleSort}
        onRowClick={(row) => onContactClick && onContactClick(row.id)}
        onCellEdit={handleCellEdit}
        onDelete={handleDelete}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
      />
    </div>
  )
}

export default ContactsTab

