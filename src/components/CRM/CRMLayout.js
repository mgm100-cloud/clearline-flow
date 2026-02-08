import React, { useState, useEffect } from 'react'
import { Search, Building2, Users, FileText, Mail, BarChart3, TrendingUp, ClipboardList, UserCheck } from 'lucide-react'
import { globalSearch } from '../../services/crmService'
import './CRMLayout.css'

const CRMLayout = ({ children, activeTab, onTabChange }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchQuery.length >= 2) {
        performSearch()
      } else {
        setSearchResults(null)
        setShowResults(false)
      }
    }, 300)

    return () => clearTimeout(delayDebounce)
  }, [searchQuery])

  const performSearch = async () => {
    setIsSearching(true)
    try {
      const results = await globalSearch(searchQuery)
      setSearchResults(results)
      setShowResults(true)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsSearching(false)
    }
  }

  const handleResultClick = (result) => {
    if (result.type === 'account') {
      onTabChange('firm-detail', result.id)
    } else if (result.type === 'contact') {
      onTabChange('contact-detail', result.id)
    }
    setShowResults(false)
    setSearchQuery('')
  }

  const tabs = [
    { id: 'firms', label: 'Firms', icon: Building2 },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'notes', label: 'Notes', icon: FileText },
    { id: 'pipeline', label: 'Pipeline', icon: BarChart3 },
    { id: 'active-diligence', label: 'Active Diligence', icon: UserCheck },
    { id: 'active-hot-pipeline', label: 'Hot Pipeline', icon: TrendingUp },
    { id: 'active-pipeline', label: 'Active Pipeline', icon: ClipboardList },
    { id: 'full-prospect', label: 'Full Prospect', icon: Users },
    { id: 'distribution', label: 'Distribution', icon: Mail },
  ]

  return (
    <div className="crm-layout">
      {/* Top Ribbon */}
      <div className="crm-ribbon">
        <div className="crm-ribbon-left">
          <h1 className="crm-title">Clearline CRM</h1>
          
          {/* Global Search */}
          <div className="crm-search-container">
            <Search className="crm-search-icon" size={20} />
            <input
              type="text"
              className="crm-search-input"
              placeholder="Search firms, contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
            />
            {isSearching && <div className="crm-search-spinner" />}
            
            {/* Search Results Dropdown */}
            {showResults && searchResults && (
              <div className="crm-search-results">
                {searchResults.accounts && searchResults.accounts.length > 0 && (
                  <div className="crm-search-section">
                    <div className="crm-search-section-title">Firms</div>
                    {searchResults.accounts.map((result) => (
                      <div
                        key={result.id}
                        className="crm-search-result"
                        onMouseDown={() => handleResultClick(result)}
                      >
                        <Building2 size={16} />
                        <div className="crm-search-result-content">
                          <div className="crm-search-result-title">{result.title}</div>
                          {result.subtitle && (
                            <div className="crm-search-result-subtitle">{result.subtitle}</div>
                          )}
                        </div>
                        {result.metadata && (
                          <div className="crm-search-result-meta">{result.metadata}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {searchResults.contacts && searchResults.contacts.length > 0 && (
                  <div className="crm-search-section">
                    <div className="crm-search-section-title">Contacts</div>
                    {searchResults.contacts.map((result) => (
                      <div
                        key={result.id}
                        className="crm-search-result"
                        onMouseDown={() => handleResultClick(result)}
                      >
                        <Users size={16} />
                        <div className="crm-search-result-content">
                          <div className="crm-search-result-title">{result.title}</div>
                          {result.subtitle && (
                            <div className="crm-search-result-subtitle">{result.subtitle}</div>
                          )}
                        </div>
                        {result.metadata && (
                          <div className="crm-search-result-meta">{result.metadata}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {(!searchResults.accounts || searchResults.accounts.length === 0) &&
                  (!searchResults.contacts || searchResults.contacts.length === 0) && (
                    <div className="crm-search-no-results">No results found</div>
                  )}
              </div>
            )}
          </div>
        </div>
        
        {/* Tabs */}
        <div className="crm-tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                className={`crm-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => onTabChange(tab.id)}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>
      
      {/* Content Area */}
      <div className="crm-content">
        {children}
      </div>
    </div>
  )
}

export default CRMLayout
