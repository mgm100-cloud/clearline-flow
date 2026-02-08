import React, { useState, useEffect } from 'react'
import { ArrowLeft, Edit2, Save, X, Mail, Plus } from 'lucide-react'
import ContactsTab from './ContactsTab'
import TasksTab from './TasksTab'
import {
  getAccount,
  updateAccount,
  getClientCapital,
  getClientSubscriptions,
  getClientRedemptions,
} from '../../services/crmService'
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
    return `$${(value / 1000000).toFixed(2)}M`
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  // Render an editable field with appropriate input type
  const renderField = (label, field, options = {}) => {
    const { type = 'text', choices, fullWidth, rows } = options
    const value = editing ? editedFirm?.[field] : firm?.[field]

    return (
      <div className={`firm-detail-field ${fullWidth ? 'full-width' : ''}`}>
        <label>{label}</label>
        {editing ? (
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
          type === 'checkbox' ? (
            <span>{value ? 'Yes' : 'No'}</span>
          ) : field === 'website' && value ? (
            <span><a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer">{value}</a></span>
          ) : field === 'aum' || field === 'investment_size_min' || field === 'investment_size_max' ? (
            <span>{value ? formatCurrency(value) : '-'}</span>
          ) : field === 'created_date' || field === 'updated_date' || field === 'last_activity' ? (
            <span>{formatDate(value)}</span>
          ) : (
            <span>{value || '-'}</span>
          )
        )}
      </div>
    )
  }

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

  return (
    <div className="firm-detail">
      {/* Header */}
      <div className="firm-detail-header">
        <button className="firm-detail-back" onClick={onBack}>
          <ArrowLeft size={20} />
          Back to Firms
        </button>
        <div className="firm-detail-actions">
          {!editing ? (
            <button className="firm-detail-edit-btn" onClick={handleEdit}>
              <Edit2 size={18} />
              Edit
            </button>
          ) : (
            <>
              <button className="firm-detail-cancel-btn" onClick={handleCancel}>
                <X size={18} />
                Cancel
              </button>
              <button className="firm-detail-save-btn" onClick={handleSave}>
                <Save size={18} />
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {/* Firm Name */}
      <div className="firm-detail-title">
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
        {firm.status && (
          <span className={`status-badge status-${firm.status.charAt(0)}`}>{firm.status}</span>
        )}
      </div>

      {/* Tabs */}
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

      {/* Content */}
      <div className="firm-detail-content">
        {activeTab === 'overview' && (
          <div className="firm-detail-overview">
            {/* Basic Information */}
            <div className="firm-detail-section">
              <h3>Basic Information</h3>
              <div className="firm-detail-fields">
                {renderField('Type', 'type', { type: 'select', choices: ACCOUNT_TYPES })}
                {renderField('Status', 'status', { type: 'select', choices: STATUS_OPTIONS })}
                {renderField('Website', 'website')}
                {renderField('Phone', 'phone_number')}
                {renderField('Tier', 'tier')}
                {renderField('Category', 'category')}
              </div>
            </div>

            {/* Status & Pipeline */}
            <div className="firm-detail-section">
              <h3>Status & Pipeline</h3>
              <div className="firm-detail-fields">
                {renderField('Status Summary', 'status_summary', { type: 'textarea', fullWidth: true, rows: 3 })}
                {renderField('High Quality', 'high_quality', { type: 'checkbox' })}
                {renderField('Structure Issues', 'structure_issues', { type: 'textarea', fullWidth: true, rows: 2 })}
                {renderField('PM Meeting', 'pm_meeting', { type: 'checkbox' })}
                {renderField('Focus List', 'focus_list', { type: 'checkbox' })}
              </div>
            </div>

            {/* Address */}
            <div className="firm-detail-section">
              <h3>Address</h3>
              <div className="firm-detail-fields">
                {renderField('Street', 'address', { fullWidth: true })}
                {renderField('City', 'city')}
                {renderField('State', 'state')}
                {renderField('Country', 'country')}
                {renderField('Zip Code', 'zip_code')}
              </div>
            </div>

            {/* Investment Information */}
            <div className="firm-detail-section">
              <h3>Investment Information</h3>
              <div className="firm-detail-fields">
                {renderField('AUM', 'aum', { type: 'number' })}
                {renderField('Investment Size (Min)', 'investment_size_min', { type: 'number' })}
                {renderField('Investment Size (Max)', 'investment_size_max', { type: 'number' })}
                {renderField('HF Investments', 'hf_investments', { type: 'number' })}
                {renderField('Probability of Investment', 'probability_of_investment', { type: 'number' })}
              </div>
            </div>

            {/* Relationship */}
            <div className="firm-detail-section">
              <h3>Relationship</h3>
              <div className="firm-detail-fields">
                {renderField('PB Introduction', 'pb_introduction')}
                {renderField('Consultant', 'consultant')}
              </div>
            </div>

            {/* Dates */}
            <div className="firm-detail-section">
              <h3>Dates</h3>
              <div className="firm-detail-fields">
                {renderField('Created Date', 'created_date')}
                {renderField('Updated Date', 'updated_date')}
                {renderField('Last Activity', 'last_activity')}
              </div>
            </div>

            {/* Description */}
            <div className="firm-detail-section">
              <h3>Description</h3>
              {editing ? (
                <textarea
                  className="firm-detail-textarea"
                  value={editedFirm.description || ''}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  rows={6}
                />
              ) : (
                <p className="firm-detail-description">{firm.description || 'No description available'}</p>
              )}
            </div>
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
                  ${(totals.totalInvested / 1000000).toFixed(2)}M
                </div>
              </div>
              <div className="capital-summary-card">
                <div className="capital-summary-label">Total Redeemed</div>
                <div className="capital-summary-value negative">
                  ${(totals.totalRedeemed / 1000000).toFixed(2)}M
                </div>
              </div>
              <div className="capital-summary-card">
                <div className="capital-summary-label">Net Invested</div>
                <div className="capital-summary-value">
                  ${(totals.netInvested / 1000000).toFixed(2)}M
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
                          <td>${(parseFloat(row.current_capital) / 1000000).toFixed(2)}M</td>
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
                              <td>${(parseFloat(row.capital) / 1000000).toFixed(2)}M</td>
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
                              <td>${(parseFloat(row.capital) / 1000000).toFixed(2)}M</td>
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
