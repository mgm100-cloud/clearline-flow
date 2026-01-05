# Clearline CRM - Technical Documentation

## Overview

The Clearline CRM is a comprehensive customer relationship management system designed specifically for Clearline Capital's marketing and investor relations needs. It provides full lifecycle management of accounts (firms), contacts, and interactions, with deep integration into Microsoft Outlook and bulk email capabilities.

## Key Features

### 1. **Account (Firm) Management**
- Complete firm profiles with financial data (AUM, investment sizes, etc.)
- Status tracking (Investor, Active Diligence, Potential Investor, etc.)
- Relationship information (consultants, prime brokers, focus lists)
- Client capital tracking with S&P 500 benchmark comparison

### 2. **Contact Management**
- Full contact profiles linked to accounts
- Hierarchical relationships (reports-to)
- Distribution list management
- Email tracking and engagement

### 3. **Interaction Tracking**
- Multiple interaction types (emails, calls, meetings, etc.)
- Automatic task creation from synced emails
- Participant tracking
- Activity timeline per account/contact

### 4. **Email Integration**
- **Microsoft Graph (Outlook):**
  - Send emails directly from CRM
  - Automatic inbox/sent items sync
  - OAuth 2.0 authentication
  - Delta sync for efficiency
  
- **Resend (Bulk Email):**
  - Distribution list support
  - Open/click tracking
  - Bounce and complaint handling

### 5. **Salesforce Import**
- CSV import from Salesforce exports
- Field mapping and normalization
- Relationship resolution
- Error handling and logging

### 6. **Reports**
- Pipeline Report with drag-drop ordering
- Active Diligence Report (weekly automated)
- Multiple pipeline views with "contacted recently" logic
- PDF export capability

### 7. **Search & Discovery**
- Global search across firms and contacts
- Full-text search with fuzzy matching
- Advanced filtering and sorting

## Architecture

### Database Schema

#### Core Tables
```sql
accounts          -- Firms/companies
contacts          -- People at firms
tasks             -- Interactions/activities
task_participants -- People involved in tasks
```

#### Email Tables
```sql
distribution_lists         -- Email distribution lists
distribution_list_members  -- Contacts in lists
email_outbound            -- Sent emails (Graph/Resend)
email_outbound_recipients -- Recipients of sent emails
email_events              -- Open/click/bounce events
```

#### Outlook Sync Tables
```sql
mailboxes           -- Connected Outlook accounts
emails              -- Synced emails
email_recipients    -- Recipients of synced emails
mailbox_sync_state  -- Delta tokens for incremental sync
```

#### Client Data Tables
```sql
client_data_capital  -- Monthly capital balances
client_data_subs     -- Subscription transactions
client_data_reds     -- Redemption transactions
report_row_orders    -- User-specific report ordering
```

#### Import Tables
```sql
staging_accounts  -- CSV import staging
staging_contacts  -- CSV import staging
staging_tasks     -- CSV import staging
x_sf_account      -- Salesforce ID crosswalk
x_sf_contact      -- Salesforce ID crosswalk
x_sf_task         -- Salesforce ID crosswalk
import_logs       -- Import run tracking
```

### API Endpoints

All endpoints are Supabase Edge Functions accessible at:
`https://[your-project].supabase.co/functions/v1/[function-name]`

#### CRUD Operations
- `crm-accounts` - GET, POST, PATCH, DELETE for accounts
- `crm-contacts` - GET, POST, PATCH, DELETE for contacts
- `crm-tasks` - GET, POST, PATCH, DELETE for tasks

#### Search
- `crm-search?q={query}` - Global search

#### Email
- `crm-send-email` - Send via Microsoft Graph
- `crm-send-bulk-email` - Send via Resend to distribution lists

#### Outlook Integration
- `crm-outlook-oauth?action=authorize` - Get OAuth URL
- `crm-outlook-oauth?action=callback` - Complete OAuth flow
- `crm-outlook-oauth?action=status` - Get mailbox status
- `crm-outlook-sync` - Sync emails (called by cron)

#### Webhooks
- `crm-resend-webhook` - Resend event webhook

## Data Flow

