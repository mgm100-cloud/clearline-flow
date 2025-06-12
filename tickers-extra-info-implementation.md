# Tickers Extra Info Implementation

## Overview

This document describes the implementation of the `tickers_extra_info` table and its integration with the AlphaVantage API to automatically collect CIK and fiscal year-end information for each ticker added to the system.

## Database Schema

### New Table: `tickers_extra_info`

```sql
CREATE TABLE IF NOT EXISTS public.tickers_extra_info (
    id BIGSERIAL PRIMARY KEY,
    ticker_id UUID REFERENCES public.tickers(id) ON DELETE CASCADE,
    ticker VARCHAR(20) NOT NULL,
    cik VARCHAR(20),
    fiscal_year_end VARCHAR(5), -- Format: MM/DD
    cyq1_date VARCHAR(5), -- Format: MM/DD (Q1 end date)
    cyq2_date VARCHAR(5), -- Format: MM/DD (Q2 end date)
    cyq3_date VARCHAR(5), -- Format: MM/DD (Q3 end date)
    cyq4_date VARCHAR(5), -- Format: MM/DD (Q4 end date, same as fiscal_year_end)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(ticker_id)
);
```

### Key Features:
- **Foreign Key Relationship**: Links to the main `tickers` table via `ticker_id`
- **Cascade Delete**: When a ticker is deleted, its extra info is automatically removed
- **Unique Constraint**: Each ticker can only have one extra info record
- **CIK Storage**: Stores the SEC Central Index Key for the company
- **Fiscal Year-End**: Formatted as MM/DD (e.g., "12/31", "03/31")
- **CYQ Dates**: Automatically calculated quarterly end dates based on fiscal year-end, sorted chronologically
  - **CYQ1Date**: Earliest quarter end date in calendar year
  - **CYQ2Date**: Second quarter end date in calendar year
  - **CYQ3Date**: Third quarter end date in calendar year
  - **CYQ4Date**: Latest quarter end date in calendar year

## API Integration

### AlphaVantage Company Overview API

The system uses AlphaVantage's `OVERVIEW` function to fetch:
- **CIK**: Central Index Key from the SEC
- **FiscalYearEnd**: Company's fiscal year-end month

### Environment Variable Required

Add to your `.env` file:
```env
REACT_APP_ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here
```

## Data Processing

### Fiscal Year-End Formatting

The AlphaVantage API returns fiscal year-end as a month name (e.g., "December", "March"). The system converts this to MM/DD format:

- "December" → "12/31"
- "March" → "03/31" 
- "June" → "06/30"
- etc.

The day is automatically set to the last day of the specified month.

### CYQ Date Calculation

CYQ (Calendar Year Quarter) dates are automatically calculated based on the fiscal year-end and sorted chronologically:

**Example**: If fiscal year-end is "12/31" (December 31):
- Calculate quarters: 03/31, 06/30, 09/30, 12/31
- **CYQ1Date**: "03/31" (March 31 - earliest in calendar year)
- **CYQ2Date**: "06/30" (June 30)  
- **CYQ3Date**: "09/30" (September 30)
- **CYQ4Date**: "12/31" (December 31 - latest in calendar year)

**Example**: If fiscal year-end is "06/30" (June 30):
- Calculate quarters: 09/30, 12/31, 03/31, 06/30
- **CYQ1Date**: "03/31" (March 31 - earliest in calendar year)
- **CYQ2Date**: "06/30" (June 30)
- **CYQ3Date**: "09/30" (September 30)
- **CYQ4Date**: "12/31" (December 31 - latest in calendar year)

## Workflow Integration

### Automatic Data Collection

When a new ticker is added:

1. **Primary Ticker Creation**: The main ticker record is saved first
2. **AlphaVantage API Call**: System automatically calls AlphaVantage OVERVIEW function
3. **Data Processing**: CIK and fiscal year-end are extracted and formatted
4. **CYQ Date Calculation**: Quarterly end dates are automatically calculated from fiscal year-end
5. **Extra Info Storage**: All data (CIK, fiscal year-end, and CYQ dates) is saved to `tickers_extra_info` table
6. **Error Handling**: If API call fails, ticker creation still succeeds (extra info is optional)

### Code Implementation

The integration happens in the `addTicker` function in `src/App.js`:

```javascript
// Save to Supabase
const savedTicker = await DatabaseService.addTicker(newTicker);

// Try to fetch and save extra info from AlphaVantage
try {
  const alphaVantageData = await QuoteService.getCompanyOverviewFromAlphaVantage(capitalizedTickerData.ticker);
  
  if (alphaVantageData && (alphaVantageData.cik || alphaVantageData.fiscalYearEnd)) {
    const extraInfo = {
      tickerId: savedTicker.id,
      ticker: capitalizedTickerData.ticker,
      cik: alphaVantageData.cik,
      fiscalYearEnd: alphaVantageData.fiscalYearEnd,
      cyq1Date: alphaVantageData.cyq1Date,
      cyq2Date: alphaVantageData.cyq2Date,
      cyq3Date: alphaVantageData.cyq3Date,
      cyq4Date: alphaVantageData.cyq4Date
    };
    
    await DatabaseService.addTickerExtraInfo(extraInfo);
  }
} catch (error) {
  // Extra info failure doesn't prevent ticker creation
  console.error('Failed to fetch/save extra info:', error);
}
```

## Database Operations

### New DatabaseService Methods

- `getTickerExtraInfo(tickerId)`: Retrieve extra info for a specific ticker
- `addTickerExtraInfo(extraInfo)`: Add new extra info record
- `updateTickerExtraInfo(tickerId, updates)`: Update existing extra info
- `deleteTickerExtraInfo(tickerId)`: Delete extra info record

## Setup Instructions

### 1. Create/Update the Database Table

**For new installations:**
Run the SQL script in your Supabase SQL Editor:
```bash
# Execute the SQL in create-tickers-extra-info-table.sql
```

**For existing installations with tickers_extra_info table:**
Run the migration script to add the new CYQ columns:
```bash
# Execute the SQL in add-cyq-dates-to-tickers-extra-info.sql
```

### 2. Configure API Access

Add your AlphaVantage API key to your environment variables:
```env
REACT_APP_ALPHA_VANTAGE_API_KEY=your_actual_api_key_here
```

### 3. Deploy the Code Changes

The implementation includes:
- ✅ AlphaVantage API integration in `src/App.js`
- ✅ Database operations in `src/databaseService.js`
- ✅ Automatic data collection on ticker creation
- ✅ Error handling for API failures

## Benefits

1. **Automatic Data Collection**: No manual entry required for CIK, fiscal year-end, and quarterly dates
2. **SEC Integration Ready**: CIK enables integration with SEC filing systems
3. **Fiscal Year Tracking**: Complete quarterly calendar based on company's fiscal year
4. **Earnings Planning**: CYQ dates help track quarterly earnings schedules
5. **Minimal Performance Impact**: API calls happen asynchronously after ticker creation
6. **Failure Resilient**: Extra info failures don't prevent ticker creation

## Notes

- The extra info is collected automatically but is not required for ticker creation
- International stocks may not have CIK data (CIK is primarily for US companies)
- AlphaVantage has rate limits - the system handles API failures gracefully
- The fiscal year-end format (MM/DD) makes it easy to calculate quarter endings and fiscal periods
- CYQ dates provide a complete quarterly calendar for each company's specific fiscal year
- Quarterly dates are essential for earnings tracking, financial planning, and compliance monitoring 