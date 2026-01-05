import React, { useState, useEffect } from 'react'
import { X, Send, Users, Sparkles } from 'lucide-react'
import { sendEmail, sendBulkEmail, getContacts } from '../../services/crmService'
import './EmailCompose.css'

const EmailCompose = ({ 
  onClose, 
  accountId = null, 
  contactId = null, 
  distributionListId = null,
  prefilledTo = [] 
}) => {
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [recipients, setRecipients] = useState([])
  const [ccRecipients, setCcRecipients] = useState([])
  const [bccRecipients, setBccRecipients] = useState([])
  const [sending, setSending] = useState(false)
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [availableContacts, setAvailableContacts] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [currentField, setCurrentField] = useState('to') // 'to', 'cc', 'bcc'

  useEffect(() => {
    if (prefilledTo.length > 0) {
      setRecipients(prefilledTo)
    }
  }, [prefilledTo])

  const handleAddRecipient = (field) => {
    setCurrentField(field)
    setShowContactPicker(true)
    loadContacts()
  }

  const loadContacts = async () => {
    try {
      const { data } = await getContacts({ limit: 1000 })
      const contactsWithEmail = data.filter(c => c.email)
      setAvailableContacts(contactsWithEmail)
    } catch (error) {
      console.error('Error loading contacts:', error)
    }
  }

  const handleSelectContact = (contact) => {
    const recipient = {
      address: contact.email,
      name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
      contactId: contact.id,
    }

    if (currentField === 'to') {
      setRecipients([...recipients, recipient])
    } else if (currentField === 'cc') {
      setCcRecipients([...ccRecipients, recipient])
    } else if (currentField === 'bcc') {
      setBccRecipients([...bccRecipients, recipient])
    }
  }

  const handleRemoveRecipient = (field, index) => {
    if (field === 'to') {
      setRecipients(recipients.filter((_, i) => i !== index))
    } else if (field === 'cc') {
      setCcRecipients(ccRecipients.filter((_, i) => i !== index))
    } else if (field === 'bcc') {
      setBccRecipients(bccRecipients.filter((_, i) => i !== index))
    }
  }

  const handleSend = async () => {
    if (!subject.trim()) {
      alert('Please enter a subject')
      return
    }

    if (recipients.length === 0) {
      alert('Please add at least one recipient')
      return
    }

    if (!htmlBody.trim()) {
      alert('Please enter a message')
      return
    }

    setSending(true)
    try {
      const allRecipients = [
        ...recipients.map(r => ({ ...r, kind: 'to' })),
        ...ccRecipients.map(r => ({ ...r, kind: 'cc' })),
        ...bccRecipients.map(r => ({ ...r, kind: 'bcc' })),
      ]

      if (distributionListId) {
        // Send via Resend for bulk email
        await sendBulkEmail({
          subject,
          htmlBody,
          distributionListId,
          relatedAccountId: accountId,
        })
      } else {
        // Send via Microsoft Graph
        await sendEmail({
          subject,
          htmlBody,
          recipients: allRecipients,
          relatedAccountId: accountId,
          relatedContactId: contactId,
        })
      }

      alert('Email sent successfully!')
      onClose()
    } catch (error) {
      console.error('Error sending email:', error)
      alert('Failed to send email: ' + error.message)
    } finally {
      setSending(false)
    }
  }

  const handleAIAssist = () => {
    // Placeholder for OpenAI integration
    alert('AI email drafting coming soon! This will use OpenAI to help compose professional emails.')
  }

  const filteredContacts = availableContacts.filter(contact => {
    const searchLower = searchQuery.toLowerCase()
    return (
      contact.first_name?.toLowerCase().includes(searchLower) ||
      contact.last_name?.toLowerCase().includes(searchLower) ||
      contact.email?.toLowerCase().includes(searchLower)
    )
  })

  return (
    <div className="email-compose-overlay" onClick={onClose}>
      <div className="email-compose-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="email-compose-header">
          <h2>Compose Email</h2>
          <button className="email-compose-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="email-compose-content">
          {/* To Field */}
          <div className="email-compose-field">
            <label>To:</label>
            <div className="email-compose-recipients">
              {recipients.map((recipient, index) => (
                <div key={index} className="email-compose-recipient-chip">
                  <span>{recipient.name || recipient.address}</span>
                  <button onClick={() => handleRemoveRecipient('to', index)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button 
                className="email-compose-add-recipient"
                onClick={() => handleAddRecipient('to')}
              >
                + Add
              </button>
            </div>
          </div>

          {/* CC Field */}
          <div className="email-compose-field">
            <label>Cc:</label>
            <div className="email-compose-recipients">
              {ccRecipients.map((recipient, index) => (
                <div key={index} className="email-compose-recipient-chip">
                  <span>{recipient.name || recipient.address}</span>
                  <button onClick={() => handleRemoveRecipient('cc', index)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button 
                className="email-compose-add-recipient"
                onClick={() => handleAddRecipient('cc')}
              >
                + Add
              </button>
            </div>
          </div>

          {/* BCC Field */}
          <div className="email-compose-field">
            <label>Bcc:</label>
            <div className="email-compose-recipients">
              {bccRecipients.map((recipient, index) => (
                <div key={index} className="email-compose-recipient-chip">
                  <span>{recipient.name || recipient.address}</span>
                  <button onClick={() => handleRemoveRecipient('bcc', index)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button 
                className="email-compose-add-recipient"
                onClick={() => handleAddRecipient('bcc')}
              >
                + Add
              </button>
            </div>
          </div>

          {/* Subject Field */}
          <div className="email-compose-field">
            <label>Subject:</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject"
            />
          </div>

          {/* AI Assist Button */}
          <div className="email-compose-ai-section">
            <button className="email-compose-ai-btn" onClick={handleAIAssist}>
              <Sparkles size={16} />
              AI Draft Assistance
            </button>
          </div>

          {/* Message Field */}
          <div className="email-compose-field">
            <label>Message:</label>
            <textarea
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              placeholder="Compose your message..."
              rows={12}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="email-compose-footer">
          <button className="email-compose-cancel" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button className="email-compose-send" onClick={handleSend} disabled={sending}>
            <Send size={18} />
            {sending ? 'Sending...' : 'Send Email'}
          </button>
        </div>

        {/* Contact Picker Modal */}
        {showContactPicker && (
          <div className="email-contact-picker-overlay" onClick={() => setShowContactPicker(false)}>
            <div className="email-contact-picker" onClick={(e) => e.stopPropagation()}>
              <div className="email-contact-picker-header">
                <h3>Select Contact</h3>
                <button onClick={() => setShowContactPicker(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="email-contact-picker-content">
                <input
                  type="text"
                  className="email-contact-picker-search"
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="email-contact-picker-list">
                  {filteredContacts.length === 0 ? (
                    <div className="email-contact-picker-empty">No contacts found</div>
                  ) : (
                    filteredContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="email-contact-picker-item"
                        onClick={() => {
                          handleSelectContact(contact)
                          setShowContactPicker(false)
                          setSearchQuery('')
                        }}
                      >
                        <div className="email-contact-picker-item-info">
                          <div className="email-contact-picker-item-name">
                            {contact.first_name} {contact.last_name}
                          </div>
                          <div className="email-contact-picker-item-email">{contact.email}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default EmailCompose

