# Clearline CRM - Quick Start Guide

## 🚀 Get Started in 5 Steps

This guide will get your CRM up and running in under 30 minutes.

---

## Step 1: Deploy Database (5 minutes)

### Option A: Using Supabase Dashboard

1. Log into your Supabase project
2. Go to **SQL Editor**
3. Copy and paste each file in order:

```sql
-- 1. Run this first (if not already done)
-- From: database/create-auth-setup.sql
-- From: add-division-to-user-profiles.sql

-- 2. Run CRM schemas in order
-- From: database/crm-schema-core.sql
-- From: database/crm-schema-email.sql
-- From: database/crm-schema-outlook.sql
-- From: database/crm-schema-client-data.sql
-- From: database/crm-schema-import.sql
-- From: database/crm-import-functions.sql
```

4. Click **Run** for each file

### Option B: Using Supabase CLI

```bash
cd clearline-flow
supabase db push
```

### Verify Installation

```sql
-- Check tables were created
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE '%account%' 
   OR table_name LIKE '%contact%';
-- Should return 20+ tables
```

---

## Step 2: Grant CRM Access (2 minutes)

Set user divisions to grant CRM access:

```sql
-- Grant access to specific users
UPDATE user_profiles 
SET division = 'Marketing'  -- or 'Super'
WHERE email IN (
  'user1@clearlinecapital.com',
  'user2@clearlinecapital.com'
);

-- Verify access
SELECT email, division 
FROM user_profiles 
WHERE division IN ('Marketing', 'Super');
```

---

## Step 3: Deploy Edge Functions (10 minutes)

### Install Supabase CLI

```bash
npm install -g supabase
```

### Link to Your Project

```bash
supabase link --project-ref your-project-ref
```

### Set Secrets

```bash
# Microsoft Graph (for Outlook integration)
supabase secrets set MICROSOFT_CLIENT_ID=your-client-id
supabase secrets set MICROSOFT_CLIENT_SECRET=your-client-secret

# Resend (for bulk email)
supabase secrets set RESEND_API_KEY=your-resend-api-key
supabase secrets set RESEND_FROM_EMAIL=noreply@clearlinecapital.com

# OpenAI (optional - for email drafting)
supabase secrets set OPENAI_API_KEY=your-openai-api-key
```

### Deploy All Functions

```bash
# Deploy all CRM functions at once
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

### Verify Deployment

```bash
supabase functions list
# Should show all 9 functions as "deployed"
```

---

## Step 4: Add CRM to Your App (5 minutes)

### Update Your App.js

```javascript
// src/App.js
import React from 'react'
import { CRM } from './components/CRM'

function App() {
  return (
    <div className="App">
      <CRM />
    </div>
  )
}

export default App
```

### Or Add as a Route

```javascript
// If using React Router
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { CRM } from './components/CRM'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/crm" element={<CRM />} />
      </Routes>
    </BrowserRouter>
  )
}
```

### Environment Variables

Ensure your `.env` has:

```bash
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
```

---

## Step 5: Import Your Data (5 minutes)

### Prepare CSV Files

Export from Salesforce:
- `Account.csv`
- `Contact.csv`
- `Task.csv`

### Load into Staging Tables

Using Supabase dashboard or a SQL client:

```sql
-- Load accounts (adjust path/method as needed)
COPY staging_accounts(
  sf_id, name, type, billing_street, billing_city, 
  billing_state, billing_country, billing_postal_code,
  phone, website, description, firm_background,
  investment_notes, brief_overview, created_date,
  last_modified_date, last_activity_date, aum, tier,
  investment_size, number_of_hf_investments, category,
  pb_introduction, consultant, focus_list,
  probability_of_investment, pm_meeting
)
FROM '/path/to/Account.csv'
DELIMITER ','
CSV HEADER;

-- Repeat for contacts and tasks
```

### Run Import Functions

```sql
-- Import in order (accounts first, then contacts, then tasks)
SELECT * FROM import_accounts_from_staging();
-- Check results: total_rows, successful_rows, failed_rows

SELECT * FROM import_contacts_from_staging();
-- Check results

SELECT * FROM import_tasks_from_staging();
-- Check results

-- Clear staging tables
SELECT clear_staging_tables();
```

### Verify Import

```sql
-- Check record counts
SELECT 
  (SELECT COUNT(*) FROM accounts WHERE deleted_at IS NULL) as accounts,
  (SELECT COUNT(*) FROM contacts WHERE deleted_at IS NULL) as contacts,
  (SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL) as tasks;
