import React, { useState, useEffect } from 'react'
import { Plus, Filter, Download } from 'lucide-react'
import DataGrid from './DataGrid'
import { getAccounts, updateAccount, deleteAccount } from '../../services/crmService'
import './FirmsTab.css'

const FirmsTab = ({ onFirmClick }) => {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState(null)
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    page: 1,
    limit: 50,
    sortBy: 'firm_name',
    sortOrder: 'asc',
  })
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadAccounts()
  }, [filters])

  const loadAccounts = async () => {
    setLoading(true)
    try {
      const response = await getAccounts(filters)
      setAccounts(response.data)
      setPagination(response.pagination)
    } catch (error) {
      console.error('Error loading accounts:', error)
      alert('Failed to load firms: ' + error.message)
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

  const handleStatusFilter = (e) => {
    const status = e.target.value
    setFilters({ ...filters, status, page: 1 })
  }

  const handleCellEdit = async (rowId, columnId, value) => {
    try {
      await updateAccount(rowId, { [columnId]: value })
      // Reload to get fresh data
      await loadAccounts()
    } catch (error) {
      console.error('Error updating account:', error)
      alert('Failed to update: ' + error.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteAccount(id)
      await loadAccounts()
    } catch (error) {
      console.error('Error deleting account:', error)
      alert('Failed to delete: ' + error.message)
    }
  }

  const handleExport = () => {
    // TODO: Implement CSV export
    alert('Export functionality coming soon')
  }

  const columns = [
    {
      id: 'firm_name',
      label: 'Firm Name',
      sortable: true,
      editable: true,
      width: '250px',
    },
    {
      id: 'status',
      label: 'Status',
      sortable: true,
      editable: true,
      width: '180px',
      render: (value) => (
        <span className={`status-badge status-${value?.charAt(0) || ''}`}>
          {value || '-'}
        </span>
      ),
    },
    {
      id: 'type',
      label: 'Type',
      sortable: true,
      width: '150px',
    },
    {
      id: 'city',
      label: 'City',
      sortable: true,
      editable: true,
      width: '120px',
    },
    {
      id: 'state',
      label: 'State',
      sortable: true,
      editable: true,
      width: '80px',
    },
    {
      id: 'aum',
      label: 'AUM',
      sortable: true,
      width: '120px',
      render: (value) => (value ? `$${(value / 1000000).toFixed(1)}M` : '-'),
    },
    {
      id: 'last_activity',
      label: 'Last Activity',
      sortable: true,
      width: '120px',
      render: (value) => (value ? new Date(value).toLocaleDateString() : '-'),
    },
    {
      id: 'pm_meeting',
      label: 'PM Meeting',
      sortable: true,
      width: '100px',
      render: (value) => (value ? '✓' : ''),
    },
  ]

  const statusOptions = [
    '1 Investor',
    '2 Active Diligence',
    '3 Potential Investor in 6 Months',
    '4 High Focus',
    '5 Low Focus',
    '6 Dormant',
  ]

  return (
    <div className="firms-tab">
      {/* Toolbar */}
      <div className="firms-toolbar">
        <div className="firms-toolbar-left">
          <input
            type="text"
            className="firms-search"
            placeholder="Search firms..."
            value={filters.search}
            onChange={handleSearch}
          />
          <button
            className={`firms-filter-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={18} />
            Filters
          </button>
        </div>
        <div className="firms-toolbar-right">
          <button className="firms-export-btn" onClick={handleExport}>
            <Download size={18} />
            Export
          </button>
          <button className="firms-add-btn" onClick={() => alert('Add firm coming soon')}>
            <Plus size={18} />
            Add Firm
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="firms-filters">
          <div className="firms-filter-group">
            <label>Status</label>
            <select value={filters.status} onChange={handleStatusFilter}>
              <option value="">All Statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="firms-filter-group">
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
        data={accounts}
        loading={loading}
        pagination={pagination}
        onPageChange={handlePageChange}
        onSort={handleSort}
        onRowClick={(row) => onFirmClick && onFirmClick(row.id)}
        onCellEdit={handleCellEdit}
        onDelete={handleDelete}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
      />
    </div>
  )
}

export default FirmsTab

