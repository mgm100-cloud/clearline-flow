import React, { useState, useEffect } from 'react'
import { Download, Calendar } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import './ActiveDiligenceReport.css' // Reuse same styles

/**
 * Reusable report component for:
 * - Active Hot Pipeline (status in 2,3 | contacted this month = 30 days)
 * - Active Pipeline (status in 2,3,4,5 | contacted this quarter = 90 days)
 * - Full Prospect (status != 1 Investor | contacted this year = 360 days)
 */
const ProspectReport = ({ title, description, statuses, excludeStatuses, contactedLabel, contactedDays }) => {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('accounts')
        .select('id, firm_name, last_activity, status')
        .is('deleted_at', null)

      if (statuses && statuses.length > 0) {
        query = query.in('status', statuses)
      } else if (excludeStatuses && excludeStatuses.length > 0) {
        // For "not in" filter, we need to use .not
        excludeStatuses.forEach(s => {
          query = query.neq('status', s)
        })
      }

      query = query.order('firm_name', { ascending: true }).limit(10000)

      const { data, error } = await query

      if (error) throw error

      const now = new Date()
      const cutoffDate = new Date(now.getTime() - contactedDays * 24 * 60 * 60 * 1000)

      const processed = (data || []).map(account => {
        const lastActivity = account.last_activity ? new Date(account.last_activity) : null
        const contacted = lastActivity && lastActivity >= cutoffDate
        return { ...account, contacted }
      })

      // Sort: No first, then by firm name
      processed.sort((a, b) => {
        if (a.contacted !== b.contacted) {
          return a.contacted ? 1 : -1 // No first
        }
        return (a.firm_name || '').localeCompare(b.firm_name || '')
      })

      setAccounts(processed)
    } catch (error) {
      console.error(`Error loading ${title} data:`, error)
      alert(`Failed to load ${title} data`)
    } finally {
      setLoading(false)
    }
  }

  const handleExportPDF = () => {
    alert(`PDF export for ${title} requires server-side rendering setup.`)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const contactedCount = accounts.filter(a => a.contacted).length
  const notContactedCount = accounts.length - contactedCount

  if (loading) {
    return (
      <div className="active-diligence-report">
        <div className="active-diligence-loading">Loading {title}...</div>
      </div>
    )
  }

  return (
    <div className="active-diligence-report">
      {/* Header */}
      <div className="active-diligence-header">
        <div className="active-diligence-header-left">
          <h2>{title}</h2>
          <p className="active-diligence-subtitle">
            <Calendar size={16} />
            {description} — {accounts.length} firms
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
        <div className="active-diligence-stat-card active-diligence-stat-success">
          <div className="active-diligence-stat-value">{contactedCount}</div>
          <div className="active-diligence-stat-label">{contactedLabel}: Yes</div>
        </div>
        <div className="active-diligence-stat-card active-diligence-stat-warning">
          <div className="active-diligence-stat-value">{notContactedCount}</div>
          <div className="active-diligence-stat-label">{contactedLabel}: No</div>
        </div>
      </div>

      {/* Table */}
      <div className="active-diligence-content">
        <div className="active-diligence-table">
          <div className="active-diligence-table-header">
            <div className="ad-col-firm">Firm Name</div>
            <div className="ad-col-activity">Last Activity</div>
            <div className="ad-col-contacted">{contactedLabel}</div>
          </div>

          {accounts.length === 0 ? (
            <div className="active-diligence-empty">
              No firms match the criteria for this report
            </div>
          ) : (
            accounts.map((account) => (
              <div
                key={account.id}
                className={`active-diligence-table-row ${
                  account.contacted ? 'ad-row-yes' : 'ad-row-no'
                }`}
              >
                <div className="ad-col-firm">{account.firm_name}</div>
                <div className="ad-col-activity">{formatDate(account.last_activity)}</div>
                <div className="ad-col-contacted">
                  {account.contacted ? (
                    <span className="ad-contacted-yes">Yes</span>
                  ) : (
                    <span className="ad-contacted-no">No</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default ProspectReport
