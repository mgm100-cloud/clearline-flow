# Clearline CRM - Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the Clearline CRM system to production.

## Prerequisites

- Supabase project created
- Vercel account (for frontend hosting)
- Microsoft Azure app registration (for Outlook integration)
- Resend account (for bulk email)
- OpenAI API key (for email drafting - optional)

## Step 1: Database Setup

### 1.1 Run Database Migrations

Connect to your Supabase project and run the schema files in order:

```bash
# Option 1: Using Supabase CLI
supabase db push

# Option 2: Using SQL Editor in Supabase Dashboard
# Copy and paste the contents of each file in order:
```

1. `database/create-auth-setup.sql` (if not already run)
2. `add-division-to-user-profiles.sql` (if not already run)
3. `database/crm-schema-core.sql`
4. `database/crm-schema-email.sql`
5. `database/crm-schema-outlook.sql`
6. `database/crm-schema-client-data.sql`
7. `database/crm-schema-import.sql`
8. `database/crm-import-functions.sql`

### 1.2 Verify Tables Created

```sql
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE '%account%' 
   OR tablename LIKE '%contact%' 
   OR tablename LIKE '%task%'
   OR tablename LIKE '%email%'
   OR tablename LIKE '%mailbox%';
```

### 1.3 Set User Divisions

Update existing users to have CRM access:

```sql
UPDATE user_profiles 
SET division = 'Marketing'  -- or 'Super'
WHERE email IN ('user1@clearlinecapital.com', 'user2@clearlinecapital.com');
```

## Step 2: Microsoft Graph Setup

### 2.1 Create Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to "Azure Active Directory" → "App registrations"
3. Click "New registration"
4. Name: "Clearline CRM"
5. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
6. Redirect URI: `https://your-app.vercel.app/oauth/callback`
7. Click "Register"

### 2.2 Configure API Permissions

1. Go to "API permissions"
2. Click "Add a permission" → "Microsoft Graph" → "Delegated permissions"
3. Add these permissions:
   - `Mail.ReadWrite`
   - `Mail.Send`
   - `User.Read`
   - `offline_access`
4. Click "Grant admin consent"

### 2.3 Create Client Secret

