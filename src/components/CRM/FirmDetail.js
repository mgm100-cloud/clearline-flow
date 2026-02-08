import React, { useState, useEffect } from 'react'
import { ArrowLeft, Edit2, Save, X, Building2, Target, MapPin, TrendingUp, Users, CalendarDays, FileText } from 'lucide-react'
import ContactsTab from './ContactsTab'
import TasksTab from './TasksTab'
import {
  getAccount,
  updateAccount,
  getClientCapital,
  getClientSubscriptions,
  getClientRedemptions,
} from '../../services/crmService'
import { US_STATES, getCountryList } from './crmConstants'
import './FirmDetail.css'

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

const COUNTRIES = getCountryList()

const FirmDetail = ({ firmId, onBack, onContactClick }) => {
  const [firm, setFirm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editedFirm, setEditedFirm] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [capitalData, setCapitalData] = useState([])
  const [subsData, setSubsData] = useState([])
  const [redsData, setRedsData] = useState([])

  useEffect(() => {
    loadFirm()
    loadClientData()
  }, [firmId])

  const loadFirm = async () => {
    setLoading(true)
    try {
      const data = await getAccount(firmId)
      setFirm(data)
      setEditedFirm(data)
    } catch (error) {
      console.error('Error loading firm:', error)
      alert('Failed to load firm: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const loadClientData = async () => {
    try {
      const [capital, subs, reds] = await Promise.all([
        getClientCapital(firmId),
        getClientSubscriptions(firmId),
        getClientRedemptions(firmId),
      ])
      setCapitalData(capital)
      setSubsData(subs)
      setRedsData(reds)
    } catch (error) {
      console.error('Error loading client data:', error)
    }
  }

  const handleEdit = () => {
    setEditing(true)
    setEditedFirm({ ...firm })
  }

  const handleCancel = () => {
    setEditing(false)
    setEditedFirm({ ...firm })
  }

  const handleSave = async () => {
    try {
      const payload = { ...editedFirm }
      // Clean numeric fields
      if (payload.aum !== null && payload.aum !== undefined) payload.aum = payload.aum === '' ? null : parseFloat(payload.aum)
      if (payload.investment_size_min !== null && payload.investment_size_min !== undefined) payload.investment_size_min = payload.investment_size_min === '' ? null : parseFloat(payload.investment_size_min)
      if (payload.investment_size_max !== null && payload.investment_size_max !== undefined) payload.investment_size_max = payload.investment_size_max === '' ? null : parseFloat(payload.investment_size_max)
      if (payload.hf_investments !== null && payload.hf_investments !== undefined) payload.hf_investments = payload.hf_investments === '' ? null : parseInt(payload.hf_investments)
      if (payload.probability_of_investment !== null && payload.probability_of_investment !== undefined) payload.probability_of_investment = payload.probability_of_investment === '' ? null : parseFloat(payload.probability_of_investment)
      // Remove read-only/computed fields
      delete payload.id
      delete payload.created_at
      delete payload.updated_at
      delete payload.deleted_at
      delete payload.sf_ext_id
      delete payload.created_date  // never editable
      delete payload.last_activity // only updated via task creation

      // Auto-set updated_date to today
      payload.updated_date = new Date().toISOString().split('T')[0]

      const updated = await updateAccount(firmId, payload)
      setFirm(updated)
      setEditing(false)
    } catch (error) {
      console.error('Error updating firm:', error)
      alert('Failed to update: ' + error.message)
    }
  }

  const handleFieldChange = (field, value) => {
    setEditedFirm({ ...editedFirm, [field]: value })
  }

  const calculateTotals = () => {
    const totalInvested = subsData.reduce((sum, sub) => sum + (parseFloat(sub.capital) || 0), 0)
    const totalRedeemed = redsData.reduce((sum, red) => sum + (parseFloat(red.capital) || 0), 0)
    const netInvested = totalInvested - totalRedeemed
    return { totalInvested, totalRedeemed, netInvested }
  }

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-'
    return `$${Math.round(value / 1000000).toLocaleString()}mm`
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  // Render an editable field with appropriate input type
  const renderField = (label, field, options = {}) => {
    const { type = 'text', choices, fullWidth, rows, readOnly } = options
    const value = editing ? editedFirm?.[field] : firm?.[field]
    const isEditable = editing && !readOnly

    const renderDisplay = () => {
      if (type === 'checkbox') {
        return <span className={`bool-pill ${value ? 'yes' : 'no'}`}>{value ? 'Yes' : 'No'}</span>
      }
      if (field === 'website' && value) {
        return <span className="field-value"><a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer">{value}</a></span>
      }
      if (field === 'aum' || field === 'investment_size_min' || field === 'investment_size_max') {
        return <span className={`field-value ${!value ? 'empty' : ''}`}>{value ? formatCurrency(value) : 'Not set'}</span>
      }
      if (field === 'created_date' || field === 'updated_date' || field === 'last_activity') {
        return <span className={`field-value ${!value ? 'empty' : ''}`}>{value ? formatDate(value) : 'Not set'}</span>
      }
      return <span className={`field-value ${!value ? 'empty' : ''}`}>{value || 'Not set'}</span>
    }

    return (
      <div className={`firm-detail-field ${fullWidth ? 'full-width' : ''}`}>
        <label>{label}</label>
        {isEditable ? (
          type === 'select' ? (
            <select value={value || ''} onChange={(e) => handleFieldChange(field, e.target.value)}>
              <option value="">Select...</option>
              {choices.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : type === 'checkbox' ? (
            <input type="checkbox" checked={value || false} onChange={(e) => handleFieldChange(field, e.target.checked)} />
          ) : type === 'textarea' ? (
            <textarea
              value={value || ''}
              onChange={(e) => handleFieldChange(field, e.target.value)}
              rows={rows || 3}
            />
          ) : type === 'number' ? (
            <input type="number" value={value ?? ''} onChange={(e) => handleFieldChange(field, e.target.value)} />
          ) : (
            <input type={type} value={value || ''} onChange={(e) => handleFieldChange(field, e.target.value)} />
          )
        ) : (
          renderDisplay()
        )}
      </div>
    )
  }

  // Section card wrapper
  const Section = ({ icon, iconClass, title, fullWidth, children }) => (
    <div className={`firm-detail-section ${fullWidth ? 'full-width' : ''} ${editing ? 'is-editing' : ''}`}>
      <div className="firm-detail-section-header">
        <div className={`firm-detail-section-icon ${iconClass}`}>{icon}</div>
        <h3>{title}</h3>
      </div>
      <div className="firm-detail-section-body">
        {children}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="firm-detail-loading">
        <div className="data-grid-spinner" />
        <div>Loading firm details...</div>
      </div>
    )
  }

  if (!firm) {
    return (
      <div className="firm-detail-error">
        <p>Firm not found</p>
        <button onClick={onBack}>Go Back</button>
      </div>
    )
  }

  const totals = calculateTotals()
  const location = [firm.city, firm.state, firm.country].filter(Boolean).join(', ')
  const statusChar = firm.status?.charAt(0) || ''

  return (
    <div className="firm-detail">
      {/* ---- HERO HEADER ---- */}
      <div className="firm-detail-hero">
        <div className="firm-detail-hero-top">
          <button className="firm-detail-back" onClick={onBack}>
            <ArrowLeft size={16} />
            Back to Firms
          </button>
          <div className="firm-detail-actions">
            {!editing ? (
              <button className="firm-detail-edit-btn" onClick={handleEdit}>
                <Edit2 size={15} />
                Edit Firm
              </button>
            ) : (
              <>
                <button className="firm-detail-cancel-btn" onClick={handleCancel}>
                  <X size={15} />
                  Cancel
                </button>
                <button className="firm-detail-save-btn" onClick={handleSave}>
                  <Save size={15} />
                  Save Changes
                </button>
              </>
            )}
          </div>
        </div>

        <div className="firm-detail-hero-name">
          {editing ? (
            <input
              type="text"
              className="firm-detail-title-input"
              value={editedFirm.firm_name}
              onChange={(e) => handleFieldChange('firm_name', e.target.value)}
            />
          ) : (
            <h1>{firm.firm_name}</h1>
          )}
          <div className="firm-detail-hero-meta">
            {firm.status && (
              <span className={`hero-badge badge-${statusChar}`}>{firm.status}</span>
            )}
            {firm.type && <span className="hero-type">{firm.type}</span>}
            {location && <span className="hero-type">{location}</span>}
            {firm.focus_list && <span className="hero-flag">Focus List</span>}
            {firm.high_quality && <span className="hero-flag">High Quality</span>}
            {firm.pm_meeting && <span className="hero-flag">PM Meeting</span>}
          </div>
        </div>

        <div className="firm-detail-hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-label">AUM</span>
            <span className="hero-stat-value">{firm.aum ? formatCurrency(firm.aum) : '-'}</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Tier</span>
            <span className="hero-stat-value">{firm.tier || '-'}</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Last Activity</span>
            <span className="hero-stat-value">{firm.last_activity ? formatDate(firm.last_activity) : '-'}</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Probability</span>
            <span className="hero-stat-value">{firm.probability_of_investment != null ? `${firm.probability_of_investment}%` : '-'}</span>
          </div>
        </div>
      </div>

      {/* ---- TABS ---- */}
      <div className="firm-detail-tabs">
        {['overview', 'contacts', 'interactions', 'capital'].map(tab => (
          <button
            key={tab}
            className={`firm-detail-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'capital' ? 'Client Capital' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ---- CONTENT ---- */}
      <div className="firm-detail-content">
        {activeTab === 'overview' && (
          <div className="firm-detail-overview">
            <Section icon={<Building2 size={18} />} iconClass="icon-basic" title="Basic Information">
              <div className="firm-detail-fields">
                {renderField('Type', 'type', { type: 'select', choices: ACCOUNT_TYPES })}
                {renderField('Status', 'status', { type: 'select', choices: STATUS_OPTIONS })}
                {renderField('Website', 'website')}
                {renderField('Phone', 'phone_number')}
                {renderField('Tier', 'tier')}
                {renderField('Category', 'category')}
              </div>
            </Section>

            <Section icon={<Target size={18} />} iconClass="icon-pipeline" title="Pipeline & Flags">
              <div className="firm-detail-fields">
                {renderField('High Quality', 'high_quality', { type: 'checkbox' })}
                {renderField('PM Meeting', 'pm_meeting', { type: 'checkbox' })}
                {renderField('Focus List', 'focus_list', { type: 'checkbox' })}
                {renderField('Probability', 'probability_of_investment', { type: 'select', choices: Array.from({length: 21}, (_, i) => String(100 - i * 5)) })}
                {renderField('Status Summary', 'status_summary', { type: 'textarea', fullWidth: true, rows: 3 })}
                {renderField('Structure Issues', 'structure_issues', { type: 'textarea', fullWidth: true, rows: 2 })}
              </div>
            </Section>

            <Section icon={<MapPin size={18} />} iconClass="icon-address" title="Location">
              <div className="firm-detail-fields">
                {renderField('Street', 'address', { fullWidth: true })}
                {renderField('City', 'city')}
                {renderField('State', 'state', { type: 'select', choices: US_STATES })}
                {renderField('Country', 'country', { type: 'select', choices: COUNTRIES })}
                {renderField('Zip Code', 'zip_code')}
              </div>
            </Section>

            <Section icon={<TrendingUp size={18} />} iconClass="icon-investment" title="Investment Details">
              <div className="firm-detail-fields">
                {renderField('AUM', 'aum', { type: 'number' })}
                {renderField('Investment Min', 'investment_size_min', { type: 'number' })}
                {renderField('Investment Max', 'investment_size_max', { type: 'number' })}
                {renderField('HF Investments', 'hf_investments', { type: 'number' })}
              </div>
            </Section>

            <Section icon={<Users size={18} />} iconClass="icon-relationship" title="Relationship">
              <div className="firm-detail-fields">
                {renderField('PB Introduction', 'pb_introduction')}
                {renderField('Consultant', 'consultant')}
              </div>
            </Section>

            <Section icon={<CalendarDays size={18} />} iconClass="icon-dates" title="Key Dates">
              <div className="firm-detail-fields">
                {renderField('Created', 'created_date', { readOnly: true })}
                {renderField('Last Modified', 'updated_date', { readOnly: true })}
                {renderField('Last Activity', 'last_activity', { readOnly: true })}
              </div>
            </Section>

            <Section icon={<FileText size={18} />} iconClass="icon-description" title="Description" fullWidth>
              {editing ? (
                <textarea
                  className="firm-detail-textarea"
                  value={editedFirm.description || ''}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  rows={6}
                />
              ) : (
                <p className="firm-detail-description">{firm.description || 'No description available.'}</p>
              )}
            </Section>
          </div>
        )}

        {activeTab === 'contacts' && <ContactsTab accountId={firmId} onContactClick={onContactClick} />}

        {activeTab === 'interactions' && <TasksTab accountId={firmId} />}

        {activeTab === 'capital' && (
          <div className="firm-detail-capital">
            <div className="firm-detail-capital-summary">
              <div className="capital-summary-card">
                <div className="capital-summary-label">Total Invested</div>
                <div className="capital-summary-value positive">
                  ${Math.round(totals.totalInvested / 1000000).toLocaleString()}mm
                </div>
              </div>
              <div className="capital-summary-card">
                <div className="capital-summary-label">Total Redeemed</div>
                <div className="capital-summary-value negative">
                  ${Math.round(totals.totalRedeemed / 1000000).toLocaleString()}mm
                </div>
              </div>
              <div className="capital-summary-card">
                <div className="capital-summary-label">Net Invested</div>
                <div className="capital-summary-value">
                  ${Math.round(totals.netInvested / 1000000).toLocaleString()}mm
                </div>
              </div>
            </div>

            {capitalData.length > 0 ? (
              <div className="firm-detail-capital-chart">
                <h3>Monthly Capital</h3>
                <div className="capital-chart-container">
                  <table className="capital-data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Current Capital</th>
                      </tr>
                    </thead>
                    <tbody>
                      {capitalData.map((row, i) => (
                        <tr key={i}>
                          <td>{new Date(row.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td>
                          <td>${Math.round(parseFloat(row.current_capital) / 1000000).toLocaleString()}mm</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="firm-detail-capital-empty">
                <p>No capital data available for this firm.</p>
              </div>
            )}

            {(subsData.length > 0 || redsData.length > 0) && (
              <div className="firm-detail-capital-transactions">
                <h3>Subscriptions & Redemptions</h3>
                <div className="capital-transactions-grid">
                  {subsData.length > 0 && (
                    <div className="capital-transaction-section">
                      <h4>Subscriptions (Investments)</h4>
                      <table className="capital-data-table">
                        <thead>
                          <tr>
                            <th>Date Subscribed</th>
                            <th>Capital</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subsData.map((row, i) => (
                            <tr key={i}>
                              <td>{new Date(row.date_subscribed).toLocaleDateString()}</td>
                              <td>${Math.round(parseFloat(row.capital) / 1000000).toLocaleString()}mm</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {redsData.length > 0 && (
                    <div className="capital-transaction-section">
                      <h4>Redemptions</h4>
                      <table className="capital-data-table">
                        <thead>
                          <tr>
                            <th>Date Redeemed</th>
                            <th>Capital</th>
                          </tr>
                        </thead>
                        <tbody>
                          {redsData.map((row, i) => (
                            <tr key={i}>
                              <td>{new Date(row.date_redeemed).toLocaleDateString()}</td>
                              <td>${Math.round(parseFloat(row.capital) / 1000000).toLocaleString()}mm</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default FirmDetail