### CSV Import Flow
```
1. Upload CSV → staging_accounts/contacts/tasks
2. Call import_accounts_from_staging()
3. Parse and normalize fields
4. Insert into accounts/contacts/tasks
5. Create crosswalk entries (x_sf_*)
6. Log results in import_logs
```

### Email Send Flow (Graph)
```
1. User composes email in CRM
2. POST to crm-send-email
3. Get OAuth token from mailboxes table
4. Refresh token if expired
5. Create message via Graph API
6. Send message
7. Save to email_outbound
8. Create task with interaction_type='SentEmail'
```

### Email Sync Flow (Outlook)
```
1. Cron job calls crm-outlook-sync every 15 min
2. For each active mailbox:
   a. Refresh OAuth token if needed
   b. Get delta token from mailbox_sync_state
   c. Call Graph API /messages/delta
   d. Process new/updated messages
   e. Insert into emails table
   f. Auto-link to contacts by email address
   g. Create tasks for linked emails
   h. Save new delta token
```

### Bulk Email Flow (Resend)
```
1. User selects distribution list
2. POST to crm-send-bulk-email
3. Get contacts from distribution_list_members
4. Create email_outbound record
5. For each recipient:
   a. Call Resend API
   b. Include tags (email_outbound_id, contact_id)
6. Create tasks for each sent email
7. Resend sends webhooks to crm-resend-webhook
8. Webhook inserts events into email_events
```

## Security

### Row Level Security (RLS)

All tables have RLS enabled with policies that:
- Require authentication (`auth.role() = 'authenticated'`)
- Check CRM access via `has_crm_access()` function
- Verify user division is 'Marketing' or 'Super'

### OAuth Token Management

- Tokens stored encrypted in `mailboxes` table
- Automatic refresh before expiration
- Service role used for background sync jobs

### API Authentication

- All Edge Functions require Bearer token
- Token passed in Authorization header
- User context retrieved via `supabase.auth.getUser()`

## Field Mappings

### Salesforce → Accounts

| Salesforce Field | CRM Field | Type | Notes |
|-----------------|-----------|------|-------|
| Id | sf_ext_id | TEXT | Preserved for reference |
| Name | firm_name | TEXT | Required |
| Type | type | TEXT | Enum constraint |
| BillingStreet | address | TEXT | |
| BillingCity | city | TEXT | |
| BillingState | state | TEXT | |
| BillingCountry | country | TEXT | |
| BillingPostalCode | zip_code | TEXT | |
| Phone | phone_number | TEXT | |
| Website | website | TEXT | |
| Description + Firm_Background__c + Investment_Notes__c + Brief_Overview__c | description | TEXT | Merged with separator |
| CreatedDate | created_date | DATE | |
| LastModifiedDate | updated_date | DATE | |
| LastActivityDate | last_activity | DATE | |
| AUM__c | aum | NUMERIC | |
| Tier__c | tier | TEXT | |
| Investment_Size__c | investment_size_min, investment_size_max | NUMERIC | Parsed range |
| Number_of_HF_Investments__c | hf_investments | INTEGER | |
| Catagory__c | category | TEXT | |
| PB_Introduction__c | pb_introduction | TEXT | |
| Consultant__c | consultant | TEXT | |
| Focus_List__c | focus_list | BOOLEAN | Normalized |
| Probability_of_Investment__c | probability_of_investment | NUMERIC | |
| PM_Meeting__c | pm_meeting | BOOLEAN | Normalized |

### Salesforce → Contacts

