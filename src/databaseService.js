import { supabase } from './supabaseClient'

// Helper functions to convert between camelCase and snake_case
const toSnakeCase = (str) => {
  // Handle special cases first
  const specialCases = {
    'adv3Month': 'adv_3_month',
    'ptBear': 'pt_bear',
    'ptBase': 'pt_base', 
    'ptBull': 'pt_bull',
    'dateIn': 'date_in',
    'pokeDate': 'poke_date',
    'lsPosition': 'ls_position',
    'inputPrice': 'input_price',
    'currentPrice': 'current_price',
    'marketCap': 'market_cap',
    'catalystDate': 'catalyst_date',
    'valueOrGrowth': 'value_or_growth',
    'maTargetBuyer': 'ma_target_buyer',
    'maTargetValuation': 'ma_target_valuation',
    'maTargetSeller': 'ma_target_seller',
    'bigMoveRevert': 'big_move_revert',
    'activistPotential': 'activist_potential',
    'insiderTradeSignal': 'insider_trade_signal',
    'newMgmt': 'new_mgmt',
    'bigAcq': 'big_acq',
    'fraudRisk': 'fraud_risk',
    'regulatoryRisk': 'regulatory_risk',
    'nonCyclical': 'non_cyclical',
    'highBeta': 'high_beta',
    'selfHelp': 'self_help',
    'rateExposure': 'rate_exposure',
    'strongDollar': 'strong_dollar',
    'extremeValuation': 'extreme_valuation',
    'crapco': 'crapco',
    'aiWinner': 'ai_winner',
    'aiLoser': 'ai_loser',
    'tariffWinner': 'tariff_winner',
    'tariffLoser': 'tariff_loser',
    'trumpWinner': 'trump_winner',
    'trumpLoser': 'trump_loser',
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
    'dateEntered': 'date_entered',
    'dateClosed': 'date_closed',
    'isOpen': 'is_open',
    'tickerId': 'ticker_id',
    'fiscalYearEnd': 'fiscal_year_end',
    'cyq1Date': 'cyq1_date',
    'cyq2Date': 'cyq2_date',
    'cyq3Date': 'cyq3_date',
    'cyq4Date': 'cyq4_date',
    'tradeRec': 'trade_rec',
    'tradeLevel': 'trade_level',
    'earningsDate': 'earnings_date',
    'qpCallDate': 'qp_call_date',
    'previewDate': 'preview_date',
    'callbackDate': 'callback_date',
    'irName': 'ir_name',
    'irEmail': 'ir_email'
  };
  
  if (specialCases[str]) {
    return specialCases[str];
  }
  
  // Default conversion for other cases
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
};

const toCamelCase = (str) => {
  // Handle special cases first
  const specialCases = {
    'adv_3_month': 'adv3Month',
    'pt_bear': 'ptBear',
    'pt_base': 'ptBase',
    'pt_bull': 'ptBull',
    'date_in': 'dateIn',
    'poke_date': 'pokeDate',
    'ls_position': 'lsPosition',
    'input_price': 'inputPrice',
    'current_price': 'currentPrice',
    'market_cap': 'marketCap',
    'catalyst_date': 'catalystDate',
    'value_or_growth': 'valueOrGrowth',
    'ma_target_buyer': 'maTargetBuyer',
    'ma_target_valuation': 'maTargetValuation',
    'ma_target_seller': 'maTargetSeller',
    'big_move_revert': 'bigMoveRevert',
    'activist_potential': 'activistPotential',
    'insider_trade_signal': 'insiderTradeSignal',
    'new_mgmt': 'newMgmt',
    'big_acq': 'bigAcq',
    'fraud_risk': 'fraudRisk',
    'regulatory_risk': 'regulatoryRisk',
    'non_cyclical': 'nonCyclical',
    'high_beta': 'highBeta',
    'self_help': 'selfHelp',
    'rate_exposure': 'rateExposure',
    'strong_dollar': 'strongDollar',
    'extreme_valuation': 'extremeValuation',
    'crapco': 'crapco',
    'ai_winner': 'aiWinner',
    'ai_loser': 'aiLoser',
    'tariff_winner': 'tariffWinner',
    'tariff_loser': 'tariffLoser',
    'trump_winner': 'trumpWinner',
    'trump_loser': 'trumpLoser',
    'created_at': 'createdAt',
    'updated_at': 'updatedAt',
    'date_entered': 'dateEntered',
    'date_closed': 'dateClosed',
    'is_open': 'isOpen',
    'ticker_id': 'tickerId',
    'fiscal_year_end': 'fiscalYearEnd',
    'cyq1_date': 'cyq1Date',
    'cyq2_date': 'cyq2Date',
    'cyq3_date': 'cyq3Date',
    'cyq4_date': 'cyq4Date',
    'trade_rec': 'tradeRec',
    'trade_level': 'tradeLevel',
    'earnings_date': 'earningsDate',
    'qp_call_date': 'qpCallDate',
    'preview_date': 'previewDate',
    'callback_date': 'callbackDate',
    'ir_name': 'irName',
    'ir_email': 'irEmail'
  };
  
  if (specialCases[str]) {
    return specialCases[str];
  }
  
  // Default conversion for other cases
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
};

