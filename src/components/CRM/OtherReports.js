import React from 'react'
import { BarChart3, TrendingUp, Users, FileText } from 'lucide-react'
import './OtherReports.css'

const OtherReports = () => {
  const reports = [
    {
      id: 'active-hot-pipeline',
      title: 'Active Hot Pipeline',
      description: 'High-probability prospects with recent PM meetings',
      icon: TrendingUp,
      filters: 'Tier 1 + Tier 2, Probability: High, PM Meeting: Yes',
      status: 'Coming Soon',
    },
    {
      id: 'active-pipeline',
      title: 'Active Pipeline',
      description: 'All active prospects regardless of probability',
      icon: BarChart3,
      filters: 'Tier 1 + Tier 2, Type: Prospect',
      status: 'Coming Soon',
    },
    {
      id: 'full-prospect',
      title: 'Full Prospect List',
      description: 'Complete list of all prospects across all tiers',
      icon: Users,
      filters: 'All Tiers, Type: Prospect',
      status: 'Coming Soon',
    },
    {
      id: 'custom-report',
      title: 'Custom Report Builder',
      description: 'Build your own reports with custom filters and fields',
      icon: FileText,
      filters: 'User-defined filters',
      status: 'Future Enhancement',
    },
  ]

  return (
    <div className="other-reports">
      <div className="other-reports-header">
        <h2>Additional Reports</h2>
        <p className="other-reports-subtitle">
          More reporting capabilities coming soon
        </p>
      </div>

      <div className="other-reports-grid">
        {reports.map((report) => {
          const Icon = report.icon
          return (
            <div key={report.id} className="other-report-card">
              <div className="other-report-icon">
                <Icon size={32} />
              </div>
              <div className="other-report-content">
                <h3>{report.title}</h3>
                <p className="other-report-description">{report.description}</p>
                <div className="other-report-filters">
                  <strong>Filters:</strong> {report.filters}
                </div>
                <div className="other-report-status">
                  <span className={`other-report-badge ${report.status === 'Coming Soon' ? 'badge-warning' : 'badge-info'}`}>
                    {report.status}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="other-reports-note">
        <h3>Implementation Notes</h3>
        <p>
          These reports follow the same pattern as the Pipeline and Active Diligence reports.
          Each report will have:
        </p>
        <ul>
          <li>Customizable filters (tier, category, probability, etc.)</li>
          <li>Sortable columns</li>
          <li>PDF export functionality</li>
          <li>Drill-down to firm details</li>
          <li>Summary statistics</li>
        </ul>
        <p>
          The reports can be implemented by copying the existing report components
          and adjusting the filters and display logic as needed.
        </p>
      </div>
    </div>
  )
}

export default OtherReports