| Salesforce Field | CRM Field | Type | Notes |
|-----------------|-----------|------|-------|
| Id | sf_ext_id | TEXT | |
| AccountId | account_id | UUID | Resolved via crosswalk |
| Salutation | salutation | TEXT | |
| FirstName | first_name | TEXT | |
| LastName | last_name | TEXT | |
| MailingStreet | mailing_street | TEXT | |
| MailingCity | mailing_city | TEXT | |
| MailingState | mailing_state | TEXT | |
| MailingPostalCode | mailing_postal_code | TEXT | |
| MailingCountry | mailing_country | TEXT | |
| Phone | phone | TEXT | |
| MobilePhone | mobile_phone | TEXT | |
| Email | email | TEXT | Lowercased |
| AssistantName | assistant_name | TEXT | |
| AssistantPhone | assistant_phone | TEXT | |
| ReportsToId | reports_to_contact_id | UUID | Resolved via crosswalk |
| Title | title | TEXT | |
| LeadSource | lead_source | TEXT | |
| Description + Background__c | description | TEXT | Merged |
| CreatedDate | created_date | DATE | |
| LastModifiedDate | updated_date | DATE | |
| LastActivityDate | last_activity | DATE | |
| Clearline_Distribution_List__c | distribution_list | BOOLEAN | Normalized |
| Key_Contact__c | main_contact | BOOLEAN | Normalized |
| Onshore_Offshore__c | which_fund | TEXT | Normalized to enum |

### Salesforce → Tasks

| Salesforce Field | CRM Field | Type | Notes |
|-----------------|-----------|------|-------|
| Id | sf_ext_id | TEXT | |
| AccountId | account_id | UUID | Resolved via crosswalk |
| WhoId / WhatId | contact_id | UUID | Complex resolution rule |
| Subject | subject | TEXT | |
| ActivityDate | activity_date | DATE | |
| Description | description | TEXT | |
| Summary__c | extra_info | TEXT | |
| CreatedDate | created_date | DATE | |
| LastModifiedDate | updated_date | DATE | |
| (inferred) | interaction_type | TEXT | Inferred from subject keywords |

## Enums

### Account Type
```
Fund of Funds
Wealth Manager
Pension – Public
Family Office
Multi Family Office
Endowment
Pension – Corporate
Private Bank
Consultant
Outsourced CIO
High Net Worth
Foundation
Bank
Prime Broker
Employee
Sovereign Wealth Fund
Insurance Company
```

### Account Status
```
1 Investor
2 Active Diligence
3 Potential Investor in 6 Months
4 High Focus
5 Low Focus
6 Dormant
```

### Contact Which Fund
```
Onshore
Offshore
TBD
```

### Task Interaction Type
```
SentEmail
ReceivedEmail
OutgoingCall
ConnectedCall
VideoCall
InPersonOffice
InPersonVisit
ConferenceMeeting
UpdatedInfo
```

## Helper Functions

### Boolean Normalization
```sql
normalize_boolean(value TEXT) → BOOLEAN
-- Converts: true/false, yes/no, y/n, 1/0, t/f → BOOLEAN
```

### Numeric Parsing
```sql
parse_numeric(value TEXT) → NUMERIC
-- Removes $, commas, % and converts to numeric
```

### Date Parsing
```sql
parse_date(value TEXT) → DATE
-- Converts text to DATE, returns NULL on error
```

### Text Merging
```sql
merge_text_fields(VARIADIC fields TEXT[]) → TEXT
-- Joins non-empty fields with \n\n---\n separator
```

### Investment Size Parsing
```sql
parse_investment_size_range(value TEXT, OUT min NUMERIC, OUT max NUMERIC)
-- Parses "5M-10M" or "5000000-10000000" to min/max
```

### Firm Capital Calculations
```sql
get_firm_total_invested(firm_id UUID) → NUMERIC
get_firm_total_redeemed(firm_id UUID) → NUMERIC
get_firm_net_invested(firm_id UUID) → NUMERIC
```

## Usage Examples

### Import Salesforce Data

```sql
-- 1. Load CSV into staging tables (via COPY or application)

-- 2. Import accounts
SELECT * FROM import_accounts_from_staging();

-- 3. Import contacts (after accounts)
SELECT * FROM import_contacts_from_staging();

-- 4. Import tasks (after accounts and contacts)
SELECT * FROM import_tasks_from_staging();

-- 5. Clear staging tables
SELECT clear_staging_tables();
```

### Query Accounts with Filters

```javascript
const { data, pagination } = await getAccounts({
  page: 1,
  limit: 50,
  search: 'pension',
  status: '2 Active Diligence',
  sortBy: 'last_activity',
  sortOrder: 'desc'
})
```