// Clean data for database insertion
const cleanDataForDb = (obj) => {
  const cleaned = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Convert empty strings to null for date fields
    if (['catalystDate', 'catalyst_date', 'earningsDate', 'earnings_date', 'qpCallDate', 'qp_call_date', 'previewDate', 'preview_date', 'callbackDate', 'callback_date'].includes(key)) {
      cleaned[key] = value === '' ? null : value;
    }
    // Convert empty strings to null for numeric fields
    else if (['inputPrice', 'currentPrice', 'marketCap', 'adv3Month', 'ptBear', 'ptBase', 'ptBull', 'tradeLevel',
              'input_price', 'current_price', 'market_cap', 'adv_3_month', 'pt_bear', 'pt_base', 'pt_bull', 'trade_level'].includes(key)) {
      cleaned[key] = value === '' ? null : value;
    }
    // Convert empty strings to null for other optional fields
    else if (['source', 'valueOrGrowth', 'value_or_growth', 'tradeRec', 'trade_rec', 'irName', 'ir_name', 'irEmail', 'ir_email'].includes(key)) {
      cleaned[key] = value === '' ? null : value;
    }
    else {
      cleaned[key] = value;
    }
  }
  
  return cleaned;
};

// Convert object keys from camelCase to snake_case for database
const convertToDbFormat = (obj) => {
  const cleaned = cleanDataForDb(obj);
  const converted = {};
  for (const [key, value] of Object.entries(cleaned)) {
    const snakeKey = toSnakeCase(key);
    converted[snakeKey] = value;
  }
  return converted;
};

// Convert object keys from snake_case to camelCase for JavaScript
const convertFromDbFormat = (obj) => {
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);
    converted[camelKey] = value;
  }
  return converted;
};