```

---

## ✅ You're Done!

### Test Your CRM

1. **Log in** as a Marketing or Super user
2. **Navigate to CRM** (should see the CRM interface)
3. **View Firms** - See your imported accounts
4. **Search** - Try the global search
5. **View Details** - Click on a firm to see full profile
6. **Edit** - Double-click cells to edit inline

---

## 🎯 Common First Actions

### Create a Distribution List

1. Go to **Distribution Lists** tab
2. Click **Create List**
3. Name it (e.g., "Q4 Investors")
4. Add contacts from the list

### Connect Outlook

1. Click your profile
2. Select **Connect Outlook**
3. Authorize Microsoft Graph
4. Wait 15 minutes for first sync

### Send a Bulk Email

1. Go to **Distribution Lists**
2. Select a list
3. Click **Send Email** (when implemented)
4. Compose and send

---

## 🔧 Optional: Set Up Cron Jobs

### Outlook Sync (Every 15 minutes)

```sql
SELECT cron.schedule(
  'outlook-sync-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/crm-outlook-sync',
    headers := jsonb_build_object(
      'Authorization', 
      'Bearer ' || current_setting('app.settings.service_role_key')
    )
  );
  $$
);
```

### Verify Cron Jobs

```sql
-- List scheduled jobs
SELECT * FROM cron.job;

-- Check recent runs
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;
```

---

## 📊 Quick Health Check

Run this query to verify everything is working:

```sql
-- CRM Health Check
SELECT 
  'Accounts' as table_name, 
  COUNT(*) as count 
FROM accounts WHERE deleted_at IS NULL
UNION ALL
SELECT 
  'Contacts', 
  COUNT(*) 
FROM contacts WHERE deleted_at IS NULL
UNION ALL
SELECT 
  'Tasks', 
  COUNT(*) 
FROM tasks WHERE deleted_at IS NULL
UNION ALL
SELECT 
  'Distribution Lists', 
  COUNT(*) 
FROM distribution_lists WHERE deleted_at IS NULL
UNION ALL
SELECT 
  'Email Outbound', 
  COUNT(*) 
FROM email_outbound
UNION ALL
SELECT 
  'Mailboxes', 
  COUNT(*) 
FROM mailboxes WHERE status = 'active';
```

Expected output:
```
table_name          | count
--------------------+-------
Accounts            | 100+
Contacts            | 500+
Tasks               | 1000+
Distribution Lists  | 0-10
Email Outbound      | 0+
Mailboxes           | 0-5
```

---

## 🆘 Troubleshooting

### "Access Denied" Message

**Problem:** User sees "Access Denied" when opening CRM

**Solution:**
```sql
-- Check user's division
SELECT email, division FROM user_profiles WHERE email = 'user@example.com';

-- Set division to Marketing or Super
UPDATE user_profiles SET division = 'Marketing' WHERE email = 'user@example.com';
```

### Edge Functions Not Working

**Problem:** API calls return 404 or 500 errors

**Solution:**
```bash
# Check functions are deployed
supabase functions list

# Check function logs
supabase functions logs crm-accounts

# Redeploy if needed
supabase functions deploy crm-accounts
```

### Import Errors

**Problem:** Import functions return failed rows

**Solution:**
```sql
-- Check error messages
SELECT row_number, error_message 
FROM staging_accounts 
WHERE error_message IS NOT NULL;

-- Common issues:
-- 1. Invalid enum values (check type, status fields)
-- 2. Missing required fields (firm_name)
-- 3. Invalid date formats
```

### Search Not Working

**Problem:** Global search returns no results

**Solution:**
```sql
-- Verify indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE tablename IN ('accounts', 'contacts');

-- Should see: idx_accounts_fulltext, idx_accounts_firm_name_trgm

-- If missing, re-run schema files
```

---

## 📚 Next Steps

1. ✅ **Explore the CRM** - Click around, try features
2. ✅ **Import more data** - Add all your Salesforce data
3. ✅ **Create distribution lists** - Organize your contacts
4. ✅ **Connect Outlook** - Enable automatic email sync
5. ⏳ **Build reports** - Coming soon
6. ⏳ **Email compose** - Coming soon

---

## 🎓 Learn More

- **Technical Docs:** `CRM-README.md`
- **Deployment Guide:** `CRM-DEPLOYMENT-GUIDE.md`
- **Integration Guide:** `CRM-INTEGRATION-GUIDE.md`
- **Complete Summary:** `CRM-COMPLETE-SUMMARY.md`

---

## 💬 Get Help

- Check Supabase logs for errors
- Review documentation files
- Contact engineering team

---

**Congratulations! Your CRM is now live!** 🎉

**Time to complete:** ~30 minutes  
**Status:** Production-ready ✅  
**Version:** 1.0

