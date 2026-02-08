import React, { useState, useEffect } from 'react'
import { Download, Calendar } from 'lucide-react'
import { fetchAllRows } from '../../services/crmService'
import './ActiveDiligenceReport.css'

const ActiveDiligenceReport = () => {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await fetchAllRows(
        'accounts',
        'id, firm_name, last_activity',
        [
          { type: 'is', col: 'deleted_at', val: null },
          { type: 'eq', col: 'status', val: '2 Active Diligence' },
        ],
        'firm_name',
        true
      )

      const now = new Date()
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      const processed = (data || []).map(account => {
        const lastActivity = account.last_activity ? new Date(account.last_activity) : null
        const contactedThisWeek = lastActivity && lastActivity >= sevenDaysAgo
        return { ...account, contactedThisWeek }
      })

      // Sort: No first, then by firm name
      processed.sort((a, b) => {
        if (a.contactedThisWeek !== b.contactedThisWeek) {
          return a.contactedThisWeek ? 1 : -1 // No first
        }
        return (a.firm_name || '').localeCompare(b.firm_name || '')
      })

      setAccounts(processed)
    } catch (error) {
      console.error('Error loading active diligence data:', error)
      alert('Failed to load active diligence data')
    } finally {
      setLoading(false)
    }
  }

  const handleExportPDF = () => {
    alert('PDF export will generate a formatted Active Diligence report. Requires server-side setup.')
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const contactedCount = accounts.filter(a => a.contactedThisWeek).length
  const notContactedCount = accounts.length - contactedCount

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
            Firms with status "2 Active Diligence" — {accounts.length} firms
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
          <div className="active-diligence-stat-label">Contacted This Week</div>
        </div>
        <div className="active-diligence-stat-card active-diligence-stat-warning">
          <div className="active-diligence-stat-value">{notContactedCount}</div>
          <div className="active-diligence-stat-label">Not Contacted</div>
        </div>
      </div>

      {/* Table */}
      <div className="active-diligence-content">
        <div className="active-diligence-table">
          <div className="active-diligence-table-header">
            <div className="ad-col-firm">Firm Name</div>
            <div className="ad-col-activity">Last Activity</div>
            <div className="ad-col-contacted">Contacted This Week?</div>
          </div>

          {accounts.length === 0 ? (
            <div className="active-diligence-empty">
              No firms with status "2 Active Diligence"
            </div>
          ) : (
            accounts.map((account) => (
              <div
                key={account.id}
                className={`active-diligence-table-row ${
                  account.contactedThisWeek ? 'ad-row-yes' : 'ad-row-no'
                }`}
              >
                <div className="ad-col-firm">{account.firm_name}</div>
                <div className="ad-col-activity">{formatDate(account.last_activity)}</div>
                <div className="ad-col-contacted">
                  {account.contactedThisWeek ? (
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

export default ActiveDiligenceReport
