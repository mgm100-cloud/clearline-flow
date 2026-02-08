import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import CRMLayout from './CRMLayout'
import FirmsTab from './FirmsTab'
import ContactsTab from './ContactsTab'
import TasksTab from './TasksTab'
import FirmDetail from './FirmDetail'
import ContactDetail from './ContactDetail'
import DistributionLists from './DistributionLists'
import PipelineReport from './PipelineReport'
import ActiveDiligenceReport from './ActiveDiligenceReport'
import ProspectReport from './ProspectReport'
import './CRM.css'

const CRM = () => {
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('firms')
  const [selectedFirmId, setSelectedFirmId] = useState(null)
  const [selectedContactId, setSelectedContactId] = useState(null)

  useEffect(() => {
    checkAccess()
  }, [])

  const checkAccess = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setHasAccess(false)
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('division')
        .eq('id', user.id)
        .single()

      if (profile && (profile.division === 'Marketing' || profile.division === 'Super')) {
        setHasAccess(true)
      } else {
        setHasAccess(false)
      }
    } catch (error) {
      console.error('Error checking access:', error)
      setHasAccess(false)
    } finally {
      setLoading(false)
    }
  }

  const handleTabChange = (tab, id = null) => {
    if (tab === 'firm-detail') {
      setSelectedFirmId(id)
      setActiveTab('firm-detail')
    } else if (tab === 'contact-detail') {
      setSelectedContactId(id)
      setActiveTab('contact-detail')
    } else {
      setActiveTab(tab)
      setSelectedFirmId(null)
      setSelectedContactId(null)
    }
  }

  const handleFirmClick = (firmId) => {
    setSelectedFirmId(firmId)
    setActiveTab('firm-detail')
  }

  const handleContactClick = (contactId) => {
    setSelectedContactId(contactId)
    setActiveTab('contact-detail')
  }

  const handleBackToFirms = () => {
    setSelectedFirmId(null)
    setActiveTab('firms')
  }

  const handleBackToContacts = () => {
    setSelectedContactId(null)
    setActiveTab('contacts')
  }

  if (loading) {
    return (
      <div className="crm-loading">
        <div className="data-grid-spinner" />
        <div>Loading CRM...</div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="crm-no-access">
        <h2>Access Denied</h2>
        <p>You do not have permission to access the CRM.</p>
        <p>CRM access is restricted to Marketing and Super divisions.</p>
      </div>
    )
  }

  return (
    <CRMLayout activeTab={activeTab} onTabChange={handleTabChange}>
      {activeTab === 'firms' && <FirmsTab onFirmClick={handleFirmClick} />}
      
      {activeTab === 'contacts' && <ContactsTab onContactClick={handleContactClick} />}
      
      {activeTab === 'notes' && <TasksTab />}
      
      {activeTab === 'firm-detail' && selectedFirmId && (
        <FirmDetail
          firmId={selectedFirmId}
          onBack={handleBackToFirms}
          onContactClick={handleContactClick}
        />
      )}
      
      {activeTab === 'contact-detail' && selectedContactId && (
        <ContactDetail
          contactId={selectedContactId}
          onBack={handleBackToContacts}
          onFirmClick={handleFirmClick}
        />
      )}
      
      {activeTab === 'pipeline' && <PipelineReport />}
      
      {activeTab === 'active-diligence' && <ActiveDiligenceReport />}
      
      {activeTab === 'active-hot-pipeline' && (
        <ProspectReport
          title="Active Hot Pipeline Report"
          description='Firms with status "2 Active Diligence" or "3 Potential Investor in 6 Months"'
          statuses={['2 Active Diligence', '3 Potential Investor in 6 Months']}
          contactedLabel="Contacted This Month?"
          contactedDays={30}
        />
      )}
      
      {activeTab === 'active-pipeline' && (
        <ProspectReport
          title="Active Pipeline Report"
          description='Firms with status 2, 3, 4, or 5'
          statuses={[
            '2 Active Diligence',
            '3 Potential Investor in 6 Months',
            '4 High Focus',
            '5 Low Focus',
          ]}
          contactedLabel="Contacted This Quarter?"
          contactedDays={90}
        />
      )}
      
      {activeTab === 'full-prospect' && (
        <ProspectReport
          title="Full Prospect Report"
          description='All firms except "1 Investor"'
          excludeStatuses={['1 Investor']}
          contactedLabel="Contacted This Year?"
          contactedDays={360}
        />
      )}
      
      {activeTab === 'distribution' && <DistributionLists />}
    </CRMLayout>
  )
}

export default CRM
