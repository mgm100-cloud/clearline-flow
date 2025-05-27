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
    'createdAt': 'created_at',
    'updatedAt': 'updated_at'
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
    'created_at': 'createdAt',
    'updated_at': 'updatedAt'
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
    if (key === 'catalystDate' || key === 'catalyst_date') {
      cleaned[key] = value === '' ? null : value;
    }
    // Convert empty strings to null for numeric fields
    else if (['inputPrice', 'currentPrice', 'marketCap', 'adv3Month', 'ptBear', 'ptBase', 'ptBull',
              'input_price', 'current_price', 'market_cap', 'adv_3_month', 'pt_bear', 'pt_base', 'pt_bull'].includes(key)) {
      cleaned[key] = value === '' ? null : value;
    }
    // Convert empty strings to null for other optional fields
    else if (['source', 'valueOrGrowth', 'value_or_growth'].includes(key)) {
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
      const { data, error } = await supabase
        .from('earnings_tracking')
        .select('*')
      
      if (error) throw error
      
      // Convert snake_case to camelCase for JavaScript
      return (data || []).map(convertFromDbFormat);
    } catch (error) {
      console.error('Error fetching earnings data:', error)
      throw error
    }
  },

  async upsertEarningsData(ticker, cyq, updates) {
    try {
      // Convert camelCase to snake_case for database
      const dbUpdates = convertToDbFormat({
        ticker,
        cyq,
        ...updates,
        updated_at: new Date().toISOString()
      });
      
      const { data, error } = await supabase
        .from('earnings_tracking')
        .upsert([dbUpdates], {
          onConflict: 'ticker,cyq'
        })
        .select()
      
      if (error) throw error
      
      // Convert back to camelCase for JavaScript
      return convertFromDbFormat(data[0]);
    } catch (error) {
      console.error('Error upserting earnings data:', error)
      throw error
    }
  }
} 