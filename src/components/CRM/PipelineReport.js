import React, { useState, useEffect } from 'react'
import { Download, GripVertical, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import './PipelineReport.css'

const STATUS_ORDER = [
  '1 Investor',
  '2 Active Diligence',
  '3 Potential Investor in 6 Months',
  '4 High Focus',
  '5 Low Focus',
  '6 Dormant',
]

const PipelineReport = () => {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [draggedItem, setDraggedItem] = useState(null)
  const [expandedSections, setExpandedSections] = useState(
    Object.fromEntries(STATUS_ORDER.map(s => [s, true]))
  )

  useEffect(() => {
    loadPipelineData()
  }, [])

  const loadPipelineData = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select(`
          id, firm_name, status, status_summary, pm_meeting,
          investment_size_min, investment_size_max,
          city, state, country, high_quality, structure_issues
        `)
        .is('deleted_at', null)
        .order('firm_name', { ascending: true })

      if (error) throw error

      // Load custom order from report_row_orders
      const { data: orderData } = await supabase
        .from('report_row_orders')
        .select('account_id, display_order')
        .eq('report_name', 'pipeline')
        .order('display_order', { ascending: true })

      const orderMap = {}
      if (orderData) {
        orderData.forEach((item) => {
          orderMap[item.account_id] = item.display_order
        })
      }

      // Sort: by Status order first, then by custom order or firm_name within each status
      const sorted = (data || []).sort((a, b) => {
        const statusA = STATUS_ORDER.indexOf(a.status) === -1 ? 99 : STATUS_ORDER.indexOf(a.status)
        const statusB = STATUS_ORDER.indexOf(b.status) === -1 ? 99 : STATUS_ORDER.indexOf(b.status)
        if (statusA !== statusB) return statusA - statusB

        const orderA = orderMap[a.id] !== undefined ? orderMap[a.id] : 99999
        const orderB = orderMap[b.id] !== undefined ? orderMap[b.id] : 99999
        if (orderA !== orderB) return orderA - orderB

        return (a.firm_name || '').localeCompare(b.firm_name || '')
      })

      setAccounts(sorted)
    } catch (error) {
      console.error('Error loading pipeline:', error)
      alert('Failed to load pipeline data')
    } finally {
      setLoading(false)
    }
  }

  const groupByStatus = () => {
    const groups = {}
    STATUS_ORDER.forEach(s => { groups[s] = [] })
    groups['No Status'] = []

    accounts.forEach(account => {
      const status = account.status || 'No Status'
      if (groups[status]) {
        groups[status].push(account)
      } else {
        groups['No Status'].push(account)
      }
    })

    return groups
  }

  const handleDragStart = (e, account, globalIndex) => {
    setDraggedItem({ account, globalIndex })
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e, targetGlobalIndex) => {
    e.preventDefault()
    if (!draggedItem || draggedItem.globalIndex === targetGlobalIndex) {
      setDraggedItem(null)
      return
    }

    // Only allow reorder within same status
    const draggedStatus = draggedItem.account.status || 'No Status'
    const targetAccount = accounts[targetGlobalIndex]
    const targetStatus = targetAccount?.status || 'No Status'

    if (draggedStatus !== targetStatus) {
      setDraggedItem(null)
      return
    }

    const newAccounts = [...accounts]
    const [removed] = newAccounts.splice(draggedItem.globalIndex, 1)
    newAccounts.splice(targetGlobalIndex, 0, removed)
    setAccounts(newAccounts)

    // Save new order to database
    try {
      await supabase
        .from('report_row_orders')
        .delete()
        .eq('report_name', 'pipeline')

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
      loadPipelineData()
    }

    setDraggedItem(null)
  }

  const handleExportPDF = () => {
    alert('PDF export requires server-side rendering setup. This will generate a landscape PDF of the pipeline report.')
  }

  const toggleSection = (status) => {
    setExpandedSections(prev => ({
      ...prev,
      [status]: !prev[status],
    }))
  }

  const formatCurrency = (value) => {
    if (!value) return '-'
    return `$${(value / 1000000).toFixed(1)}M`
  }

  const formatLocation = (account) => {
    return [account.city, account.state, account.country].filter(Boolean).join(', ') || '-'
  }

  const statusGroups = groupByStatus()

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
            {accounts.length} firms — Grouped by Status. Drag to reorder within each status.
          </p>
        </div>
        <div className="pipeline-header-right">
          <button className="pipeline-export-btn" onClick={handleExportPDF}>
            <Download size={18} />
            Export PDF
          </button>
        </div>
      </div>

      {/* Pipeline by Status */}
      <div className="pipeline-content">
        {[...STATUS_ORDER, 'No Status'].map((status) => {
          const statusAccounts = statusGroups[status] || []
          if (statusAccounts.length === 0) return null
          const isExpanded = expandedSections[status] !== false

          return (
            <div key={status} className="pipeline-tier-section">
              <div className="pipeline-tier-header" onClick={() => toggleSection(status)}>
                <div className="pipeline-tier-header-left">
                  <h3>{status}</h3>
                  <span className="pipeline-tier-count">{statusAccounts.length} firms</span>
                </div>
                <button className="pipeline-tier-toggle">
                  {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
              </div>

              {isExpanded && (
                <div className="pipeline-tier-content">
                  <div className="pipeline-table">
                    <div className="pipeline-table-header">
                      <div className="pipeline-col-drag"></div>
                      <div className="pipeline-col-firm">Firm Name</div>
                      <div className="pipeline-col-pm">PM Mtg</div>
                      <div className="pipeline-col-summary">Status Summary</div>
                      <div className="pipeline-col-status">Status</div>
                      <div className="pipeline-col-inv-min">Inv Min</div>
                      <div className="pipeline-col-inv-max">Inv Max</div>
                      <div className="pipeline-col-location">Location</div>
                      <div className="pipeline-col-hq">HQ</div>
                      <div className="pipeline-col-issues">Structure Issues</div>
                    </div>
                    {statusAccounts.map((account) => {
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
                          </div>
                          <div className="pipeline-col-pm">{account.pm_meeting ? 'Yes' : ''}</div>
                          <div className="pipeline-col-summary">
                            {account.status_summary
                              ? (account.status_summary.length > 60
                                  ? account.status_summary.substring(0, 60) + '...'
                                  : account.status_summary)
                              : '-'}
                          </div>
                          <div className="pipeline-col-status">
                            <span className={`status-badge status-${account.status?.charAt(0) || ''}`}>
                              {account.status || '-'}
                            </span>
                          </div>
                          <div className="pipeline-col-inv-min">{formatCurrency(account.investment_size_min)}</div>
                          <div className="pipeline-col-inv-max">{formatCurrency(account.investment_size_max)}</div>
                          <div className="pipeline-col-location">{formatLocation(account)}</div>
                          <div className="pipeline-col-hq">
                            {account.high_quality ? <span className="pipeline-hq-yes">Yes</span> : ''}
                          </div>
                          <div className="pipeline-col-issues">
                            {account.structure_issues
                              ? (account.structure_issues.length > 40
                                  ? account.structure_issues.substring(0, 40) + '...'
                                  : account.structure_issues)
                              : '-'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {accounts.length === 0 && (
        <div className="pipeline-empty-state">
          <p>No firms found. Add firms to see them in the pipeline.</p>
        </div>
      )}
    </div>
  )
}

export default PipelineReport
