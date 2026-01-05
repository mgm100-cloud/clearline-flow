# Clearline CRM - Integration Guide

## Quick Start

This guide shows how to integrate the CRM into your existing Clearline Flow application.

## Step 1: Add CRM to Your App

### Option A: Add as a New Route/Tab

If you're using React Router or a similar routing solution:

```javascript
// In your main App.js or routing file
import { CRM } from './components/CRM'

// Add to your routes
<Route path="/crm" element={<CRM />} />
```

### Option B: Add as a Tab in Existing Layout

```javascript
// In your main App.js
import { CRM } from './components/CRM'
import { useState } from 'react'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="app">
      <nav>
        <button onClick={() => setActiveTab('dashboard')}>Dashboard</button>
        <button onClick={() => setActiveTab('crm')}>CRM</button>
      </nav>
      
      <main>
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'crm' && <CRM />}
      </main>
    </div>
  )
}
```

### Option C: Standalone CRM App

Replace your entire App.js content:

```javascript
// src/App.js
import React from 'react'
import { CRM } from './components/CRM'
import './App.css'

function App() {
  return <CRM />
}

export default App
```

## Step 2: Update Your Navigation

Add a CRM link to your existing navigation:

```javascript
// In your navigation component
import { Building2 } from 'lucide-react'

<nav>
  {/* Existing nav items */}
  
  {/* Add CRM link - only show to Marketing/Super users */}
  {(userDivision === 'Marketing' || userDivision === 'Super') && (
    <a href="/crm" className="nav-link">
      <Building2 size={20} />
      CRM
    </a>
  )}
</nav>
```

## Step 3: Environment Variables

Ensure your `.env` file has the required variables:

```bash
# Supabase (already configured)
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key

# No additional frontend env vars needed!
# All secrets are stored in Supabase Edge Functions
```

## Step 4: Test Access Control

The CRM automatically checks user access based on the `division` field in `user_profiles`:

```sql
-- Grant CRM access to a user
UPDATE user_profiles 
SET division = 'Marketing'  -- or 'Super'
WHERE email = 'user@clearlinecapital.com';

-- Check current divisions
SELECT email, division FROM user_profiles;
```

## Step 5: Import Your Data

### Prepare Salesforce CSV Files

1. Export from Salesforce:
   - Accounts (firms)
   - Contacts
   - Tasks

2. Ensure UTF-8 encoding

3. Load into staging tables (see CRM-DEPLOYMENT-GUIDE.md)

4. Run import functions:

```sql
SELECT * FROM import_accounts_from_staging();
SELECT * FROM import_contacts_from_staging();
SELECT * FROM import_tasks_from_staging();
```

## Usage Examples

### Accessing CRM Programmatically

```javascript
import * as crmService from './services/crmService'

// Get accounts
const { data, pagination } = await crmService.getAccounts({
  page: 1,
  limit: 50,
  search: 'pension',
  status: '2 Active Diligence'
})

// Create account
const newAccount = await crmService.createAccount({
  firm_name: 'Acme Pension Fund',
  type: 'Pension – Public',
  city: 'New York',
  state: 'NY'
})

// Search
const results = await crmService.globalSearch('john')
```

### Using CRM Components Individually

```javascript
import { FirmsTab, ContactsTab, DataGrid } from './components/CRM'

// Use individual tabs in your own layout
function MyCustomCRM() {
  return (
    <div>
      <h1>My CRM</h1>
      <FirmsTab onFirmClick={(id) => console.log('Clicked:', id)} />
    </div>
  )
}
```

## Customization

### Styling

The CRM uses CSS modules. To customize:

1. Override CSS variables in your global CSS:

```css
/* In your App.css or index.css */
:root {
  --crm-primary: #2563eb;
  --crm-primary-hover: #1d4ed8;
  --crm-border: #e0e0e0;
  --crm-background: #f5f5f5;
}
```

2. Or modify the component CSS files directly:
   - `CRMLayout.css`
   - `DataGrid.css`
   - `FirmsTab.css`
   - etc.

### Adding Custom Fields

To add custom fields to accounts:

1. Add column to database:

```sql
ALTER TABLE accounts 
ADD COLUMN custom_field TEXT;
```