export const DatabaseService = {
  // Ticker operations
  async getTickers() {
    try {
      const { data, error } = await supabase
        .from('tickers')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      // Convert snake_case to camelCase for JavaScript
      return (data || []).map(convertFromDbFormat);
    } catch (error) {
      console.error('Error fetching tickers:', error)
      throw error
    }
  },

  async addTicker(ticker) {
    try {
      // Convert camelCase to snake_case for database
      const dbTicker = convertToDbFormat(ticker);
      
      const { data, error } = await supabase
        .from('tickers')
        .insert([dbTicker])
        .select()
      
      if (error) throw error
      
      // Convert back to camelCase for JavaScript
      return convertFromDbFormat(data[0]);
    } catch (error) {
      console.error('Error adding ticker:', error)
      throw error
    }
  },

  async updateTicker(id, updates) {
    try {
      // Convert camelCase to snake_case for database
      const dbUpdates = convertToDbFormat(updates);
      
      const { data, error } = await supabase
        .from('tickers')
        .update(dbUpdates)
        .eq('id', id)
        .select()
      
      if (error) throw error
      
      // Convert back to camelCase for JavaScript
      return convertFromDbFormat(data[0]);
    } catch (error) {
      console.error('Error updating ticker:', error)
      throw error
    }
  },

  async deleteTicker(id) {
    try {
      const { error } = await supabase
        .from('tickers')
        .delete()
        .eq('id', id)
      
      if (error) throw error
    } catch (error) {
      console.error('Error deleting ticker:', error)
      throw error
    }
  },

  // Earnings data operations
  async getEarningsData() {
    try {
      let allData = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('earnings_tracking')
          .select(`
            *,
            tickers!ticker_id (
              ticker
            )
          `)
          .range(from, from + pageSize - 1)
        
        if (error) throw error
        
        if (data && data.length > 0) {
          allData = allData.concat(data);
          
          // If we got less than pageSize records, we've reached the end
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            from += pageSize;
          }
        } else {
          hasMore = false;
        }
      }
      
      // Convert snake_case to camelCase and flatten ticker data
      const processedData = allData.map(item => {
        const converted = convertFromDbFormat(item);
        // Add ticker symbol from the joined tickers table
        if (item.tickers) {
          converted.ticker = item.tickers.ticker;
        }
        return converted;
      });
      
      return processedData;
    } catch (error) {
      console.error('Error fetching earnings data:', error)
      throw error
    }
  },

  async upsertEarningsData(ticker, cyq, updates) {
    try {
      // First, find the ticker's ID from the tickers table
      const { data: tickerData, error: tickerError } = await supabase
        .from('tickers')
        .select('id')
        .eq('ticker', ticker)
        .single()
      
      if (tickerError) {
        console.error('Error finding ticker:', tickerError)
        throw new Error(`Ticker ${ticker} not found in database`)
      }
      
      // Prepare data for database with correct foreign key
      const dataForDb = {
        ticker_id: tickerData.id,  // Use the actual ID from tickers table
        cyq,
        ...updates,
        updated_at: new Date().toISOString()
      };
      
      // Convert camelCase to snake_case for database
      const dbUpdates = convertToDbFormat(dataForDb);
      
      const { data, error } = await supabase
        .from('earnings_tracking')
        .upsert([dbUpdates], {
          onConflict: 'ticker_id,cyq'
        })
        .select()
      
      if (error) throw error
      
      // Convert back to camelCase for JavaScript
      return convertFromDbFormat(data[0]);
    } catch (error) {
      console.error('Error upserting earnings data:', error)
      throw error
    }
  },

  // Todo operations
  async getTodos() {
    try {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('date_entered', { ascending: false })
      
      if (error) throw error
      
      // Convert snake_case to camelCase for JavaScript
      return (data || []).map(convertFromDbFormat);
    } catch (error) {
      console.error('Error fetching todos:', error)
      throw error
    }
  },

  async addTodo(todo) {
    try {
      // Convert camelCase to snake_case for database
      const dbTodo = convertToDbFormat(todo);
      
      const { data, error } = await supabase
        .from('todos')
        .insert([dbTodo])
        .select()
      
      if (error) throw error
      
      // Convert back to camelCase for JavaScript
      return convertFromDbFormat(data[0]);
    } catch (error) {
      console.error('Error adding todo:', error)
      throw error
    }
  },

  async updateTodo(id, updates) {
    try {
      // Convert camelCase to snake_case for database
      const dbUpdates = convertToDbFormat(updates);
      dbUpdates.updated_at = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('todos')
        .update(dbUpdates)
        .eq('id', id)
        .select()
      
      if (error) throw error
      
      // Convert back to camelCase for JavaScript
      return convertFromDbFormat(data[0]);
    } catch (error) {
      console.error('Error updating todo:', error)
      throw error
    }
  },

  async deleteTodo(id) {
    try {
      const { error } = await supabase
        .from('todos')
        .delete()
        .eq('id', id)
      
      if (error) throw error
    } catch (error) {
      console.error('Error deleting todo:', error)
      throw error
    }
  },

  // Ticker extra info operations
  async getTickerExtraInfo(tickerId) {
    try {
      const { data, error } = await supabase
        .from('tickers_extra_info')
        .select('*')
        .eq('ticker_id', tickerId)
        .single()
      
      if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
        throw error
      }
      
      // Convert snake_case to camelCase for JavaScript
      return data ? convertFromDbFormat(data) : null;
    } catch (error) {
      console.error('Error fetching ticker extra info:', error)
      throw error
    }
  },

  async addTickerExtraInfo(tickerExtraInfo) {
    try {
      // Convert camelCase to snake_case for database
      const dbTickerExtraInfo = convertToDbFormat(tickerExtraInfo);
      
      const { data, error } = await supabase
        .from('tickers_extra_info')
        .insert([dbTickerExtraInfo])
        .select()
      
      if (error) throw error
      
      // Convert back to camelCase for JavaScript
      return convertFromDbFormat(data[0]);
    } catch (error) {
      console.error('Error adding ticker extra info:', error)
      throw error
    }
  },

  async updateTickerExtraInfo(tickerId, updates) {
    try {
      // Convert camelCase to snake_case for database
      const dbUpdates = convertToDbFormat(updates);
      dbUpdates.updated_at = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('tickers_extra_info')
        .update(dbUpdates)
        .eq('ticker_id', tickerId)
        .select()
      
      if (error) throw error
      
      // Convert back to camelCase for JavaScript
      return convertFromDbFormat(data[0]);
    } catch (error) {
      console.error('Error updating ticker extra info:', error)
      throw error
    }
  },

  async deleteTickerExtraInfo(tickerId) {
    try {
      const { error } = await supabase
        .from('tickers_extra_info')
        .delete()
        .eq('ticker_id', tickerId)
      
      if (error) throw error
    } catch (error) {
      console.error('Error deleting ticker extra info:', error)
      throw error
    }
  },

  // Get current user's analyst code from user_profiles table
  async getCurrentUserAnalystCode() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user');
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('analyst_code')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      
      return data?.analyst_code || '';
    } catch (error) {
      console.error('Error fetching current user analyst code:', error);
      return '';
    }
  },

  // Get analysts list - use database function to bypass RLS and get all analyst codes
  async getAnalysts() {
    try {
      const { data, error } = await supabase
        .rpc('get_all_analyst_codes')
      
      if (error) throw error
      
      // Extract analyst codes from the returned rows
      const uniqueAnalysts = data.map(row => row.analyst_code).filter(Boolean);
      
      console.log('✅ Fetched analysts using database function:', uniqueAnalysts);
      return uniqueAnalysts;
    } catch (error) {
      console.error('Error fetching analysts using database function:', error);
      
      // Fallback to hardcoded list if database query fails
      const fallbackAnalysts = ['LT', 'GA', 'DP', 'MS', 'DO', 'MM'];
      console.warn('⚠️ Using fallback analysts list:', fallbackAnalysts);
      return fallbackAnalysts;
    }
  },

  // Get all analysts for email recipients
  async getAnalystEmails() {
    try {
      const { data, error } = await supabase
        .from('analysts')
        .select('full_name, initials, email')
        .eq('active', true)
        .order('full_name');
      
      if (error) throw error;
      
      // Transform to match expected format
      const transformedData = data.map(analyst => ({
        name: analyst.full_name,
        email: analyst.email,
        analyst_code: analyst.initials
      }));
      
      console.log('✅ Fetched analyst emails from analysts table:', transformedData);
      return transformedData || [];
    } catch (error) {
      console.error('Error fetching analyst emails:', error);
      
      // Fallback to hardcoded list based on existing analyst codes
      const fallbackEmails = [
        { name: 'Marc Majzner', email: 'mmajzner@clearlinecap.com', analyst_code: 'MM' },
        { name: 'Luis Torres', email: 'ltorres@clearlinecap.com', analyst_code: 'LT' },
        { name: 'Greg Anderson', email: 'ganderson@clearlinecap.com', analyst_code: 'GA' },
        { name: 'David Paul', email: 'dpaul@clearlinecap.com', analyst_code: 'DP' },
        { name: 'Michael Siegel', email: 'msiegel@clearlinecap.com', analyst_code: 'MS' },
        { name: 'Dan O\'Brien', email: 'dobrien@clearlinecap.com', analyst_code: 'DO' }
      ];
      console.warn('⚠️ Using fallback analyst emails list:', fallbackEmails);
      return fallbackEmails;
    }
  }
} 