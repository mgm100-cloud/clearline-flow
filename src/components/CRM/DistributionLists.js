import React, { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Users, Mail } from 'lucide-react'
import {
  getDistributionLists,
  getDistributionList,
  createDistributionList,
  updateDistributionList,
  deleteDistributionList,
  addContactToList,
  removeContactFromList,
  getContacts,
} from '../../services/crmService'
import './DistributionLists.css'

const DistributionLists = () => {
  const [lists, setLists] = useState([])
  const [selectedList, setSelectedList] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAddContactsModal, setShowAddContactsModal] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [availableContacts, setAvailableContacts] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadLists()
  }, [])

  const loadLists = async () => {
    setLoading(true)
    try {
      const data = await getDistributionLists()
      setLists(data)
    } catch (error) {
      console.error('Error loading lists:', error)
      alert('Failed to load distribution lists: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectList = async (listId) => {
    try {
      const data = await getDistributionList(listId)
      setSelectedList(data)
    } catch (error) {
      console.error('Error loading list details:', error)
      alert('Failed to load list details: ' + error.message)
    }
  }

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      alert('Please enter a list name')
      return
    }

    try {
      await createDistributionList({
        name: newListName,
        description: newListDescription,
      })
      setNewListName('')
      setNewListDescription('')
      setShowCreateModal(false)
      await loadLists()
    } catch (error) {
      console.error('Error creating list:', error)
      alert('Failed to create list: ' + error.message)
    }
  }

  const handleDeleteList = async (listId) => {
    if (!window.confirm('Are you sure you want to delete this distribution list?')) {
      return
    }

    try {
      await deleteDistributionList(listId)
      if (selectedList?.id === listId) {
        setSelectedList(null)
      }
      await loadLists()
    } catch (error) {
      console.error('Error deleting list:', error)
      alert('Failed to delete list: ' + error.message)
    }
  }

  const handleShowAddContacts = async () => {
    try {
      const { data } = await getContacts({ limit: 1000 })
      // Filter out contacts already in the list
      const existingContactIds = new Set(
        selectedList.distribution_list_members?.map((m) => m.contact_id) || []
      )
      const available = data.filter((c) => !existingContactIds.has(c.id) && c.email)
      setAvailableContacts(available)
      setShowAddContactsModal(true)
    } catch (error) {
      console.error('Error loading contacts:', error)
      alert('Failed to load contacts: ' + error.message)
    }
  }

  const handleAddContact = async (contactId) => {
    try {
      await addContactToList(selectedList.id, contactId)
      await handleSelectList(selectedList.id)
      // Remove from available contacts
      setAvailableContacts(availableContacts.filter((c) => c.id !== contactId))
    } catch (error) {
      console.error('Error adding contact:', error)
      alert('Failed to add contact: ' + error.message)
    }
  }

  const handleRemoveContact = async (contactId) => {
    try {
      await removeContactFromList(selectedList.id, contactId)
      await handleSelectList(selectedList.id)
    } catch (error) {
      console.error('Error removing contact:', error)
      alert('Failed to remove contact: ' + error.message)
    }
  }

  const filteredContacts = availableContacts.filter((contact) => {
    const searchLower = searchQuery.toLowerCase()
    return (
      contact.first_name?.toLowerCase().includes(searchLower) ||
      contact.last_name?.toLowerCase().includes(searchLower) ||
      contact.email?.toLowerCase().includes(searchLower)
    )
  })

  return (
    <div className="distribution-lists">
      <div className="distribution-lists-header">
        <h2>Distribution Lists</h2>
        <button className="distribution-lists-create-btn" onClick={() => setShowCreateModal(true)}>
          <Plus size={18} />
          Create List
        </button>
      </div>

      <div className="distribution-lists-content">
        {/* Lists Sidebar */}
        <div className="distribution-lists-sidebar">
          {loading ? (
            <div className="distribution-lists-loading">
              <div className="data-grid-spinner" />
              <div>Loading...</div>
            </div>
          ) : lists.length === 0 ? (
            <div className="distribution-lists-empty">
              <Users size={48} />
              <p>No distribution lists yet</p>
              <button onClick={() => setShowCreateModal(true)}>Create your first list</button>
            </div>
          ) : (
            <div className="distribution-lists-list">
              {lists.map((list) => (
                <div
                  key={list.id}
                  className={`distribution-list-item ${selectedList?.id === list.id ? 'active' : ''}`}
                  onClick={() => handleSelectList(list.id)}
                >
                  <div className="distribution-list-item-content">
                    <div className="distribution-list-item-name">{list.name}</div>
                    <div className="distribution-list-item-count">
                      {list.distribution_list_members?.[0]?.count || 0} contacts
                    </div>
                  </div>
                  <button
                    className="distribution-list-item-delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteList(list.id)
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* List Details */}
        <div className="distribution-lists-details">
          {selectedList ? (
            <>
              <div className="distribution-list-details-header">
                <div>
                  <h3>{selectedList.name}</h3>
                  {selectedList.description && <p>{selectedList.description}</p>}
                </div>
                <button className="distribution-list-add-contacts-btn" onClick={handleShowAddContacts}>
                  <Plus size={18} />
                  Add Contacts
                </button>
              </div>

              <div className="distribution-list-contacts">
                {selectedList.distribution_list_members?.length === 0 ? (
                  <div className="distribution-list-contacts-empty">
                    <Mail size={48} />
                    <p>No contacts in this list</p>
                    <button onClick={handleShowAddContacts}>Add contacts</button>
                  </div>
                ) : (
                  <div className="distribution-list-contacts-grid">
                    {selectedList.distribution_list_members?.map((member) => (
                      <div key={member.id} className="distribution-list-contact-card">
                        <div className="distribution-list-contact-info">
                          <div className="distribution-list-contact-name">
                            {member.contacts.first_name} {member.contacts.last_name}
                          </div>
                          <div className="distribution-list-contact-email">{member.contacts.email}</div>
                          {member.contacts.accounts && (
                            <div className="distribution-list-contact-firm">
                              {member.contacts.accounts.firm_name}
                            </div>
                          )}
                        </div>
                        <button
                          className="distribution-list-contact-remove"
                          onClick={() => handleRemoveContact(member.contact_id)}
                          title="Remove from list"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="distribution-list-details-empty">
              <Users size={64} />
              <p>Select a distribution list to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Create List Modal */}
      {showCreateModal && (
        <div className="distribution-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="distribution-modal" onClick={(e) => e.stopPropagation()}>
            <div className="distribution-modal-header">
              <h3>Create Distribution List</h3>
            </div>
            <div className="distribution-modal-content">
              <div className="distribution-modal-field">
                <label>List Name *</label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g., Q4 Investors"
                />
              </div>
              <div className="distribution-modal-field">
                <label>Description</label>
                <textarea
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  rows={3}
                  placeholder="Optional description"
                />
              </div>
            </div>
            <div className="distribution-modal-footer">
              <button onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button onClick={handleCreateList}>Create List</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Contacts Modal */}
      {showAddContactsModal && (
        <div className="distribution-modal-overlay" onClick={() => setShowAddContactsModal(false)}>
          <div className="distribution-modal large" onClick={(e) => e.stopPropagation()}>
            <div className="distribution-modal-header">
              <h3>Add Contacts to {selectedList?.name}</h3>
            </div>
            <div className="distribution-modal-content">
              <input
                type="text"
                className="distribution-modal-search"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="distribution-modal-contacts-list">
                {filteredContacts.length === 0 ? (
                  <div className="distribution-modal-empty">No contacts available</div>
                ) : (
                  filteredContacts.map((contact) => (
                    <div key={contact.id} className="distribution-modal-contact-item">
                      <div className="distribution-modal-contact-info">
                        <div className="distribution-modal-contact-name">
                          {contact.first_name} {contact.last_name}
                        </div>
                        <div className="distribution-modal-contact-email">{contact.email}</div>
                      </div>
                      <button onClick={() => handleAddContact(contact.id)}>
                        <Plus size={16} />
                        Add
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="distribution-modal-footer">
              <button onClick={() => setShowAddContactsModal(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DistributionLists

