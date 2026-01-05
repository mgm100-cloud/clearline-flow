import React, { useState, useEffect } from 'react'
import { Download, GripVertical, ChevronDown, ChevronUp, Filter } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import './PipelineReport.css'

const PipelineReport = () => {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [draggedItem, setDraggedItem] = useState(null)
  const [filters, setFilters] = useState({
    tier: 'all',
    category: 'all',
    probability: 'all',
  })
  const [showFilters, setShowFilters] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    tier1: true,
    tier2: true,
    tier3: true,
  })

  useEffect(() => {
    loadPipelineData()
  }, [filters])

  const loadPipelineData = async () => {
    setLoading(true)
    try {
      // Build query
      let query = supabase
        .from('accounts')
        .select(`
          id,
          firm_name,
          type,
          tier,
          category,
          aum,
          investment_size,
          probability_of_investment,
          pm_meeting,
          focus_list,
          last_activity,
          created_at
        `)
        .is('deleted_at', null)
        .in('type', ['Prospect', 'Investor'])
        .order('tier', { ascending: true })

      // Apply filters
      if (filters.tier !== 'all') {
        query = query.eq('tier', filters.tier)
      }
      if (filters.category !== 'all') {
        query = query.eq('category', filters.category)
      }
      if (filters.probability !== 'all') {
        query = query.eq('probability_of_investment', filters.probability)
      }

      const { data, error } = await query

      if (error) throw error

      // Load custom order from report_row_orders
      const { data: orderData } = await supabase
        .from('report_row_orders')
        .select('account_id, display_order')
        .eq('report_name', 'pipeline')
        .order('display_order', { ascending: true })

      // Create order map
      const orderMap = {}
      if (orderData) {
        orderData.forEach((item, index) => {
          orderMap[item.account_id] = index
        })
      }

      // Sort by custom order if available, otherwise by tier
      const sorted = data.sort((a, b) => {
        const orderA = orderMap[a.id] !== undefined ? orderMap[a.id] : 9999
        const orderB = orderMap[b.id] !== undefined ? orderMap[b.id] : 9999
        if (orderA !== orderB) return orderA - orderB
        return (a.tier || 'Tier 3').localeCompare(b.tier || 'Tier 3')
      })

      setAccounts(sorted)
    } catch (error) {
      console.error('Error loading pipeline:', error)
      alert('Failed to load pipeline data')
    } finally {
      setLoading(false)
    }
  }

  const handleDragStart = (e, account, index) => {
    setDraggedItem({ account, index })
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e, targetIndex) => {
    e.preventDefault()
    
    if (!draggedItem || draggedItem.index === targetIndex) {
      setDraggedItem(null)
      return
    }

    // Reorder accounts
    const newAccounts = [...accounts]
    const [removed] = newAccounts.splice(draggedItem.index, 1)
    newAccounts.splice(targetIndex, 0, removed)
    setAccounts(newAccounts)

    // Save new order to database
    try {
      // Delete existing orders for this report
      await supabase
        .from('report_row_orders')
        .delete()
        .eq('report_name', 'pipeline')

      // Insert new orders
      const orderData = newAccounts.map((account, index) => ({
        report_name: 'pipeline',
        account_id: account.id,
        display_order: index,
      }))

      const { error } = await supabase
        .from('report_row_orders')
        .insert(orderData)

      if (error) throw error
    } catch (error) {
      console.error('Error saving order:', error)
      alert('Failed to save order')
      // Reload to get correct order
      loadPipelineData()
    }

    setDraggedItem(null)
  }

  const handleExportPDF = async () => {
    alert('PDF export requires Playwright setup on the server. This will generate a PDF of the current pipeline report.')
    // In production, this would call an Edge Function that uses Playwright
    // to render the report and generate a PDF
  }

  const toggleSection = (section) => {
    setExpandedSections({
      ...expandedSections,
      [section]: !expandedSections[section],
    })
  }

  const groupByTier = () => {
    const groups = {
      'Tier 1': [],
      'Tier 2': [],
      'Tier 3': [],
    }

    accounts.forEach(account => {
      const tier = account.tier || 'Tier 3'
      if (groups[tier]) {
        groups[tier].push(account)
      }
    })

    return groups
  }

  const formatCurrency = (value) => {
    if (!value) return 'N/A'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatDate = (date) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const tierGroups = groupByTier()

  if (loading) {
    return (
      <div className="pipeline-report">
        <div className="pipeline-loading">Loading pipeline...</div>
      </div>
    )
  }

  return (
    <div className="pipeline-report">
      {/* Header */}
      <div className="pipeline-header">
        <div className="pipeline-header-left">
          <h2>Pipeline Report</h2>
          <p className="pipeline-subtitle">
            {accounts.length} firms • Drag to reorder
          </p>
        </div>
        <div className="pipeline-header-right">
          <button
            className="pipeline-filter-btn"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={18} />
            Filters
          </button>
          <button className="pipeline-export-btn" onClick={handleExportPDF}>
            <Download size={18} />
            Export PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="pipeline-filters">
          <div className="pipeline-filter-group">
            <label>Tier:</label>
            <select
              value={filters.tier}
              onChange={(e) => setFilters({ ...filters, tier: e.target.value })}
            >
              <option value="all">All Tiers</option>
              <option value="Tier 1">Tier 1</option>
              <option value="Tier 2">Tier 2</option>
              <option value="Tier 3">Tier 3</option>
            </select>
          </div>
          <div className="pipeline-filter-group">
            <label>Category:</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="all">All Categories</option>
              <option value="Hedge Fund">Hedge Fund</option>
              <option value="Fund of Funds">Fund of Funds</option>
              <option value="Family Office">Family Office</option>
              <option value="Endowment">Endowment</option>
              <option value="Foundation">Foundation</option>
              <option value="Pension">Pension</option>
              <option value="Insurance">Insurance</option>
              <option value="Wealth Manager">Wealth Manager</option>
              <option value="Consultant">Consultant</option>
            </select>
          </div>
          <div className="pipeline-filter-group">
            <label>Probability:</label>
            <select
              value={filters.probability}
              onChange={(e) => setFilters({ ...filters, probability: e.target.value })}
            >
              <option value="all">All Probabilities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>
      )}

      {/* Pipeline by Tier */}
      <div className="pipeline-content">
        {Object.entries(tierGroups).map(([tier, tierAccounts]) => {
          const sectionKey = tier.toLowerCase().replace(' ', '')
          const isExpanded = expandedSections[sectionKey]

          return (
            <div key={tier} className="pipeline-tier-section">
              <div
                className="pipeline-tier-header"
                onClick={() => toggleSection(sectionKey)}
              >
                <div className="pipeline-tier-header-left">
                  <h3>{tier}</h3>
                  <span className="pipeline-tier-count">
                    {tierAccounts.length} firms
                  </span>
                </div>
                <button className="pipeline-tier-toggle">
                  {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
              </div>

              {isExpanded && (
                <div className="pipeline-tier-content">
                  {tierAccounts.length === 0 ? (
                    <div className="pipeline-empty">No firms in this tier</div>
                  ) : (
                    <div className="pipeline-table">
                      <div className="pipeline-table-header">
                        <div className="pipeline-col-drag"></div>
                        <div className="pipeline-col-firm">Firm Name</div>
                        <div className="pipeline-col-category">Category</div>
                        <div className="pipeline-col-aum">AUM</div>
                        <div className="pipeline-col-investment">Investment Size</div>
                        <div className="pipeline-col-probability">Probability</div>
                        <div className="pipeline-col-pm">PM Meeting</div>
                        <div className="pipeline-col-last-activity">Last Activity</div>
                      </div>
                      {tierAccounts.map((account, index) => {
                        const globalIndex = accounts.indexOf(account)
                        return (
                          <div
                            key={account.id}
                            className="pipeline-table-row"
                            draggable
                            onDragStart={(e) => handleDragStart(e, account, globalIndex)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, globalIndex)}
                          >
                            <div className="pipeline-col-drag">
                              <GripVertical size={16} className="pipeline-drag-handle" />
                            </div>
                            <div className="pipeline-col-firm">
                              <span className="pipeline-firm-name">{account.firm_name}</span>
                              {account.focus_list && (
                                <span className="pipeline-badge pipeline-badge-focus">Focus</span>
                              )}
                            </div>
                            <div className="pipeline-col-category">{account.category || 'N/A'}</div>
                            <div className="pipeline-col-aum">{formatCurrency(account.aum)}</div>
                            <div className="pipeline-col-investment">
                              {formatCurrency(account.investment_size)}
                            </div>
                            <div className="pipeline-col-probability">
                              {account.probability_of_investment ? (
                                <span className={`pipeline-badge pipeline-badge-${account.probability_of_investment.toLowerCase()}`}>
                                  {account.probability_of_investment}
                                </span>
                              ) : (
                                'N/A'
                              )}
                            </div>
                            <div className="pipeline-col-pm">
                              {account.pm_meeting ? 'Yes' : 'No'}
                            </div>
                            <div className="pipeline-col-last-activity">
                              {formatDate(account.last_activity)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {accounts.length === 0 && (
        <div className="pipeline-empty-state">
          <p>No firms match the current filters</p>
        </div>
      )}
    </div>
  )
}

export default PipelineReport

