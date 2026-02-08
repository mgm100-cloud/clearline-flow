import React, { useState, useEffect } from 'react'
import { ArrowLeft, Edit2, Save, X, Mail, Building2 } from 'lucide-react'
import TasksTab from './TasksTab'
import { getContact, updateContact } from '../../services/crmService'
import './ContactDetail.css'

const ContactDetail = ({ contactId, onBack, onFirmClick }) => {
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editedContact, setEditedContact] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    loadContact()
  }, [contactId])

  const loadContact = async () => {
    setLoading(true)
    try {
      const data = await getContact(contactId)
      setContact(data)
      setEditedContact(data)
    } catch (error) {
      console.error('Error loading contact:', error)
      alert('Failed to load contact: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = () => {
    setEditing(true)
    setEditedContact({ ...contact })
  }

  const handleCancel = () => {
    setEditing(false)
    setEditedContact({ ...contact })
  }

  const handleSave = async () => {
    try {
      const updated = await updateContact(contactId, editedContact)
      setContact(updated)
      setEditing(false)
    } catch (error) {
      console.error('Error updating contact:', error)
      alert('Failed to update: ' + error.message)
    }
  }

  const handleFieldChange = (field, value) => {
    setEditedContact({ ...editedContact, [field]: value })
  }

  if (loading) {
    return (
      <div className="contact-detail-loading">
        <div className="data-grid-spinner" />
        <div>Loading contact details...</div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="contact-detail-error">
        <p>Contact not found</p>
        <button onClick={onBack}>Go Back</button>
      </div>
    )
  }

  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim()

  return (
    <div className="contact-detail">
      {/* Header */}
      <div className="contact-detail-header">
        <button className="contact-detail-back" onClick={onBack}>
          <ArrowLeft size={20} />
          Back to Contacts
        </button>
        <div className="contact-detail-actions">
          <button className="contact-detail-email-btn" onClick={() => alert('Email coming soon')}>
            <Mail size={18} />
            Send Email
          </button>
          {!editing ? (
            <button className="contact-detail-edit-btn" onClick={handleEdit}>
              <Edit2 size={18} />
              Edit
            </button>
          ) : (
            <>
              <button className="contact-detail-cancel-btn" onClick={handleCancel}>
                <X size={18} />
                Cancel
              </button>
              <button className="contact-detail-save-btn" onClick={handleSave}>
                <Save size={18} />
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {/* Contact Name */}
      <div className="contact-detail-title">
        <div className="contact-detail-name">
          {editing ? (
            <div className="contact-detail-name-inputs">
              <input
                type="text"
                className="contact-detail-name-input"
                placeholder="First Name"
                value={editedContact.first_name || ''}
                onChange={(e) => handleFieldChange('first_name', e.target.value)}
              />
              <input
                type="text"
                className="contact-detail-name-input"
                placeholder="Last Name"
                value={editedContact.last_name || ''}
                onChange={(e) => handleFieldChange('last_name', e.target.value)}
              />
            </div>
          ) : (
            <h1>{fullName || 'Unnamed Contact'}</h1>
          )}
        </div>
        {contact.accounts && (
          <button
            className="contact-detail-firm-link"
            onClick={() => onFirmClick && onFirmClick(contact.account_id)}
          >
            <Building2 size={16} />
            {contact.accounts.firm_name}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="contact-detail-tabs">
        <button
          className={`contact-detail-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`contact-detail-tab ${activeTab === 'interactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('interactions')}
        >
          Interactions
        </button>
      </div>

      {/* Content */}
      <div className="contact-detail-content">
        {activeTab === 'overview' && (
          <div className="contact-detail-overview">
            <div className="contact-detail-section">
              <h3>Contact Information</h3>
              <div className="contact-detail-fields">
                <div className="contact-detail-field">
                  <label>Salutation</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedContact.salutation || ''}
                      onChange={(e) => handleFieldChange('salutation', e.target.value)}
                    />
                  ) : (
                    <span>{contact.salutation || '-'}</span>
                  )}
                </div>
                <div className="contact-detail-field">
                  <label>Title</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedContact.title || ''}
                      onChange={(e) => handleFieldChange('title', e.target.value)}
                    />
                  ) : (
                    <span>{contact.title || '-'}</span>
                  )}
                </div>
                <div className="contact-detail-field">
                  <label>Email</label>
                  {editing ? (
                    <input
                      type="email"
                      value={editedContact.email || ''}
                      onChange={(e) => handleFieldChange('email', e.target.value)}
                    />
                  ) : (
                    <span>
                      {contact.email ? (
                        <a href={`mailto:${contact.email}`}>{contact.email}</a>
                      ) : (
                        '-'
                      )}
                    </span>
                  )}
                </div>
                <div className="contact-detail-field">
                  <label>Phone</label>
                  {editing ? (
                    <input
                      type="tel"
                      value={editedContact.phone || ''}
                      onChange={(e) => handleFieldChange('phone', e.target.value)}
                    />
                  ) : (
                    <span>{contact.phone || '-'}</span>
                  )}
                </div>
                <div className="contact-detail-field">
                  <label>Mobile Phone</label>
                  {editing ? (
                    <input
                      type="tel"
                      value={editedContact.mobile_phone || ''}
                      onChange={(e) => handleFieldChange('mobile_phone', e.target.value)}
                    />
                  ) : (
                    <span>{contact.mobile_phone || '-'}</span>
                  )}
                </div>
                <div className="contact-detail-field">
                  <label>Lead Source</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedContact.lead_source || ''}
                      onChange={(e) => handleFieldChange('lead_source', e.target.value)}
                    />
                  ) : (
                    <span>{contact.lead_source || '-'}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="contact-detail-section">
              <h3>Mailing Address</h3>
              <div className="contact-detail-fields">
                <div className="contact-detail-field full-width">
                  <label>Street</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedContact.mailing_street || ''}
                      onChange={(e) => handleFieldChange('mailing_street', e.target.value)}
                    />
                  ) : (
                    <span>{contact.mailing_street || '-'}</span>
                  )}
                </div>
                <div className="contact-detail-field">
                  <label>City</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedContact.mailing_city || ''}
                      onChange={(e) => handleFieldChange('mailing_city', e.target.value)}
                    />
                  ) : (
                    <span>{contact.mailing_city || '-'}</span>
                  )}
                </div>
                <div className="contact-detail-field">
                  <label>State</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedContact.mailing_state || ''}
                      onChange={(e) => handleFieldChange('mailing_state', e.target.value)}
                    />
                  ) : (
                    <span>{contact.mailing_state || '-'}</span>
                  )}
                </div>
                <div className="contact-detail-field">
                  <label>Postal Code</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedContact.mailing_postal_code || ''}
                      onChange={(e) => handleFieldChange('mailing_postal_code', e.target.value)}
                    />
                  ) : (
                    <span>{contact.mailing_postal_code || '-'}</span>
                  )}
                </div>
                <div className="contact-detail-field">
                  <label>Country</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedContact.mailing_country || ''}
                      onChange={(e) => handleFieldChange('mailing_country', e.target.value)}
                    />
                  ) : (
                    <span>{contact.mailing_country || '-'}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="contact-detail-section">
              <h3>Assistant Information</h3>
              <div className="contact-detail-fields">
                <div className="contact-detail-field">
                  <label>Assistant Name</label>
                  {editing ? (
                    <input
                      type="text"
                      value={editedContact.assistant_name || ''}
                      onChange={(e) => handleFieldChange('assistant_name', e.target.value)}
                    />
                  ) : (
                    <span>{contact.assistant_name || '-'}</span>
                  )}
                </div>
                <div className="contact-detail-field">
                  <label>Assistant Phone</label>
                  {editing ? (
                    <input
                      type="tel"
                      value={editedContact.assistant_phone || ''}
                      onChange={(e) => handleFieldChange('assistant_phone', e.target.value)}
                    />
                  ) : (
                    <span>{contact.assistant_phone || '-'}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="contact-detail-section">
              <h3>Clearline Information</h3>
              <div className="contact-detail-fields">
                <div className="contact-detail-field">
                  <label>Which Fund</label>
                  {editing ? (
                    <select
                      value={editedContact.which_fund || ''}
                      onChange={(e) => handleFieldChange('which_fund', e.target.value)}
                    >
                      <option value="">Select...</option>
                      <option value="Onshore">Onshore</option>
                      <option value="Offshore">Offshore</option>
                      <option value="TBD">TBD</option>
                    </select>
                  ) : (
                    <span>{contact.which_fund || '-'}</span>
                  )}
                </div>
                <div className="contact-detail-field">
                  <label>Key Contact</label>
                  {editing ? (
                    <input
                      type="checkbox"
                      checked={editedContact.main_contact || false}
                      onChange={(e) => handleFieldChange('main_contact', e.target.checked)}
                    />
                  ) : (
                    <span>{contact.main_contact ? 'Yes' : 'No'}</span>
                  )}
                </div>
                <div className="contact-detail-field">
                  <label>Distribution List</label>
                  {editing ? (
                    <input
                      type="checkbox"
                      checked={editedContact.distribution_list || false}
                      onChange={(e) => handleFieldChange('distribution_list', e.target.checked)}
                    />
                  ) : (
                    <span>{contact.distribution_list ? 'Yes' : 'No'}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="contact-detail-section">
              <h3>Description</h3>
              {editing ? (
                <textarea
                  className="contact-detail-textarea"
                  value={editedContact.description || ''}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  rows={4}
                />
              ) : (
                <p className="contact-detail-description">{contact.description || 'No description available'}</p>
              )}
            </div>

            <div className="contact-detail-section">
              <h3>Dates</h3>
              <div className="contact-detail-fields">
                <div className="contact-detail-field">
                  <label>Created Date</label>
                  <span>{contact.created_date ? new Date(contact.created_date).toLocaleDateString() : '-'}</span>
                </div>
                <div className="contact-detail-field">
                  <label>Updated Date</label>
                  <span>{contact.updated_date ? new Date(contact.updated_date).toLocaleDateString() : '-'}</span>
                </div>
                <div className="contact-detail-field">
                  <label>Last Activity</label>
                  <span>{contact.last_activity ? new Date(contact.last_activity).toLocaleDateString() : '-'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'interactions' && <TasksTab contactId={contactId} />}
      </div>
    </div>
  )
}

export default ContactDetail

