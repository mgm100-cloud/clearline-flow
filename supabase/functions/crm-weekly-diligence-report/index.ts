// Weekly Active Diligence Report Generator and Emailer
// This Edge Function generates a PDF of the Active Diligence Report
// and emails it to the distribution list

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Calculate current week (Monday to Sunday)
    const today = new Date()
    const dayOfWeek = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    monday.setHours(0, 0, 0, 0)

    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    console.log(`Generating Active Diligence Report for week: ${monday.toISOString()} to ${sunday.toISOString()}`)

    // Get all accounts in active diligence (Tier 1 or Tier 2, Prospect or Investor)
    const { data: accountsData, error: accountsError } = await supabaseClient
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
      accountsData.map(async (account: any) => {
        // Check for tasks/interactions this week
        const { data: tasksData } = await supabaseClient
          .from('tasks')
          .select('id, subject, due_date, status, type')
          .eq('related_account_id', account.id)
          .is('deleted_at', null)
          .gte('due_date', monday.toISOString())
          .lte('due_date', sunday.toISOString())

        // Check for emails sent this week
        const { data: emailsData } = await supabaseClient
          .from('email_outbound')
          .select('id, subject, sent_at')
          .eq('related_account_id', account.id)
          .gte('sent_at', monday.toISOString())
          .lte('sent_at', sunday.toISOString())

        const contactedThisWeek = (tasksData && tasksData.length > 0) || (emailsData && emailsData.length > 0)
        const interactionCount = (tasksData?.length || 0) + (emailsData?.length || 0)

        return {
          ...account,
          contactedThisWeek,
          interactionCount,
        }
      })
    )

    // Calculate summary stats
    const totalFirms = accountsWithContactStatus.length
    const contactedCount = accountsWithContactStatus.filter(a => a.contactedThisWeek).length
    const notContactedCount = totalFirms - contactedCount
    const contactRate = totalFirms > 0 ? ((contactedCount / totalFirms) * 100).toFixed(0) : 0

    console.log(`Stats: ${totalFirms} total, ${contactedCount} contacted, ${notContactedCount} not contacted, ${contactRate}% rate`)

    // Generate HTML report
    const html = generateHTMLReport(accountsWithContactStatus, {
      weekStart: monday,
      weekEnd: sunday,
      totalFirms,
      contactedCount,
      notContactedCount,
      contactRate,
    })

    // In production, you would use Playwright to convert HTML to PDF
    // For now, we'll just save the HTML and send it as an email
    
    // NOTE: PDF generation requires Playwright which needs to be set up in the Edge Function environment
    // This is a placeholder implementation that sends HTML email instead
    
    // Get distribution list for weekly reports
    const { data: distributionList } = await supabaseClient
      .from('distribution_lists')
      .select('id, name')
      .eq('name', 'Weekly Diligence Report Recipients')
      .single()

    if (!distributionList) {
      console.log('No distribution list found for weekly reports. Skipping email.')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Report generated but no distribution list configured',
          stats: { totalFirms, contactedCount, notContactedCount, contactRate },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Get members of distribution list
    const { data: members } = await supabaseClient
      .from('distribution_list_members')
      .select(`
        contact_id,
        contacts (
          email,
          first_name,
          last_name
        )
      `)
      .eq('distribution_list_id', distributionList.id)

    if (!members || members.length === 0) {
      console.log('No members in distribution list. Skipping email.')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Report generated but no recipients configured',
          stats: { totalFirms, contactedCount, notContactedCount, contactRate },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Send email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@clearlinecapital.com'

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured')
    }

    const recipients = members
      .map((m: any) => m.contacts?.email)
      .filter(Boolean)

    const subject = `Active Diligence Report - Week of ${formatDate(monday)}`

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject: subject,
        html: html,
      }),
    })

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text()
      throw new Error(`Resend API error: ${errorText}`)
    }

    const resendData = await resendResponse.json()
    console.log('Email sent successfully:', resendData)

    // Log the email in database
    await supabaseClient
      .from('email_outbound')
      .insert({
        subject: subject,
        html_body: html,
        sent_at: new Date().toISOString(),
        sent_via: 'resend',
        related_distribution_list_id: distributionList.id,
      })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Weekly Active Diligence Report sent successfully',
        stats: { totalFirms, contactedCount, notContactedCount, contactRate },
        recipients: recipients.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error generating weekly report:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

function generateHTMLReport(accounts: any[], stats: any): string {
  const { weekStart, weekEnd, totalFirms, contactedCount, notContactedCount, contactRate } = stats

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Active Diligence Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f8f9fa;
    }
    .header {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      color: #1a1a1a;
    }
    .subtitle {
      color: #666;
      font-size: 14px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-left: 4px solid #e0e0e0;
    }
    .stat-card.success { border-left-color: #10b981; }
    .stat-card.warning { border-left-color: #f59e0b; }
    .stat-card.info { border-left-color: #3b82f6; }
    .stat-value {
      font-size: 32px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 4px;
    }
    .stat-label {
      font-size: 13px;
      color: #666;
    }
    table {
      width: 100%;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-collapse: collapse;
    }
    th {
      background: #f8f9fa;
      padding: 12px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      border-bottom: 2px solid #e0e0e0;
    }
    td {
      padding: 16px 12px;
      border-bottom: 1px solid #e0e0e0;
      font-size: 14px;
    }
    tr.contacted { background: #f0fdf4; }
    tr.not-contacted { background: #fef3c7; }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-focus { background: #fef3c7; color: #92400e; }
    .badge-pm { background: #dbeafe; color: #1e40af; }
    .badge-tier1 { background: #dcfce7; color: #166534; }
    .badge-tier2 { background: #dbeafe; color: #1e40af; }
    .check-icon { color: #10b981; font-weight: bold; }
    .warning-icon { color: #f59e0b; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Active Diligence Report</h1>
    <p class="subtitle">Week of ${formatDate(weekStart)} - ${formatDate(weekEnd)}</p>
  </div>

  <div class="stats">
    <div class="stat-card">
      <div class="stat-value">${totalFirms}</div>
      <div class="stat-label">Total Firms</div>
    </div>
    <div class="stat-card success">
      <div class="stat-value">${contactedCount}</div>
      <div class="stat-label">Contacted This Week</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-value">${notContactedCount}</div>
      <div class="stat-label">Not Contacted</div>
    </div>
    <div class="stat-card info">
      <div class="stat-value">${contactRate}%</div>
      <div class="stat-label">Contact Rate</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Firm Name</th>
        <th>Tier</th>
        <th>Category</th>
        <th>AUM</th>
        <th>Interactions</th>
      </tr>
    </thead>
    <tbody>
      ${accounts.map(account => `
        <tr class="${account.contactedThisWeek ? 'contacted' : 'not-contacted'}">
          <td>${account.contactedThisWeek ? '<span class="check-icon">✓</span>' : '<span class="warning-icon">!</span>'}</td>
          <td>
            ${account.firm_name}
            ${account.focus_list ? ' <span class="badge badge-focus">Focus</span>' : ''}
            ${account.pm_meeting ? ' <span class="badge badge-pm">PM Meeting</span>' : ''}
          </td>
          <td><span class="badge badge-${account.tier?.toLowerCase().replace(' ', '')}">${account.tier}</span></td>
          <td>${account.category || 'N/A'}</td>
          <td>${formatCurrency(account.aum)}</td>
          <td>${account.contactedThisWeek ? `${account.interactionCount} this week` : 'None'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
  `
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(value: number): string {
  if (!value) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