1. Go to "Certificates & secrets"
2. Click "New client secret"
3. Description: "CRM Production"
4. Expires: 24 months (or as per policy)
5. Click "Add"
6. **Copy the secret value immediately** (you won't see it again)

### 2.4 Note Your Credentials

- Application (client) ID: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Client secret: `your-secret-value`

## Step 3: Resend Setup

### 3.1 Create Resend Account

1. Go to [Resend](https://resend.com)
2. Sign up and verify your email
3. Add and verify your domain (e.g., `clearlinecapital.com`)

### 3.2 Create API Key

1. Go to "API Keys"
2. Click "Create API Key"
3. Name: "CRM Production"
4. Permission: "Sending access"
5. Click "Create"
6. **Copy the API key**

### 3.3 Configure Webhook

1. Go to "Webhooks"
2. Click "Add Webhook"
3. Endpoint: `https://your-project.supabase.co/functions/v1/crm-resend-webhook`
4. Events: Select all (opened, clicked, delivered, bounced, complained)
5. Click "Add"

## Step 4: Deploy Edge Functions

### 4.1 Install Supabase CLI

```bash
npm install -g supabase
```

### 4.2 Link to Your Project

```bash
supabase link --project-ref your-project-ref
```

### 4.3 Set Environment Secrets

```bash
# Microsoft Graph
supabase secrets set MICROSOFT_CLIENT_ID=your-client-id
supabase secrets set MICROSOFT_CLIENT_SECRET=your-client-secret

# Resend
supabase secrets set RESEND_API_KEY=your-resend-api-key
supabase secrets set RESEND_FROM_EMAIL=noreply@clearlinecapital.com

# OpenAI (optional)
supabase secrets set OPENAI_API_KEY=your-openai-api-key
```

### 4.4 Deploy Functions

```bash
supabase functions deploy crm-accounts
supabase functions deploy crm-contacts
supabase functions deploy crm-tasks
supabase functions deploy crm-search
supabase functions deploy crm-send-email
supabase functions deploy crm-outlook-oauth
supabase functions deploy crm-outlook-sync
supabase functions deploy crm-send-bulk-email
supabase functions deploy crm-resend-webhook
```

### 4.5 Verify Deployments

```bash
supabase functions list
```

## Step 5: Configure Cron Jobs

### 5.1 Enable pg_cron Extension

In Supabase SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### 5.2 Schedule Outlook Sync (Every 15 minutes)

```sql
SELECT cron.schedule(
  'outlook-sync-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/crm-outlook-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    )
  );
  $$
);
```

### 5.3 Schedule Weekly Report (Monday 9 AM)

```sql
-- To be implemented when report generation function is ready
SELECT cron.schedule(
  'weekly-diligence-report',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/crm-generate-report',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object('report', 'active_diligence')
  );
  $$
);
```

## Step 6: Deploy Frontend

### 6.1 Update Environment Variables

Create `.env.production` file:

```bash
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
```

### 6.2 Build and Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

### 6.3 Configure Vercel Environment Variables

In Vercel dashboard:
1. Go to your project → Settings → Environment Variables
2. Add:
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_ANON_KEY`

## Step 7: Import Salesforce Data

### 7.1 Prepare CSV Files

Ensure your CSV files are UTF-8 encoded:
- `Account.csv`
- `Contact.csv`
- `Task.csv`

### 7.2 Load into Staging Tables

Use the Supabase dashboard or a database client to load CSVs:

```sql
-- Example using COPY (adjust path as needed)
COPY staging_accounts(sf_id, name, type, ...)
FROM '/path/to/Account.csv'
DELIMITER ','
CSV HEADER;
```

### 7.3 Run Import Functions

```sql
-- Import accounts first
SELECT * FROM import_accounts_from_staging();

-- Then contacts (depends on accounts)
SELECT * FROM import_contacts_from_staging();

-- Finally tasks (depends on accounts and contacts)
SELECT * FROM import_tasks_from_staging();
```

### 7.4 Verify Import

```sql
-- Check import logs
SELECT * FROM import_logs ORDER BY started_at DESC;

-- Check counts
SELECT 
  (SELECT COUNT(*) FROM accounts WHERE deleted_at IS NULL) as accounts,
  (SELECT COUNT(*) FROM contacts WHERE deleted_at IS NULL) as contacts,
  (SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL) as tasks;
```

### 7.5 Clear Staging Tables

```sql
SELECT clear_staging_tables();
```

## Step 8: Testing

### 8.1 Test User Access

1. Log in as a Marketing user
2. Verify CRM tab is visible
3. Log in as a non-Marketing user
4. Verify "Access Denied" message

### 8.2 Test CRUD Operations

1. Create a new firm
2. Edit firm details
3. Add contacts to firm
4. Create tasks/interactions
5. Delete test records

### 8.3 Test Search

1. Search for firms by name
2. Search for contacts by email
3. Verify results are accurate

### 8.4 Test Outlook Integration

1. Connect Outlook account
2. Send test email
3. Wait 15 minutes for sync
4. Verify email appears in interactions

### 8.5 Test Bulk Email

1. Create distribution list
2. Add contacts
3. Send bulk email
4. Verify sends in Resend dashboard

## Step 9: Monitoring

### 9.1 Set Up Alerts

In Supabase:
1. Go to Settings → Alerts
2. Enable alerts for:
   - Database errors
   - Function errors
   - High CPU usage

### 9.2 Monitor Cron Jobs

```sql
-- Check cron job status
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;
```

### 9.3 Monitor Email Events

```sql
-- Check recent email events
SELECT 
  eo.subject,
  ee.type,
  COUNT(*) as count
FROM email_events ee
JOIN email_outbound eo ON ee.email_outbound_id = eo.id
WHERE ee.occurred_at > NOW() - INTERVAL '7 days'
GROUP BY eo.subject, ee.type
ORDER BY COUNT(*) DESC;
```

## Step 10: Backup Strategy

### 10.1 Enable Point-in-Time Recovery

In Supabase dashboard:
1. Go to Settings → Database
2. Enable "Point in Time Recovery"

### 10.2 Schedule Database Backups

```bash
# Daily backup script
pg_dump -h db.your-project.supabase.co \
  -U postgres \
  -d postgres \
  -F c \
  -f backup-$(date +%Y%m%d).dump
```

## Troubleshooting

### Issue: OAuth Token Expired

**Solution:**
```sql
-- Check token expiration
SELECT email_address, oauth_token_expires_at 
FROM mailboxes 
WHERE status = 'active';

-- If expired, user needs to reconnect
UPDATE mailboxes 
SET status = 'disconnected' 
WHERE oauth_token_expires_at < NOW();
```

### Issue: Import Errors

**Solution:**
```sql
-- Check staging errors
SELECT row_number, error_message 
FROM staging_accounts 
WHERE error_message IS NOT NULL;

-- Fix data and re-run import
UPDATE staging_accounts 
SET processed = FALSE, error_message = NULL 
WHERE id = X;
```

### Issue: Emails Not Syncing

**Solution:**
1. Check cron job is running: `SELECT * FROM cron.job_run_details`
2. Check mailbox status: `SELECT * FROM mailboxes WHERE status != 'active'`
3. Check function logs in Supabase dashboard

### Issue: Slow Queries

**Solution:**
```sql
-- Check for missing indexes
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('accounts', 'contacts', 'tasks');

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM accounts WHERE firm_name ILIKE '%test%';
```

## Security Checklist

- [ ] RLS policies enabled on all tables
- [ ] Service role key stored securely (not in frontend)
- [ ] OAuth secrets stored in Supabase secrets
- [ ] HTTPS enforced on all endpoints
- [ ] CORS configured correctly
- [ ] User divisions properly set
- [ ] API rate limiting configured
- [ ] Database backups enabled
- [ ] Monitoring and alerts configured

## Performance Optimization

### Database
- [ ] Indexes created on foreign keys
- [ ] GIN indexes for full-text search
- [ ] Tri-gram indexes for fuzzy search
- [ ] Vacuum and analyze scheduled

### Frontend
- [ ] Code splitting implemented
- [ ] Images optimized
- [ ] Lazy loading for tabs
- [ ] API responses cached where appropriate

### API
- [ ] Pagination on all list endpoints
- [ ] Response compression enabled
- [ ] Connection pooling configured

## Support

For issues or questions:
- Check logs in Supabase dashboard
- Review this guide
- Contact engineering team

---

**Last Updated:** 2025-11-03
**Version:** 1.0

