import React, { useState, useEffect } from 'react'
import { Plus, Filter, Download, X, Save } from 'lucide-react'
import DataGrid from './DataGrid'
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../../services/crmService'
import { US_STATES, getCountryList } from './crmConstants'
import './FirmsTab.css'

const COUNTRIES = getCountryList()

const ACCOUNT_TYPES = [
  'Fund of Funds', 'Wealth Manager', 'Pension – Public', 'Family Office',
  'Multi Family Office', 'Endowment', 'Pension – Corporate', 'Private Bank',
  'Consultant', 'Outsourced CIO', 'High Net Worth', 'Foundation', 'Bank',
  'Prime Broker', 'Employee', 'Sovereign Wealth Fund', 'Insurance Company',
]

const STATUS_OPTIONS = [
  '1 Investor', '2 Active Diligence', '3 Potential Investor in 6 Months',
  '4 High Focus', '5 Low Focus', '6 Dormant',
]

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
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newFirm, setNewFirm] = useState({
    firm_name: '',
    type: '',
    status: '',
    address: '',
    city: '',
    state: '',
    country: '',
    zip_code: '',
    phone_number: '',
    website: '',
    aum: '',
    tier: '',
    category: '',
    description: '',
    high_quality: false,
    focus_list: false,
    pm_meeting: false,
    status_summary: '',
    structure_issues: '',
    probability_of_investment: '',
    investment_size_min: '',
    investment_size_max: '',
  })

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
      await updateAccount(rowId, {
        [columnId]: value,
        updated_date: new Date().toISOString().split('T')[0],
      })
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

  const handleNewFirmChange = (field, value) => {
    setNewFirm({ ...newFirm, [field]: value })
  }

  const handleAddFirm = async () => {
    if (!newFirm.firm_name.trim()) {
      alert('Firm name is required')
      return
    }

    setSaving(true)
    try {
      const payload = { ...newFirm }
      // Clean up numeric fields
      if (payload.aum) payload.aum = parseFloat(payload.aum)
      else delete payload.aum
      if (payload.probability_of_investment) payload.probability_of_investment = parseFloat(payload.probability_of_investment)
      else delete payload.probability_of_investment
      if (payload.investment_size_min) payload.investment_size_min = parseFloat(payload.investment_size_min)
      else delete payload.investment_size_min
      if (payload.investment_size_max) payload.investment_size_max = parseFloat(payload.investment_size_max)
      else delete payload.investment_size_max
      // Remove empty strings
      Object.keys(payload).forEach(key => {
        if (payload[key] === '') delete payload[key]
      })

      await createAccount(payload)
      setShowAddModal(false)
      setNewFirm({
        firm_name: '', type: '', status: '', address: '', city: '', state: '',
        country: '', zip_code: '', phone_number: '', website: '', aum: '',
        tier: '', category: '', description: '', high_quality: false,
        focus_list: false, pm_meeting: false, status_summary: '',
        structure_issues: '', probability_of_investment: '',
        investment_size_min: '', investment_size_max: '',
      })
      await loadAccounts()
    } catch (error) {
      console.error('Error creating firm:', error)
      alert('Failed to create firm: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { id: 'firm_name', label: 'Firm Name', sortable: true, editable: true, width: '220px' },
    {
      id: 'status', label: 'Status', sortable: true, editable: true, width: '200px',
      render: (value) => (
        <span className={`status-badge status-${value?.charAt(0) || ''}`}>{value || '-'}</span>
      ),
    },
    { id: 'type', label: 'Type', sortable: true, width: '150px' },
    { id: 'city', label: 'City', sortable: true, editable: true, width: '110px' },
    { id: 'state', label: 'State', sortable: true, editable: true, width: '70px' },
    { id: 'country', label: 'Country', sortable: true, width: '90px' },
    {
      id: 'aum', label: 'AUM', sortable: true, width: '100px',
      render: (value) => (value ? `$${Math.round(value / 1000000).toLocaleString()}mm` : '-'),
    },
    { id: 'tier', label: 'Tier', sortable: true, width: '80px' },
    {
      id: 'last_activity', label: 'Last Activity', sortable: true, width: '110px',
      render: (value) => (value ? new Date(value).toLocaleDateString() : '-'),
    },
    {
      id: 'pm_meeting', label: 'PM Mtg', sortable: true, width: '70px',
      render: (value) => (value ? 'Yes' : ''),
    },
    {
      id: 'focus_list', label: 'Focus', sortable: true, width: '65px',
      render: (value) => (value ? 'Yes' : ''),
    },
    {
      id: 'high_quality', label: 'HQ', sortable: true, width: '55px',
      render: (value) => (value ? 'Yes' : ''),
    },
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
          <button className="firms-add-btn" onClick={() => setShowAddModal(true)}>
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
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status}</option>
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

      {/* Add Firm Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Firm</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <h3>Basic Information</h3>
                <div className="modal-fields">
                  <div className="modal-field full-width">
                    <label>Firm Name *</label>
                    <input type="text" value={newFirm.firm_name} onChange={(e) => handleNewFirmChange('firm_name', e.target.value)} placeholder="Enter firm name" />
                  </div>
                  <div className="modal-field">
                    <label>Type</label>
                    <select value={newFirm.type} onChange={(e) => handleNewFirmChange('type', e.target.value)}>
                      <option value="">Select type...</option>
                      {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="modal-field">
                    <label>Status</label>
                    <select value={newFirm.status} onChange={(e) => handleNewFirmChange('status', e.target.value)}>
                      <option value="">Select status...</option>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="modal-field">
                    <label>Phone</label>
                    <input type="text" value={newFirm.phone_number} onChange={(e) => handleNewFirmChange('phone_number', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>Website</label>
                    <input type="text" value={newFirm.website} onChange={(e) => handleNewFirmChange('website', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <h3>Address</h3>
                <div className="modal-fields">
                  <div className="modal-field full-width">
                    <label>Street</label>
                    <input type="text" value={newFirm.address} onChange={(e) => handleNewFirmChange('address', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>City</label>
                    <input type="text" value={newFirm.city} onChange={(e) => handleNewFirmChange('city', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>State</label>
                    <select value={newFirm.state} onChange={(e) => handleNewFirmChange('state', e.target.value)}>
                      <option value="">Select state...</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="modal-field">
                    <label>Country</label>
                    <select value={newFirm.country} onChange={(e) => handleNewFirmChange('country', e.target.value)}>
                      <option value="">Select country...</option>
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="modal-field">
                    <label>Zip Code</label>
                    <input type="text" value={newFirm.zip_code} onChange={(e) => handleNewFirmChange('zip_code', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <h3>Investment Information</h3>
                <div className="modal-fields">
                  <div className="modal-field">
                    <label>AUM</label>
                    <input type="number" value={newFirm.aum} onChange={(e) => handleNewFirmChange('aum', e.target.value)} placeholder="e.g. 500000000" />
                  </div>
                  <div className="modal-field">
                    <label>Investment Size Min</label>
                    <input type="number" value={newFirm.investment_size_min} onChange={(e) => handleNewFirmChange('investment_size_min', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>Investment Size Max</label>
                    <input type="number" value={newFirm.investment_size_max} onChange={(e) => handleNewFirmChange('investment_size_max', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>Probability of Investment</label>
                    <input type="number" value={newFirm.probability_of_investment} onChange={(e) => handleNewFirmChange('probability_of_investment', e.target.value)} placeholder="0-100" />
                  </div>
                  <div className="modal-field">
                    <label>Tier</label>
                    <input type="text" value={newFirm.tier} onChange={(e) => handleNewFirmChange('tier', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>Category</label>
                    <input type="text" value={newFirm.category} onChange={(e) => handleNewFirmChange('category', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <h3>Flags</h3>
                <div className="modal-fields">
                  <div className="modal-field">
                    <label className="checkbox-label">
                      <input type="checkbox" checked={newFirm.pm_meeting} onChange={(e) => handleNewFirmChange('pm_meeting', e.target.checked)} />
                      PM Meeting
                    </label>
                  </div>
                  <div className="modal-field">
                    <label className="checkbox-label">
                      <input type="checkbox" checked={newFirm.focus_list} onChange={(e) => handleNewFirmChange('focus_list', e.target.checked)} />
                      Focus List
                    </label>
                  </div>
                  <div className="modal-field">
                    <label className="checkbox-label">
                      <input type="checkbox" checked={newFirm.high_quality} onChange={(e) => handleNewFirmChange('high_quality', e.target.checked)} />
                      High Quality
                    </label>
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <h3>Notes</h3>
                <div className="modal-fields">
                  <div className="modal-field full-width">
                    <label>Status Summary</label>
                    <textarea value={newFirm.status_summary} onChange={(e) => handleNewFirmChange('status_summary', e.target.value)} rows={3} placeholder="Status summary..." />
                  </div>
                  <div className="modal-field full-width">
                    <label>Structure Issues</label>
                    <textarea value={newFirm.structure_issues} onChange={(e) => handleNewFirmChange('structure_issues', e.target.value)} rows={2} />
                  </div>
                  <div className="modal-field full-width">
                    <label>Description</label>
                    <textarea value={newFirm.description} onChange={(e) => handleNewFirmChange('description', e.target.value)} rows={4} placeholder="Description..." />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-cancel-btn" onClick={() => setShowAddModal(false)} disabled={saving}>Cancel</button>
              <button className="modal-save-btn" onClick={handleAddFirm} disabled={saving}>
                <Save size={18} />
                {saving ? 'Saving...' : 'Create Firm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FirmsTab
