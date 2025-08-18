// Test script to check earnings data loading
const { createClient } = require('@supabase/supabase-js');

// You'll need to set these environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testEarningsData() {
  try {
    console.log('🔍 Testing earnings data loading...');
    
    // Test 1: Check if earnings_tracking table exists and has data
    console.log('\n📊 Test 1: Checking earnings_tracking table...');
    const { data: earningsData, error: earningsError } = await supabase
      .from('earnings_tracking')
      .select('*')
      .limit(5);
    
    if (earningsError) {
      console.error('❌ Error loading earnings data:', earningsError);
    } else {
      console.log('✅ Earnings data loaded successfully');
      console.log('📊 Sample earnings data:', earningsData);
      console.log('📊 Total earnings records:', earningsData.length);
    }
    
    // Test 2: Check tickers table
    console.log('\n📊 Test 2: Checking tickers table...');
    const { data: tickersData, error: tickersError } = await supabase
      .from('tickers')
      .select('ticker, status, analyst')
      .eq('status', 'Portfolio')
      .limit(5);
    
    if (tickersError) {
      console.error('❌ Error loading tickers data:', tickersError);
    } else {
      console.log('✅ Tickers data loaded successfully');
      console.log('📊 Portfolio tickers:', tickersData);
      console.log('📊 Total portfolio tickers:', tickersData.length);
    }
    
    // Test 3: Check if there are any earnings records for portfolio tickers
    if (tickersData && tickersData.length > 0 && earningsData && earningsData.length > 0) {
      console.log('\n📊 Test 3: Checking earnings for portfolio tickers...');
      const portfolioTickers = tickersData.map(t => t.ticker);
      const portfolioEarnings = earningsData.filter(e => portfolioTickers.includes(e.ticker));
      
      console.log('📊 Portfolio tickers with earnings:', portfolioEarnings.length);
      console.log('📊 Sample portfolio earnings:', portfolioEarnings.slice(0, 3));
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testEarningsData();

