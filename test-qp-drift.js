// Test script to verify QP drift values are being fetched correctly
// Run this with: node test-qp-drift.js
// Requires environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: 'public' },
  global: { headers: { 'Cache-Control': 'no-cache' } }
});

async function testQPDriftValues() {
  console.log('Testing QP Drift values from database...\n');
  
  // Test the same query the cron job uses
  const { data: earningsData, error: earningsError } = await supabase
    .from('earnings_tracking')
    .select(`
      id,
      ticker_id,
      quarter_end_date,
      qp_call_date,
      cyq,
      updated_at,
      tickers!ticker_id (
        ticker,
        analyst,
        status,
        qp_drift
      )
    `)
    .eq('tickers.status', 'Portfolio')
    .limit(10); // Just get first 10 for testing

  if (earningsError) {
    console.error('Error fetching earnings data:', earningsError);
    return;
  }

  console.log(`Found ${earningsData?.length || 0} earnings records\n`);

  // Show the QP drift values for each ticker
  earningsData?.forEach(row => {
    const ticker = row.tickers?.ticker;
    const qpDrift = row.tickers?.qp_drift;
    const quarterEndDate = row.quarter_end_date;
    
    console.log(`Ticker: ${ticker}`);
    console.log(`  QP Drift: ${qpDrift} days`);
    console.log(`  Quarter End: ${quarterEndDate}`);
    
    if (quarterEndDate && qpDrift !== undefined) {
      // Calculate QP Start Date the same way the cron does
      const qEndDate = new Date(quarterEndDate);
      const qpStartDate = new Date(qEndDate);
      qpStartDate.setDate(qEndDate.getDate() + qpDrift);
      console.log(`  QP Start: ${qpStartDate.toISOString().split('T')[0]}`);
    }
    console.log('');
  });

  // Check if any tickers have non-default QP drift values
  const nonDefaultDrift = earningsData?.filter(row => 
    row.tickers?.qp_drift !== null && row.tickers?.qp_drift !== -14
  );
  
  if (nonDefaultDrift?.length > 0) {
    console.log(`✅ SUCCESS: Found ${nonDefaultDrift.length} tickers with custom QP drift values:`);
    nonDefaultDrift.forEach(row => {
      console.log(`  ${row.tickers.ticker}: ${row.tickers.qp_drift} days`);
    });
  } else {
    console.log(`⚠️  All tickers are using default -14 day QP drift`);
  }
}

testQPDriftValues().catch(console.error);
