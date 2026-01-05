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
      const updated = await updateAccount(firmId, editedFirm)
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
          <button className="firm-detail-email-btn" onClick={() => alert('Email coming soon')}>
            <Mail size={18} />
            Send Email
          </button>
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
        <button
          className={`firm-detail-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`firm-detail-tab ${activeTab === 'contacts' ? 'active' : ''}`}
          onClick={() => setActiveTab('contacts')}
        >
          Contacts
        </button>
        <button
          className={`firm-detail-tab ${activeTab === 'interactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('interactions')}
        >
          Interactions
        </button>
        <button
          className={`firm-detail-tab ${activeTab === 'capital' ? 'active' : ''}`}
          onClick={() => setActiveTab('capital')}
        >
          Client Capital
        </button>
      </div>

      {/* Content */}
      <div className="firm-detail-content">
        {activeTab === 'overview' && (
          <div className="firm-detail-overview">
            <div className="firm-detail-section">
              <h3>Basic Information</h3>
              <div className="firm-detail-fields">
                <div className="firm-detail-field">
                  <label>Type</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedFirm.type || ''}
                      onChange={(e) => handleFieldChange('type', e.target.value)}
                    />
                  ) : (
                    <span>{firm.type || '-'}</span>
                  )}
                </div>
                <div className="firm-detail-field">
                  <label>Website</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedFirm.website || ''}
                      onChange={(e) => handleFieldChange('website', e.target.value)}
                    />
                  ) : (
                    <span>
                      {firm.website ? (
                        <a href={firm.website} target="_blank" rel="noopener noreferrer">
                          {firm.website}
                        </a>
                      ) : (
                        '-'
                      )}
                    </span>
                  )}
                </div>
                <div className="firm-detail-field">
                  <label>Phone</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedFirm.phone_number || ''}
                      onChange={(e) => handleFieldChange('phone_number', e.target.value)}
                    />
                  ) : (
                    <span>{firm.phone_number || '-'}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="firm-detail-section">
              <h3>Address</h3>
              <div className="firm-detail-fields">
                <div className="firm-detail-field full-width">
                  <label>Street</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedFirm.address || ''}
                      onChange={(e) => handleFieldChange('address', e.target.value)}
                    />
                  ) : (
                    <span>{firm.address || '-'}</span>
                  )}
                </div>
                <div className="firm-detail-field">
                  <label>City</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedFirm.city || ''}
                      onChange={(e) => handleFieldChange('city', e.target.value)}
                    />
                  ) : (
                    <span>{firm.city || '-'}</span>
                  )}
                </div>
                <div className="firm-detail-field">
                  <label>State</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedFirm.state || ''}
                      onChange={(e) => handleFieldChange('state', e.target.value)}
                    />
                  ) : (
                    <span>{firm.state || '-'}</span>
                  )}
                </div>
                <div className="firm-detail-field">
                  <label>Country</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedFirm.country || ''}
                      onChange={(e) => handleFieldChange('country', e.target.value)}
                    />
                  ) : (
                    <span>{firm.country || '-'}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="firm-detail-section">
              <h3>Investment Information</h3>
              <div className="firm-detail-fields">
                <div className="firm-detail-field">
                  <label>AUM</label>
                  {editing ? (
                    <input
                      type="number"
                      value={editedFirm.aum || ''}
                      onChange={(e) => handleFieldChange('aum', e.target.value)}
                    />
                  ) : (
                    <span>{firm.aum ? `$${(firm.aum / 1000000).toFixed(1)}M` : '-'}</span>
                  )}
                </div>
                <div className="firm-detail-field">
                  <label>Investment Size (Min)</label>
                  {editing ? (
                    <input
                      type="number"
                      value={editedFirm.investment_size_min || ''}
                      onChange={(e) => handleFieldChange('investment_size_min', e.target.value)}
                    />
                  ) : (
                    <span>
                      {firm.investment_size_min
                        ? `$${(firm.investment_size_min / 1000000).toFixed(1)}M`
                        : '-'}
                    </span>
                  )}
                </div>
                <div className="firm-detail-field">
                  <label>Investment Size (Max)</label>
                  {editing ? (
                    <input
                      type="number"
                      value={editedFirm.investment_size_max || ''}
                      onChange={(e) => handleFieldChange('investment_size_max', e.target.value)}
                    />
                  ) : (
                    <span>
                      {firm.investment_size_max
                        ? `$${(firm.investment_size_max / 1000000).toFixed(1)}M`
                        : '-'}
                    </span>
                  )}
                </div>
                <div className="firm-detail-field">
                  <label>HF Investments</label>
                  {editing ? (
                    <input
                      type="number"
                      value={editedFirm.hf_investments || ''}
                      onChange={(e) => handleFieldChange('hf_investments', e.target.value)}
                    />
                  ) : (
                    <span>{firm.hf_investments || '-'}</span>
                  )}
                </div>
              </div>
            </div>

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

            {capitalData.length > 0 && (
              <div className="firm-detail-capital-chart">
                <h3>Monthly Capital</h3>
                <div className="capital-chart-placeholder">
                  <p>Chart visualization coming soon</p>
                  <p className="capital-chart-note">
                    Will display monthly capital balances with S&P 500 benchmark comparison
                  </p>
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

