import React, { useState, useEffect } from 'react'
import { Download, Calendar, CheckCircle } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import './ActiveDiligenceReport.css'

const ActiveDiligenceReport = () => {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(null)
  const [weekEnd, setWeekEnd] = useState(null)

  useEffect(() => {
    // Calculate current week (Monday to Sunday)
    const today = new Date()
    const dayOfWeek = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    monday.setHours(0, 0, 0, 0)

    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    setWeekStart(monday)
    setWeekEnd(sunday)

    loadActiveDiligenceData(monday, sunday)
  }, [])

  const loadActiveDiligenceData = async (start, end) => {
    setLoading(true)
    try {
      // Get all accounts that are in active diligence (Tier 1 or Tier 2, Prospect or Investor)
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select(`
          id,
          firm_name,
          tier,
          type,
          category,
          aum,
          investment_size,
          probability_of_investment,
          pm_meeting,
          focus_list,
          last_activity
        `)
        .is('deleted_at', null)
        .in('tier', ['Tier 1', 'Tier 2'])
        .in('type', ['Prospect', 'Investor'])
        .order('tier', { ascending: true })
        .order('firm_name', { ascending: true })

      if (accountsError) throw accountsError

      // For each account, check if there was contact this week
      const accountsWithContactStatus = await Promise.all(
        accountsData.map(async (account) => {
          // Check for tasks/interactions this week
          const { data: tasksData, error: tasksError } = await supabase
            .from('tasks')
            .select('id, subject, due_date, status, type')
            .eq('related_account_id', account.id)
            .is('deleted_at', null)
            .gte('due_date', start.toISOString())
            .lte('due_date', end.toISOString())

          // Check for emails sent this week
          const { data: emailsData, error: emailsError } = await supabase
            .from('email_outbound')
            .select('id, subject, sent_at')
            .eq('related_account_id', account.id)
            .gte('sent_at', start.toISOString())
            .lte('sent_at', end.toISOString())

          const contactedThisWeek = (tasksData && tasksData.length > 0) || (emailsData && emailsData.length > 0)
          const interactions = [
            ...(tasksData || []).map(t => ({ type: 'task', ...t })),
            ...(emailsData || []).map(e => ({ type: 'email', ...e })),
          ]

          return {
            ...account,
            contactedThisWeek,
            interactions,
            interactionCount: interactions.length,
          }
        })
      )

      setAccounts(accountsWithContactStatus)
    } catch (error) {
      console.error('Error loading active diligence data:', error)
      alert('Failed to load active diligence data')
    } finally {
      setLoading(false)
    }
  }

  const handleExportPDF = async () => {
    alert('PDF export will generate a formatted report of this week\'s active diligence. This requires Playwright setup on the server.')
    // In production, this would call an Edge Function
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
    if (!date) return ''
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const contactedCount = accounts.filter(a => a.contactedThisWeek).length
  const notContactedCount = accounts.length - contactedCount
  const contactRate = accounts.length > 0 ? ((contactedCount / accounts.length) * 100).toFixed(0) : 0

  if (loading) {
    return (
      <div className="active-diligence-report">
        <div className="active-diligence-loading">Loading active diligence...</div>
      </div>
    )
  }

  return (
    <div className="active-diligence-report">
      {/* Header */}
      <div className="active-diligence-header">
        <div className="active-diligence-header-left">
          <h2>Active Diligence Report</h2>
          <p className="active-diligence-subtitle">
            <Calendar size={16} />
            Week of {weekStart && formatDate(weekStart)} - {weekEnd && formatDate(weekEnd)}
          </p>
        </div>
        <div className="active-diligence-header-right">
          <button className="active-diligence-export-btn" onClick={handleExportPDF}>
            <Download size={18} />
            Export PDF
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="active-diligence-stats">
        <div className="active-diligence-stat-card">
          <div className="active-diligence-stat-value">{accounts.length}</div>
          <div className="active-diligence-stat-label">Total Firms</div>
        </div>
        <div className="active-diligence-stat-card active-diligence-stat-success">
          <div className="active-diligence-stat-value">{contactedCount}</div>
          <div className="active-diligence-stat-label">Contacted This Week</div>
        </div>
        <div className="active-diligence-stat-card active-diligence-stat-warning">
          <div className="active-diligence-stat-value">{notContactedCount}</div>
          <div className="active-diligence-stat-label">Not Contacted</div>
        </div>
        <div className="active-diligence-stat-card active-diligence-stat-info">
          <div className="active-diligence-stat-value">{contactRate}%</div>
          <div className="active-diligence-stat-label">Contact Rate</div>
        </div>
      </div>

      {/* Table */}
      <div className="active-diligence-content">
        <div className="active-diligence-table">
          <div className="active-diligence-table-header">
            <div className="active-diligence-col-status"></div>
            <div className="active-diligence-col-firm">Firm Name</div>
            <div className="active-diligence-col-tier">Tier</div>
            <div className="active-diligence-col-category">Category</div>
            <div className="active-diligence-col-aum">AUM</div>
            <div className="active-diligence-col-investment">Investment Size</div>
            <div className="active-diligence-col-probability">Probability</div>
            <div className="active-diligence-col-interactions">Interactions</div>
            <div className="active-diligence-col-last-activity">Last Activity</div>
          </div>

          {accounts.length === 0 ? (
            <div className="active-diligence-empty">
              No firms in active diligence
            </div>
          ) : (
            accounts.map((account) => (
              <div
                key={account.id}
                className={`active-diligence-table-row ${
                  account.contactedThisWeek ? 'active-diligence-row-contacted' : 'active-diligence-row-not-contacted'
                }`}
              >
                <div className="active-diligence-col-status">
                  {account.contactedThisWeek ? (
                    <CheckCircle size={20} className="active-diligence-check-icon" />
                  ) : (
                    <div className="active-diligence-warning-icon">!</div>
                  )}
                </div>
                <div className="active-diligence-col-firm">
                  <span className="active-diligence-firm-name">{account.firm_name}</span>
                  {account.focus_list && (
                    <span className="active-diligence-badge active-diligence-badge-focus">Focus</span>
                  )}
                  {account.pm_meeting && (
                    <span className="active-diligence-badge active-diligence-badge-pm">PM Meeting</span>
                  )}
                </div>
                <div className="active-diligence-col-tier">
                  <span className={`active-diligence-tier-badge active-diligence-tier-${account.tier?.toLowerCase().replace(' ', '')}`}>
                    {account.tier}
                  </span>
                </div>
                <div className="active-diligence-col-category">{account.category || 'N/A'}</div>
                <div className="active-diligence-col-aum">{formatCurrency(account.aum)}</div>
                <div className="active-diligence-col-investment">
                  {formatCurrency(account.investment_size)}
                </div>
                <div className="active-diligence-col-probability">
                  {account.probability_of_investment ? (
                    <span className={`active-diligence-badge active-diligence-badge-${account.probability_of_investment.toLowerCase()}`}>
                      {account.probability_of_investment}
                    </span>
                  ) : (
                    'N/A'
                  )}
                </div>
                <div className="active-diligence-col-interactions">
                  {account.contactedThisWeek ? (
                    <span className="active-diligence-interaction-count">
                      {account.interactionCount} this week
                    </span>
                  ) : (
                    <span className="active-diligence-no-contact">None</span>
                  )}
                </div>
                <div className="active-diligence-col-last-activity">
                  {formatDate(account.last_activity) || 'N/A'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="active-diligence-legend">
        <div className="active-diligence-legend-item">
          <CheckCircle size={16} className="active-diligence-check-icon" />
          <span>Contacted this week</span>
        </div>
        <div className="active-diligence-legend-item">
          <div className="active-diligence-warning-icon-small">!</div>
          <span>Not contacted this week</span>
        </div>
      </div>
    </div>
  )
}

export default ActiveDiligenceReport

