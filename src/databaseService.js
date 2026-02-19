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
    'terminalShort': 'terminal_short',
    'aiWinner': 'ai_winner',
    'aiLoser': 'ai_loser',
    'tariffWinner': 'tariff_winner',
    'tariffLoser': 'tariff_loser',
    'trumpWinner': 'trump_winner',
    'trumpLoser': 'trump_loser',
    'aiLoserSeatBased': 'ai_loser_seat_based',
    'aiLoserDecliningEmployees': 'ai_loser_declining_employees',
    'aiLoserUnemploymentSpike': 'ai_loser_unemployment_spike',
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
    'irEmail': 'ir_email',
    'irName2': 'ir_name2',
    'irEmail2': 'ir_email2',
    'irName3': 'ir_name3',
    'irEmail3': 'ir_email3',
    'irName4': 'ir_name4',
    'irEmail4': 'ir_email4',
    'qpDrift': 'qp_drift'
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
    'terminal_short': 'terminalShort',
    'ai_winner': 'aiWinner',
    'ai_loser': 'aiLoser',
    'tariff_winner': 'tariffWinner',
    'tariff_loser': 'tariffLoser',
    'trump_winner': 'trumpWinner',
    'trump_loser': 'trumpLoser',
    'ai_loser_seat_based': 'aiLoserSeatBased',
    'ai_loser_declining_employees': 'aiLoserDecliningEmployees',
    'ai_loser_unemployment_spike': 'aiLoserUnemploymentSpike',
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
    'ir_email': 'irEmail',
    'ir_name2': 'irName2',
    'ir_email2': 'irEmail2',
    'ir_name3': 'irName3',
    'ir_email3': 'irEmail3',
    'ir_name4': 'irName4',
    'ir_email4': 'irEmail4'
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
    else if (['source', 'valueOrGrowth', 'value_or_growth', 'tradeRec', 'trade_rec', 'irName', 'ir_name', 'irEmail', 'ir_email', 'irName2', 'ir_name2', 'irEmail2', 'ir_email2', 'irName3', 'ir_name3', 'irEmail3', 'ir_email3', 'irName4', 'ir_name4', 'irEmail4', 'ir_email4'].includes(key)) {
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
      
      // Calculate quarter end date if earnings date is being updated and quarter_end_date isn't already set
      let quarterEndDate = updates.quarterEndDate;
      if (updates.earningsDate && !quarterEndDate) {
        quarterEndDate = await this.calculateQuarterEndDate(ticker, updates.earningsDate);
      }
      
      // Prepare data for database with correct foreign key
      const dataForDb = {
        ticker_id: tickerData.id,  // Use the actual ID from tickers table
        cyq,
        ...updates,
        ...(quarterEndDate && { quarterEndDate }),
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

  // Calculate quarter end date based on earnings date and fiscal year end
  async calculateQuarterEndDate(ticker, earningsDate) {
    try {
      if (!earningsDate) return null;
      
      // Get fiscal year end from tickers_extra_info
      const { data: extraInfo, error: extraInfoError } = await supabase
        .from('tickers_extra_info')
        .select('fiscal_year_end')
        .eq('ticker', ticker)
        .single();
      
      let fiscalYearEnd = null;
      if (!extraInfoError && extraInfo?.fiscal_year_end) {
        fiscalYearEnd = extraInfo.fiscal_year_end;
      }
      
      // Use the database function to calculate quarter end date
      const { data, error } = await supabase
        .rpc('calculate_quarter_end_date', {
          p_earnings_date: earningsDate,
          p_fiscal_year_end: fiscalYearEnd
        });
      
      if (error) {
        console.warn('Error calculating quarter end date:', error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Error in calculateQuarterEndDate:', error);
      return null;
    }
  },

  // Update quarter end dates for existing records
  async updateQuarterEndDates() {
    try {
      const { data, error } = await supabase
        .rpc('update_quarter_end_dates');
      
      if (error) throw error;
      
      console.log(`✅ Updated quarter end dates for ${data} records`);
      return data;
    } catch (error) {
      console.error('Error updating quarter end dates:', error);
      throw error;
    }
  },

  // Todo operations
  async getTodos(division = null) {
    try {
      let allData = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        let query = supabase
          .from('todos')
          .select('*')
          .or('is_deleted.is.null,is_deleted.eq.false') // Exclude soft-deleted todos
          .order('date_entered', { ascending: false })
          .range(from, from + pageSize - 1);
        
        // Filter by division if specified
        if (division) {
          query = query.eq('division', division);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
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
      
      // Convert snake_case to camelCase for JavaScript
      return allData.map(convertFromDbFormat);
    } catch (error) {
      console.error('Error fetching todos:', error)
      throw error
    }
  },

  // Get recently deleted todos (last 7 days)
  async getDeletedTodos(division = null) {
    try {
      // Calculate date 7 days ago
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      let query = supabase
        .from('todos')
        .select('*')
        .eq('is_deleted', true)
        .gte('deleted_at', sevenDaysAgo.toISOString())
        .order('deleted_at', { ascending: false });
      
      // Filter by division if specified
      if (division) {
        query = query.eq('division', division);
      }
      
      const { data, error } = await query;
      
      if (error) throw error
      
      // Convert snake_case to camelCase for JavaScript
      return (data || []).map(convertFromDbFormat);
    } catch (error) {
      console.error('Error fetching deleted todos:', error)
      throw error
    }
  },

  async addTodo(todo) {
    try {
      // Get the minimum sort_order for this analyst's open todos
      // New todo will be placed at top (lowest sort_order)
      let newSortOrder = 1;
      
      if (todo.analyst) {
        const { data: minData } = await supabase
          .from('todos')
          .select('sort_order')
          .eq('analyst', todo.analyst)
          .eq('is_open', true)
          .order('sort_order', { ascending: true })
          .limit(1);
        
        if (minData && minData.length > 0 && minData[0].sort_order != null) {
          // Set new sort_order to be less than current minimum (so it appears first)
          newSortOrder = minData[0].sort_order - 1;
        }
      }

      // Convert camelCase to snake_case for database
      const dbTodo = convertToDbFormat(todo);
      
      // Set sort_order so new todo appears at top of list
      dbTodo.sort_order = newSortOrder;
      
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

  async updateTodo(id, updates, changedBy = null) {
    try {
      // Convert camelCase to snake_case for database
      const dbUpdates = convertToDbFormat(updates);
      dbUpdates.updated_at = new Date().toISOString();

      // If status is being updated, also set status_updated_at
      if (updates.status !== undefined) {
        dbUpdates.status_updated_at = new Date().toISOString();

        // Get the current status before updating to save to history
        const { data: currentTodo } = await supabase
          .from('todos')
          .select('status')
          .eq('id', id)
          .single();

        // Save the old status to history if it exists and is different
        if (currentTodo && currentTodo.status && currentTodo.status !== updates.status) {
          await supabase
            .from('todo_status_history')
            .insert([{
              todo_id: id,
              status: currentTodo.status,
              changed_at: new Date().toISOString(),
              changed_by: changedBy
            }]);
        }
      }

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

  // Get status history for a todo
  async getTodoStatusHistory(todoId) {
    try {
      const { data, error } = await supabase
        .from('todo_status_history')
        .select('*')
        .eq('todo_id', todoId)
        .order('changed_at', { ascending: false });

      if (error) throw error

      return (data || []).map(convertFromDbFormat);
    } catch (error) {
      console.error('Error fetching todo status history:', error)
      throw error
    }
  },

  async deleteTodo(id) {
    try {
      // Soft delete - set is_deleted flag and deleted_at timestamp
      const { error } = await supabase
        .from('todos')
        .update({ 
          is_deleted: true, 
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
      
      if (error) throw error
    } catch (error) {
      console.error('Error deleting todo:', error)
      throw error
    }
  },

  // Permanently delete a todo (hard delete)
  async permanentlyDeleteTodo(id) {
    try {
      const { error } = await supabase
        .from('todos')
        .delete()
        .eq('id', id)
      
      if (error) throw error
    } catch (error) {
      console.error('Error permanently deleting todo:', error)
      throw error
    }
  },

  // Restore a soft-deleted todo
  async restoreTodo(id) {
    try {
      const { data, error } = await supabase
        .from('todos')
        .update({ 
          is_deleted: false, 
          deleted_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
      
      if (error) throw error
      
      return convertFromDbFormat(data[0]);
    } catch (error) {
      console.error('Error restoring todo:', error)
      throw error
    }
  },

  // Update sort order for multiple todos (for drag-and-drop reordering)
  async updateTodoSortOrders(todoUpdates) {
    try {
      // todoUpdates is an array of { id, sortOrder } objects
      const updatePromises = todoUpdates.map(({ id, sortOrder }) => 
        supabase
          .from('todos')
          .update({ sort_order: sortOrder, updated_at: new Date().toISOString() })
          .eq('id', id)
      );
      
      const results = await Promise.all(updatePromises);
      
      // Check for errors
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw errors[0].error;
      }
      
      return true;
    } catch (error) {
      console.error('Error updating todo sort orders:', error);
      throw error;
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

  // Get all analysts for email recipients with division data
  async getAnalystEmails() {
    try {
      // Try to use the database function that includes division data
      const { data, error } = await supabase
        .rpc('get_analyst_emails');
      
      if (error) throw error;
      
      console.log('✅ Fetched analyst emails with division data:', data);
      return data || [];
    } catch (error) {
      console.error('Error fetching analyst emails from function, trying direct query:', error);
      
      // Fallback to direct query from user_profiles
      try {
        const { data, error: profileError } = await supabase
          .from('user_profiles')
          .select('full_name, email, analyst_code, division')
          .not('email', 'is', null)
          .not('full_name', 'is', null)
          .not('analyst_code', 'is', null)
          .order('full_name');
        
        if (profileError) throw profileError;
        
        // Transform to match expected format
        const transformedData = data.map(profile => ({
          name: profile.full_name,
          email: profile.email,
          analyst_code: profile.analyst_code,
          division: profile.division
        }));
        
        console.log('✅ Fetched analyst emails from user_profiles:', transformedData);
        return transformedData || [];
      } catch (profileError) {
        console.error('Error fetching from user_profiles:', profileError);
        
        // Final fallback to hardcoded list with division data
        const fallbackEmails = [
          { name: 'Marc Majzner', email: 'mmajzner@clearlinecap.com', analyst_code: 'MM', division: 'Super' },
          { name: 'Luke Tzeng', email: 'ltzeng@clearlinecap.com', analyst_code: 'LT', division: 'Investment' },
          { name: 'Grant Anderson', email: 'ganderson@clearlinecap.com', analyst_code: 'GA', division: 'Investment' },
          { name: 'Dan Oricchio', email: 'doricchio@clearlinecap.com', analyst_code: 'DO', division: 'Investment' },
          { name: 'Michael Shen', email: 'mshen@clearlinecap.com', analyst_code: 'MS', division: 'Investment' }
        ];
        console.warn('⚠️ Using fallback analyst emails list with divisions:', fallbackEmails);
        return fallbackEmails;
      }
    }
  },

  // Get old theses for a ticker (excluding soft-deleted ones)
  async getOldTheses(tickerId) {
    try {
      const { data, error } = await supabase
        .from('old_theses')
        .select('*')
        .eq('ticker_id', tickerId)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('archived_date', { ascending: false });
      
      if (error) throw error;
      
      // Convert to camelCase
      return (data || []).map(row => ({
        id: row.id,
        tickerId: row.ticker_id,
        thesis: row.thesis,
        archivedDate: row.archived_date,
        createdAt: row.created_at,
        isDeleted: row.is_deleted
      }));
    } catch (error) {
      console.error('Error fetching old theses:', error);
      return [];
    }
  },

  // Add an old thesis (archive current thesis before replacing)
  async addOldThesis(tickerId, thesis) {
    try {
      const { data, error } = await supabase
        .from('old_theses')
        .insert({
          ticker_id: tickerId,
          thesis: thesis,
          archived_date: new Date().toISOString()
        })
        .select();
      
      if (error) throw error;
      
      const row = data[0];
      return {
        id: row.id,
        tickerId: row.ticker_id,
        thesis: row.thesis,
        archivedDate: row.archived_date,
        createdAt: row.created_at
      };
    } catch (error) {
      console.error('Error adding old thesis:', error);
      throw error;
    }
  },

  // Soft delete an old thesis (marks as deleted but keeps in database)
  async deleteOldThesis(oldThesisId) {
    try {
      const { error } = await supabase
        .from('old_theses')
        .update({ is_deleted: true })
        .eq('id', oldThesisId);
      
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting old thesis:', error);
      throw error;
    }
  }
} 