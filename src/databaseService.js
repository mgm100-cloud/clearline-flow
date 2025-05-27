import { supabase } from './supabaseClient'

// Helper functions to convert between camelCase and snake_case
const toSnakeCase = (str) => {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
};

const toCamelCase = (str) => {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
};

// Convert object keys from camelCase to snake_case for database
const convertToDbFormat = (obj) => {
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
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
        .from('earnings_data')
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
        .from('earnings_data')
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