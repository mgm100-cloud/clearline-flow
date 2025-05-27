import { supabase } from './supabaseClient'

export const DatabaseService = {
  // Ticker operations
  async getTickers() {
    try {
      const { data, error } = await supabase
        .from('tickers')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching tickers:', error)
      throw error
    }
  },

  async addTicker(ticker) {
    try {
      const { data, error } = await supabase
        .from('tickers')
        .insert([ticker])
        .select()
      
      if (error) throw error
      return data[0]
    } catch (error) {
      console.error('Error adding ticker:', error)
      throw error
    }
  },

  async updateTicker(id, updates) {
    try {
      const { data, error } = await supabase
        .from('tickers')
        .update(updates)
        .eq('id', id)
        .select()
      
      if (error) throw error
      return data[0]
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
      return data || []
    } catch (error) {
      console.error('Error fetching earnings data:', error)
      throw error
    }
  },

  async upsertEarningsData(ticker, cyq, updates) {
    try {
      const { data, error } = await supabase
        .from('earnings_data')
        .upsert([
          {
            ticker,
            cyq,
            ...updates,
            updated_at: new Date().toISOString()
          }
        ], {
          onConflict: 'ticker,cyq'
        })
        .select()
      
      if (error) throw error
      return data[0]
    } catch (error) {
      console.error('Error upserting earnings data:', error)
      throw error
    }
  }
} 