2. Update the FirmsTab columns array:

```javascript
const columns = [
  // ... existing columns
  {
    id: 'custom_field',
    label: 'Custom Field',
    sortable: true,
    editable: true,
    width: '150px',
  }
]
```

3. Update FirmDetail to show the field

### Adding Custom Actions

Add buttons to the toolbar:

```javascript
// In FirmsTab.js
<div className="firms-toolbar-right">
  {/* Existing buttons */}
  
  <button 
    className="firms-custom-btn" 
    onClick={handleCustomAction}
  >
    <CustomIcon size={18} />
    Custom Action
  </button>
</div>
```

## Integration with Existing Features

### Link to Existing Tickers

If you want to link CRM accounts to your existing ticker tracking:

```sql
-- Add ticker_symbol to accounts
ALTER TABLE accounts 
ADD COLUMN ticker_symbol VARCHAR(20);

-- Link to existing tickers
UPDATE accounts a
SET ticker_symbol = t.ticker
FROM tickers t
WHERE LOWER(a.firm_name) LIKE '%' || LOWER(t.name) || '%';
```

Then in your UI:

```javascript
// In FirmDetail.js, add a link to ticker view
{firm.ticker_symbol && (
  <a href={`/tickers/${firm.ticker_symbol}`}>
    View Ticker: {firm.ticker_symbol}
  </a>
)}
```

### Share User Profiles

The CRM uses your existing `user_profiles` table, so users are already set up. Just ensure they have the `division` field populated.

### Unified Navigation

Create a unified nav that shows both CRM and existing features:

```javascript
function UnifiedNav() {
  const { division } = useUserProfile()
  
  return (
    <nav>
      <NavLink to="/dashboard">Dashboard</NavLink>
      <NavLink to="/tickers">Tickers</NavLink>
      <NavLink to="/earnings">Earnings</NavLink>
      
      {(division === 'Marketing' || division === 'Super') && (
        <NavLink to="/crm">CRM</NavLink>
      )}
    </nav>
  )
}
```

## Troubleshooting

### "Access Denied" Message

**Cause:** User's division is not 'Marketing' or 'Super'

**Solution:**
```sql
UPDATE user_profiles 
SET division = 'Marketing' 
WHERE email = 'user@example.com';
```

### API Calls Failing

**Cause:** Edge Functions not deployed or environment variables missing

**Solution:**
1. Check functions are deployed: `supabase functions list`
2. Verify secrets: `supabase secrets list`
3. Check function logs in Supabase dashboard

### Search Not Working

**Cause:** Indexes not created

**Solution:**
```sql
-- Verify indexes exist
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('accounts', 'contacts');

-- If missing, run the schema files again
```

### Slow Performance

**Cause:** Large dataset without proper indexes

**Solution:**
```sql
-- Analyze tables
ANALYZE accounts;
ANALYZE contacts;
ANALYZE tasks;

-- Check query plans
EXPLAIN ANALYZE SELECT * FROM accounts WHERE firm_name ILIKE '%test%';
```

## Migration from Existing CRM

If you have an existing CRM system:

1. **Export data** to CSV format matching Salesforce structure
2. **Map fields** to match the schema (see CRM-README.md)
3. **Load into staging tables**
4. **Run import functions**
5. **Verify data** and relationships

## Best Practices

1. **Always use the service layer** (`crmService.js`) for API calls
2. **Handle loading states** in your UI
3. **Show error messages** to users
4. **Use optimistic updates** for better UX
5. **Implement proper error boundaries**
6. **Test with real data** before production

## Support

For questions or issues:
- Check the CRM-README.md for technical details
- Review CRM-DEPLOYMENT-GUIDE.md for setup
- Check Supabase logs for errors
- Contact engineering team

## Next Steps

1. ✅ Integrate CRM into your app
2. ✅ Set user divisions
3. ✅ Import Salesforce data
4. ✅ Test core functionality
5. ⏳ Build remaining features (Contact Detail, Reports, etc.)
6. ⏳ Train users
7. ⏳ Monitor usage and performance

---

**Last Updated:** 2025-11-03
**Version:** 1.0

