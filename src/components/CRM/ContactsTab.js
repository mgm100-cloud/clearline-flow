import React, { useState, useEffect } from 'react'
import { Plus, Filter, Mail, X, Save } from 'lucide-react'
import DataGrid from './DataGrid'
import { getContacts, createContact, updateContact, deleteContact, getAccounts } from '../../services/crmService'
import './ContactsTab.css'

const WHICH_FUND_OPTIONS = ['Onshore', 'Offshore', 'TBD']

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
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [firmOptions, setFirmOptions] = useState([])
  const [firmSearch, setFirmSearch] = useState('')
  const [newContact, setNewContact] = useState({
    account_id: accountId || '',
    salutation: '',
    first_name: '',
    last_name: '',
    title: '',
    email: '',
    phone: '',
    mobile_phone: '',
    mailing_street: '',
    mailing_city: '',
    mailing_state: '',
    mailing_postal_code: '',
    mailing_country: '',
    lead_source: '',
    which_fund: '',
    main_contact: false,
    distribution_list: false,
    description: '',
  })

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

  const loadFirms = async () => {
    try {
      const response = await getAccounts({ limit: 500, sortBy: 'firm_name', sortOrder: 'asc' })
      setFirmOptions(response.data || [])
    } catch (error) {
      console.error('Error loading firms:', error)
    }
  }

  const handleOpenAddModal = () => {
    loadFirms()
    setNewContact({
      account_id: accountId || '',
      salutation: '', first_name: '', last_name: '', title: '', email: '',
      phone: '', mobile_phone: '', mailing_street: '', mailing_city: '',
      mailing_state: '', mailing_postal_code: '', mailing_country: '',
      lead_source: '', which_fund: '', main_contact: false,
      distribution_list: false, description: '',
    })
    setShowAddModal(true)
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

  const handleNewContactChange = (field, value) => {
    setNewContact({ ...newContact, [field]: value })
  }

  const handleAddContact = async () => {
    if (!newContact.first_name.trim() && !newContact.last_name.trim()) {
      alert('First name or last name is required')
      return
    }

    setSaving(true)
    try {
      const payload = { ...newContact }
      Object.keys(payload).forEach(key => {
        if (payload[key] === '') delete payload[key]
      })
      // Keep booleans even if false
      payload.main_contact = newContact.main_contact
      payload.distribution_list = newContact.distribution_list

      await createContact(payload)
      setShowAddModal(false)
      await loadContacts()
    } catch (error) {
      console.error('Error creating contact:', error)
      alert('Failed to create contact: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredFirmOptions = firmSearch
    ? firmOptions.filter(f => f.firm_name.toLowerCase().includes(firmSearch.toLowerCase()))
    : firmOptions

  const columns = [
    { id: 'first_name', label: 'First Name', sortable: true, editable: true, width: '130px' },
    { id: 'last_name', label: 'Last Name', sortable: true, editable: true, width: '130px' },
    { id: 'title', label: 'Title', sortable: true, editable: true, width: '160px' },
    {
      id: 'accounts', label: 'Firm', sortable: false, width: '180px',
      render: (value) => value?.firm_name || '-',
    },
    {
      id: 'email', label: 'Email', sortable: true, editable: true, width: '200px',
      render: (value) => value ? (
        <a href={`mailto:${value}`} className="contact-email" onClick={(e) => e.stopPropagation()}>{value}</a>
      ) : '-',
    },
    { id: 'phone', label: 'Phone', sortable: true, editable: true, width: '130px' },
    { id: 'which_fund', label: 'Fund', sortable: true, width: '90px' },
    {
      id: 'main_contact', label: 'Key', sortable: true, width: '60px',
      render: (value) => (value ? 'Yes' : ''),
    },
    {
      id: 'distribution_list', label: 'Dist', sortable: true, width: '60px',
      render: (value) => value ? <span className="distribution-badge"><Mail size={14} /></span> : '',
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
          <button className="contacts-add-btn" onClick={handleOpenAddModal}>
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

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Contact</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <h3>Firm</h3>
                <div className="modal-fields">
                  <div className="modal-field full-width">
                    <label>Select Firm</label>
                    <input
                      type="text"
                      placeholder="Search firms..."
                      value={firmSearch}
                      onChange={(e) => setFirmSearch(e.target.value)}
                      className="modal-search-input"
                    />
                    <select
                      value={newContact.account_id}
                      onChange={(e) => handleNewContactChange('account_id', e.target.value)}
                      size={Math.min(5, filteredFirmOptions.length + 1)}
                      className="modal-firm-select"
                    >
                      <option value="">-- No Firm --</option>
                      {filteredFirmOptions.map(f => (
                        <option key={f.id} value={f.id}>{f.firm_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <h3>Personal Information</h3>
                <div className="modal-fields">
                  <div className="modal-field">
                    <label>Salutation</label>
                    <select value={newContact.salutation} onChange={(e) => handleNewContactChange('salutation', e.target.value)}>
                      <option value="">Select...</option>
                      <option value="Mr.">Mr.</option>
                      <option value="Ms.">Ms.</option>
                      <option value="Mrs.">Mrs.</option>
                      <option value="Dr.">Dr.</option>
                    </select>
                  </div>
                  <div className="modal-field">
                    <label>First Name *</label>
                    <input type="text" value={newContact.first_name} onChange={(e) => handleNewContactChange('first_name', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>Last Name *</label>
                    <input type="text" value={newContact.last_name} onChange={(e) => handleNewContactChange('last_name', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>Title</label>
                    <input type="text" value={newContact.title} onChange={(e) => handleNewContactChange('title', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>Email</label>
                    <input type="email" value={newContact.email} onChange={(e) => handleNewContactChange('email', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>Phone</label>
                    <input type="tel" value={newContact.phone} onChange={(e) => handleNewContactChange('phone', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>Mobile Phone</label>
                    <input type="tel" value={newContact.mobile_phone} onChange={(e) => handleNewContactChange('mobile_phone', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>Lead Source</label>
                    <input type="text" value={newContact.lead_source} onChange={(e) => handleNewContactChange('lead_source', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <h3>Clearline Information</h3>
                <div className="modal-fields">
                  <div className="modal-field">
                    <label>Which Fund</label>
                    <select value={newContact.which_fund} onChange={(e) => handleNewContactChange('which_fund', e.target.value)}>
                      <option value="">Select...</option>
                      {WHICH_FUND_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="modal-field">
                    <label className="checkbox-label">
                      <input type="checkbox" checked={newContact.main_contact} onChange={(e) => handleNewContactChange('main_contact', e.target.checked)} />
                      Key Contact
                    </label>
                  </div>
                  <div className="modal-field">
                    <label className="checkbox-label">
                      <input type="checkbox" checked={newContact.distribution_list} onChange={(e) => handleNewContactChange('distribution_list', e.target.checked)} />
                      Distribution List
                    </label>
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <h3>Address</h3>
                <div className="modal-fields">
                  <div className="modal-field full-width">
                    <label>Street</label>
                    <input type="text" value={newContact.mailing_street} onChange={(e) => handleNewContactChange('mailing_street', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>City</label>
                    <input type="text" value={newContact.mailing_city} onChange={(e) => handleNewContactChange('mailing_city', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>State</label>
                    <input type="text" value={newContact.mailing_state} onChange={(e) => handleNewContactChange('mailing_state', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>Postal Code</label>
                    <input type="text" value={newContact.mailing_postal_code} onChange={(e) => handleNewContactChange('mailing_postal_code', e.target.value)} />
                  </div>
                  <div className="modal-field">
                    <label>Country</label>
                    <input type="text" value={newContact.mailing_country} onChange={(e) => handleNewContactChange('mailing_country', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-fields">
                  <div className="modal-field full-width">
                    <label>Description</label>
                    <textarea value={newContact.description} onChange={(e) => handleNewContactChange('description', e.target.value)} rows={3} />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-cancel-btn" onClick={() => setShowAddModal(false)} disabled={saving}>Cancel</button>
              <button className="modal-save-btn" onClick={handleAddContact} disabled={saving}>
                <Save size={18} />
                {saving ? 'Saving...' : 'Create Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ContactsTab