### Send Email via Graph

```javascript
await sendEmail({
  subject: 'Q4 Update',
  htmlBody: '<p>Hello...</p>',
  recipients: [
    { address: 'john@example.com', kind: 'to', contactId: 'uuid' },
    { address: 'jane@example.com', kind: 'cc' }
  ],
  relatedAccountId: 'account-uuid',
  relatedContactId: 'contact-uuid'
})
```

### Send Bulk Email to Distribution List

```javascript
await sendBulkEmail({
  subject: 'Monthly Newsletter',
  htmlBody: '<p>Dear Investor...</p>',
  distributionListId: 'list-uuid',
  relatedAccountId: 'account-uuid'
})
```

### Connect Outlook Account

```javascript
// 1. Get auth URL
const { authUrl } = await getOutlookAuthUrl(
  'https://yourapp.com/oauth/callback',
  'random-state-string'
)

// 2. Redirect user to authUrl

// 3. On callback, exchange code
await completeOutlookAuth(code, redirectUri)

// 4. Automatic sync will start on next cron run
```

## Maintenance

### Scheduled Jobs

#### Outlook Sync (Every 15 minutes)
```sql
SELECT cron.schedule(
  'outlook-sync',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://[project].supabase.co/functions/v1/crm-outlook-sync',
    headers := '{"Authorization": "Bearer [service-role-key]"}'::jsonb
  );
  $$
);
```

#### Weekly Active Diligence Report (To be implemented)
```sql
SELECT cron.schedule(
  'weekly-diligence-report',
  '0 9 * * 1',  -- Monday at 9 AM
  $$
  SELECT net.http_post(
    url := 'https://[project].supabase.co/functions/v1/crm-generate-report',
    headers := '{"Authorization": "Bearer [service-role-key]"}'::jsonb,
    body := '{"report": "active_diligence"}'::jsonb
  );
  $$
);
```

### Monitoring

#### Check Import Logs
```sql
SELECT * FROM import_logs
ORDER BY started_at DESC
LIMIT 10;
```

#### Check Mailbox Status
```sql
SELECT 
  email_address,
  status,
  last_synced_at,
  oauth_token_expires_at
FROM mailboxes
WHERE status = 'active';
```

#### Check Email Events
```sql
SELECT 
  eo.subject,
  ee.type,
  ee.occurred_at,
  c.first_name,
  c.last_name
FROM email_events ee
JOIN email_outbound eo ON ee.email_outbound_id = eo.id
LEFT JOIN email_outbound_recipients eor ON ee.recipient_id = eor.id
LEFT JOIN contacts c ON eor.contact_id = c.id
WHERE eo.sent_at > NOW() - INTERVAL '7 days'
ORDER BY ee.occurred_at DESC;
```

## Troubleshooting

### OAuth Token Expired
If Outlook sync fails with 401 errors:
1. Check `oauth_token_expires_at` in mailboxes table
2. Refresh token should happen automatically
3. If refresh fails, user needs to re-authenticate

### Import Errors
Check staging tables for error messages:
```sql
SELECT row_number, error_message
FROM staging_accounts
WHERE processed = TRUE AND error_message IS NOT NULL;
```

### Missing Email Links
If emails aren't linking to contacts:
1. Verify email addresses match exactly (case-insensitive)
2. Check `auto_link_email_to_crm()` trigger is active
3. Manually link by updating `related_type` and `related_id` in emails table

### Performance Issues
1. Check index usage: `EXPLAIN ANALYZE SELECT ...`
2. Verify GIN indexes exist for full-text search
3. Consider partitioning large tables (emails, tasks) by date
4. Review RLS policies for efficiency

## Future Enhancements

- [ ] OpenAI integration for email drafting
- [ ] Advanced reporting with charts
- [ ] Mobile app
- [ ] Calendar integration
- [ ] Document management
- [ ] Deal pipeline tracking
- [ ] Automated follow-up reminders
- [ ] Email templates
- [ ] Custom fields
- [ ] Workflow automation

---

**Version:** 1.0
**Last Updated:** 2025-11-03
**Maintainer:** Clearline Capital Engineering Team

