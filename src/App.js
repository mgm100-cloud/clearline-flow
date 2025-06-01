import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Database, Users, TrendingUp, BarChart3, LogOut, ChevronUp, ChevronDown, RefreshCw, Download, CheckSquare, User } from 'lucide-react';
import { DatabaseService } from './databaseService';
import { AuthService } from './services/authService';
import LoginScreen from './components/LoginScreen';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Alpha Vantage API configuration - using environment variable
const ALPHA_VANTAGE_API_KEY = process.env.REACT_APP_ALPHA_VANTAGE_API_KEY || 'YOUR_API_KEY_HERE';
const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

// Quote service for Alpha Vantage integration
const QuoteService = {
  async getQuote(symbol) {
    if (!ALPHA_VANTAGE_API_KEY || ALPHA_VANTAGE_API_KEY === 'YOUR_API_KEY_HERE') {
      throw new Error('Alpha Vantage API key not configured');
    }

    try {
      // Use intraday data for current market prices (15-min delay)
      const url = `${ALPHA_VANTAGE_BASE_URL}?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=1min&outputsize=compact&apikey=${ALPHA_VANTAGE_API_KEY}`;
      console.log(`Fetching current quote for ${symbol} from:`, url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log(`Alpha Vantage intraday response for ${symbol}:`, data);
      
      if (data['Time Series (1min)']) {
        const timeSeries = data['Time Series (1min)'];
        const timestamps = Object.keys(timeSeries).sort().reverse(); // Get most recent first
        
        if (timestamps.length > 0) {
          const latestTimestamp = timestamps[0];
          const latestData = timeSeries[latestTimestamp];
          const currentPrice = parseFloat(latestData['4. close']);
          const previousPrice = timestamps.length > 1 ? parseFloat(timeSeries[timestamps[1]]['4. close']) : currentPrice;
          
          return {
            symbol: symbol,
            price: currentPrice,
            change: currentPrice - previousPrice,
            changePercent: previousPrice > 0 ? ((currentPrice - previousPrice) / previousPrice * 100) : 0,
            volume: parseInt(latestData['5. volume']),
            high: parseFloat(latestData['2. high']),
            low: parseFloat(latestData['3. low']),
            open: parseFloat(latestData['1. open']),
            lastUpdated: latestTimestamp,
            isIntraday: true
          };
        }
      } else if (data['Error Message']) {
        throw new Error(`Alpha Vantage Error: ${data['Error Message']}`);
      } else if (data['Note']) {
        throw new Error('API call frequency limit reached. Please try again later.');
      } else {
        // Fallback to GLOBAL_QUOTE if intraday fails (market closed, etc.)
        console.log('Intraday data not available, falling back to daily quote...');
        return await this.getGlobalQuote(symbol);
      }
    } catch (error) {
      console.error(`Error fetching intraday quote for ${symbol}:`, error);
      // Fallback to daily quote if intraday fails
      try {
        console.log('Attempting fallback to daily quote...');
        return await this.getGlobalQuote(symbol);
      } catch (fallbackError) {
        console.error(`Fallback also failed for ${symbol}:`, fallbackError);
        throw error;
      }
    }
  },

  // Fallback method for daily quotes when intraday is not available
  async getGlobalQuote(symbol) {
    try {
      const url = `${ALPHA_VANTAGE_BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      console.log(`Fetching daily quote for ${symbol} from:`, url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data['Global Quote']) {
        const quote = data['Global Quote'];
        return {
          symbol: quote['01. symbol'],
          price: parseFloat(quote['05. price']),
          change: parseFloat(quote['09. change']),
          changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
          volume: parseInt(quote['06. volume']),
          previousClose: parseFloat(quote['08. previous close']),
          high: parseFloat(quote['03. high']),
          low: parseFloat(quote['04. low']),
          open: parseFloat(quote['02. open']),
          lastUpdated: quote['07. latest trading day'],
          isIntraday: false
        };
      } else {
        throw new Error('No quote data available');
      }
    } catch (error) {
      console.error(`Error fetching global quote for ${symbol}:`, error);
      throw error;
    }
  },

  async getCompanyOverview(symbol) {
    if (!ALPHA_VANTAGE_API_KEY || ALPHA_VANTAGE_API_KEY === 'YOUR_API_KEY_HERE') {
      throw new Error('Alpha Vantage API key not configured');
    }

    try {
      const url = `${ALPHA_VANTAGE_BASE_URL}?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      console.log(`Fetching company overview for ${symbol} from:`, url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log(`Alpha Vantage company overview response for ${symbol}:`, data);
      
      if (data['Symbol']) {
        return {
          symbol: data['Symbol'],
          name: data['Name'] || `${symbol} Company Ltd`,
          marketCap: parseInt(data['MarketCapitalization']) || Math.round(Math.random() * 50000000000),
          description: data['Description'],
          sector: data['Sector'],
          industry: data['Industry'],
          exchange: data['Exchange']
        };
      } else if (data['Error Message']) {
        throw new Error(`Alpha Vantage Error: ${data['Error Message']}`);
      } else if (data['Note']) {
        throw new Error('API call frequency limit reached. Please try again later.');
      } else {
        console.warn('No company overview data found, using fallback');
        return {
          symbol: symbol,
          name: `${symbol} Company Ltd`,
          marketCap: Math.round(Math.random() * 50000000000)
        };
      }
    } catch (error) {
      console.error(`Error fetching company overview for ${symbol}:`, error);
      // Return fallback data instead of throwing
      return {
        symbol: symbol,
        name: `${symbol} Company Ltd`,
        marketCap: Math.round(Math.random() * 50000000000)
      };
    }
  },

  async getEarningsData(symbol) {
    if (!ALPHA_VANTAGE_API_KEY || ALPHA_VANTAGE_API_KEY === 'YOUR_API_KEY_HERE') {
      throw new Error('Alpha Vantage API key not configured');
    }

    try {
      const url = `${ALPHA_VANTAGE_BASE_URL}?function=EARNINGS&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      console.log(`Fetching earnings data for ${symbol} from:`, url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log(`Alpha Vantage earnings response for ${symbol}:`, data);
      
      if (data['quarterlyEarnings'] && data['quarterlyEarnings'].length > 0) {
        // Find the next upcoming earnings date
        const today = new Date();
        const upcomingEarnings = data['quarterlyEarnings']
          .filter(earning => new Date(earning.reportedDate) > today)
          .sort((a, b) => new Date(a.reportedDate) - new Date(b.reportedDate));
        
        if (upcomingEarnings.length > 0) {
          return {
            symbol: symbol,
            nextEarningsDate: upcomingEarnings[0].reportedDate,
            estimatedEPS: upcomingEarnings[0].estimatedEPS,
            reportedEPS: upcomingEarnings[0].reportedEPS
          };
        } else {
          // If no upcoming earnings, get the most recent one and estimate next quarter
          const recentEarnings = data['quarterlyEarnings']
            .sort((a, b) => new Date(b.reportedDate) - new Date(a.reportedDate));
          
          if (recentEarnings.length > 0) {
            const lastDate = new Date(recentEarnings[0].reportedDate);
            // Estimate next earnings ~3 months later
            const estimatedNext = new Date(lastDate);
            estimatedNext.setMonth(estimatedNext.getMonth() + 3);
            
            return {
              symbol: symbol,
              nextEarningsDate: estimatedNext.toISOString().split('T')[0],
              estimatedEPS: null,
              reportedEPS: null,
              isEstimated: true
            };
          }
        }
      }
      
      // If no earnings data found, return null
      return null;
      
    } catch (error) {
      console.error(`Error fetching earnings data for ${symbol}:`, error);
      throw error;
    }
  },

  async getBatchQuotes(symbols) {
    const quotes = {};
    const errors = {};
    
    // Alpha Vantage premium tier allows 75 calls per minute
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      try {
        const quote = await this.getQuote(symbol);
        quotes[symbol] = quote;
      } catch (error) {
        errors[symbol] = error.message;
      }
    }
    
    return { quotes, errors };
  },

  async getBatchEarnings(symbols) {
    const earnings = {};
    const errors = {};
    
    // Alpha Vantage premium tier allows 75 calls per minute
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      try {
        const earningsData = await this.getEarningsData(symbol);
        if (earningsData) {
          earnings[symbol] = earningsData;
        }
      } catch (error) {
        errors[symbol] = error.message;
      }
    }
    
    return { earnings, errors };
  }
};

const ClearlineFlow = () => {
  console.log('🚀 ClearlineFlow component loaded');
  
  // Authentication state - using Supabase Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(''); // 'readwrite' or 'readonly'
  const [activeTab, setActiveTab] = useState('input');
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  // Data state
  const [tickers, setTickers] = useState([]);
  const [analysts] = useState(['LT', 'GA', 'DP', 'MS', 'DO', 'MM']);
  const [selectedAnalyst, setSelectedAnalyst] = useState('LT');
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  
  // Quote state
  const [quotes, setQuotes] = useState({});
  const [quoteErrors, setQuoteErrors] = useState({});
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [lastQuoteUpdate, setLastQuoteUpdate] = useState(null);
  
  // Earnings tracking state
  const [earningsData, setEarningsData] = useState([]);
  const [selectedCYQ, setSelectedCYQ] = useState('2025Q2');
  const [selectedEarningsAnalyst, setSelectedEarningsAnalyst] = useState('');
  
  // Todo state
  const [todos, setTodos] = useState([]);
  const [selectedTodoAnalyst, setSelectedTodoAnalyst] = useState('');
  
  // Data refresh state
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [lastDataRefresh, setLastDataRefresh] = useState(null);
  
  // Tab switching state
  const [isTabSwitching, setIsTabSwitching] = useState(false);

  // Initialize authentication state and listen for auth changes
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check if user is already logged in
        const session = await AuthService.getCurrentSession();
        const user = await AuthService.getCurrentUser();
        
        if (session && user) {
          console.log('✅ User already authenticated:', user);
          const role = AuthService.getUserRole(user);
          console.log('👤 User role determined:', role);
          console.log('📋 User metadata:', user?.user_metadata);
          setCurrentUser(user);
          setUserRole(role);
          setIsAuthenticated(true);
        } else {
          console.log('🔓 No active session found');
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('❌ Error initializing auth:', error);
        setAuthError('Failed to initialize authentication');
      } finally {
        setAuthLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth state changes
    const { data: { subscription } } = AuthService.onAuthStateChange(async (event, session) => {
      console.log('🔄 Auth state changed:', event, session);
      
      if (event === 'SIGNED_IN' && session) {
        const user = session.user;
        console.log('✅ User signed in:', user);
        const role = AuthService.getUserRole(user);
        console.log('👤 User role determined:', role);
        console.log('📋 User metadata:', user?.user_metadata);
        setCurrentUser(user);
        setUserRole(role);
        setIsAuthenticated(true);
        setAuthError('');
      } else if (event === 'SIGNED_OUT') {
        console.log('🚪 User signed out');
        setCurrentUser(null);
        setUserRole('');
        setIsAuthenticated(false);
        setActiveTab('input');
        setAuthError('');
      } else if (event === 'TOKEN_REFRESHED' && session) {
        console.log('🔄 Token refreshed');
        setCurrentUser(session.user);
      }
    });

    // Cleanup subscription on unmount
    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Load data from Supabase on component mount
  useEffect(() => {
    const loadData = async () => {
      console.log('🔄 Starting to load data from Supabase...');
      try {
        console.log('📡 Calling DatabaseService.getTickers()...');
        
        // Load tickers first
        const tickersData = await DatabaseService.getTickers();
        console.log('✅ Successfully loaded tickers from Supabase:', tickersData);
        setTickers(tickersData);
        
        // Try to load earnings data, but don't fail if table doesn't exist
        try {
          console.log('📡 Calling DatabaseService.getEarningsData()...');
          const earningsDataFromDB = await DatabaseService.getEarningsData();
          console.log('✅ Successfully loaded earnings data from Supabase:', earningsDataFromDB);
          setEarningsData(earningsDataFromDB);
        } catch (earningsError) {
          console.warn('⚠️ Could not load earnings data (table may not exist yet):', earningsError);
          setEarningsData([]);
        }
        
        // Try to load todos data, but don't fail if table doesn't exist
        try {
          console.log('📡 Calling DatabaseService.getTodos()...');
          const todosData = await DatabaseService.getTodos();
          console.log('✅ Successfully loaded todos from Supabase:', todosData);
          setTodos(todosData);
        } catch (todosError) {
          console.warn('⚠️ Could not load todos data (table may not exist yet):', todosError);
          setTodos([]);
        }
        
        // Load quotes for all tickers after data is loaded
        if (tickersData && tickersData.length > 0) {
          console.log('📈 Loading quotes for initial data...');
          setTimeout(() => {
            const symbols = tickersData.map(ticker => ticker.ticker.replace(' US', ''));
            updateQuotes(symbols);
          }, 1000);
        }
        
      } catch (error) {
        console.error('❌ Error loading data from database:', error);
        // Fallback to localStorage if database fails
        const savedTickers = localStorage.getItem('clearline-tickers');
        const savedEarnings = localStorage.getItem('clearline-earnings');
        
        console.log('🔄 Falling back to localStorage...');
        console.log('💾 localStorage tickers:', savedTickers);
        console.log('💾 localStorage earnings:', savedEarnings);
        
        if (savedTickers) {
          const localTickers = JSON.parse(savedTickers);
          setTickers(localTickers);
          
          // Load quotes for localStorage tickers too
          if (localTickers && localTickers.length > 0) {
            setTimeout(() => {
              const symbols = localTickers.map(ticker => ticker.ticker.replace(' US', ''));
              updateQuotes(symbols);
            }, 1000);
          }
        }
        if (savedEarnings) setEarningsData(JSON.parse(savedEarnings));
      }
    };

    console.log('🔐 Authentication status:', isAuthenticated);
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  // Handle successful authentication
  const handleAuthSuccess = (user, session) => {
    console.log('🔑 Authentication successful:', user);
    const role = AuthService.getUserRole(user);
    console.log('👤 User role determined:', role);
    console.log('📋 User metadata:', user?.user_metadata);
    setCurrentUser(user);
    setUserRole(role);
    setIsAuthenticated(true);
    setAuthError('');
    
    // Update all live quotes immediately after login
    setTimeout(() => {
      updateQuotes();
    }, 1000);
  };

  // Handle logout
  const handleLogout = async () => {
    console.log('🚪 Logging out...');
    try {
      await AuthService.signOut();
      // State will be updated by the auth state change listener
    } catch (error) {
      console.error('❌ Error signing out:', error);
      setAuthError('Failed to sign out');
    }
  };

  // Refresh data from database
  const refreshData = async () => {
    if (!isAuthenticated) return;
    
    setIsRefreshingData(true);
    console.log('🔄 Refreshing data from database...');
    
    try {
      // Load tickers
      const tickersData = await DatabaseService.getTickers();
      console.log('✅ Refreshed tickers from Supabase:', tickersData);
      setTickers(tickersData);
      
      // Load earnings data
      try {
        const earningsDataFromDB = await DatabaseService.getEarningsData();
        console.log('✅ Refreshed earnings data from Supabase:', earningsDataFromDB);
        setEarningsData(earningsDataFromDB);
      } catch (earningsError) {
        console.warn('⚠️ Could not refresh earnings data:', earningsError);
        setEarningsData([]);
      }
      
      setLastDataRefresh(new Date());
      console.log('✅ Data refresh completed successfully');
      
    } catch (error) {
      console.error('❌ Error refreshing data from database:', error);
      // Don't fallback to localStorage on refresh - keep existing data
    } finally {
      setIsRefreshingData(false);
    }
  };

  // Real-time quote functions
  const updateQuotes = useCallback(async (symbolsToUpdate = null) => {
    try {
      console.log('📈 Starting quote updates...');
      setIsLoadingQuotes(true);
      setQuoteErrors({});
      
      // Get symbols to update (either provided list or all tickers)
      const symbols = symbolsToUpdate || tickers.map(ticker => ticker.ticker.replace(' US', ''));
      
      if (symbols.length === 0) {
        console.log('No symbols to update');
        setIsLoadingQuotes(false);
        return;
      }
      
      console.log(`Updating quotes for ${symbols.length} symbols:`, symbols);
      
      // Use batch quotes for better performance
      const { quotes: newQuotes, errors } = await QuoteService.getBatchQuotes(symbols);
      
      console.log('Batch quotes response:', { newQuotes, errors });
      
      // Update quotes state
      setQuotes(prev => ({ ...prev, ...newQuotes }));
      
      // Update errors state
      setQuoteErrors(prev => ({ ...prev, ...errors }));
      
      const successCount = Object.keys(newQuotes).length;
      const errorCount = Object.keys(errors).length;
      
      console.log(`✅ Quote update completed: ${successCount} successful, ${errorCount} errors`);
      
    } catch (error) {
      console.error('Error updating quotes:', error);
      setQuoteErrors(prev => ({ ...prev, general: error.message }));
    } finally {
      setIsLoadingQuotes(false);
    }
  }, [tickers]);

  const updateSingleQuote = async (symbol) => {
    const cleanSymbol = symbol.replace(' US', '');
    setIsLoadingQuotes(true);
    
    try {
      const quote = await QuoteService.getQuote(cleanSymbol);
      setQuotes(prev => ({ ...prev, [cleanSymbol]: quote }));
      
      // Update the ticker's current price
      setTickers(prev => prev.map(ticker => {
        if (ticker.ticker.replace(' US', '') === cleanSymbol) {
          return {
            ...ticker,
            currentPrice: quote.price,
            lastQuoteUpdate: new Date().toISOString()
          };
        }
        return ticker;
      }));
      
      // Remove any previous error for this symbol
      setQuoteErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[cleanSymbol];
        return newErrors;
      });
      
    } catch (error) {
      setQuoteErrors(prev => ({ ...prev, [cleanSymbol]: error.message }));
    } finally {
      setIsLoadingQuotes(false);
    }
  };

  // Auto-refresh quotes every 5 minutes
  const updateQuotesCallback = useCallback(() => {
    updateQuotes();
  }, [updateQuotes]);

  useEffect(() => {
    if (!isAuthenticated || tickers.length === 0) return;

    const interval = setInterval(updateQuotesCallback, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [isAuthenticated, tickers, updateQuotesCallback]);

  // Mock data fetching functions (updated to use real quotes when available)
  const fetchStockData = async (ticker) => {
    const cleanSymbol = ticker.replace(' US', '');
    
    try {
      console.log(`🏢 Fetching company data for ${cleanSymbol}...`);
      
      // Get both quote and company overview data
      const [quote, companyOverview] = await Promise.all([
        QuoteService.getQuote(cleanSymbol).catch(error => {
          console.warn(`Could not fetch quote for ${cleanSymbol}:`, error.message);
          return null;
        }),
        QuoteService.getCompanyOverview(cleanSymbol).catch(error => {
          console.warn(`Could not fetch company overview for ${cleanSymbol}:`, error.message);
          return null;
        })
      ]);
      
      // Store quote in state if we got it
      if (quote) {
        setQuotes(prev => ({ ...prev, [cleanSymbol]: quote }));
      }
      
      // Use real data when available, fallback to mock data
      const stockData = {
        name: companyOverview?.name || `${ticker} Company Ltd`,
        price: quote?.price || Math.round((Math.random() * 200 + 50) * 100) / 100,
        adv3Month: Math.round(Math.random() * 10000000), // This would need a different API
        marketCap: companyOverview?.marketCap || Math.round(Math.random() * 50000000000)
      };
      
      console.log(`✅ Successfully fetched data for ${cleanSymbol}:`, stockData);
      return stockData;
      
    } catch (error) {
      // Fallback to mock data if both APIs fail
      console.warn(`Could not fetch real data for ${ticker}, using mock data:`, error.message);
      setQuoteErrors(prev => ({ ...prev, [cleanSymbol]: error.message }));
      
      return {
        name: `${ticker} Company Ltd`,
        price: Math.round((Math.random() * 200 + 50) * 100) / 100,
        adv3Month: Math.round(Math.random() * 10000000),
        marketCap: Math.round(Math.random() * 50000000000)
      };
    }
  };

  // Helper function to format price targets to 2 decimal places
  const formatPriceTarget = (value) => {
    if (!value || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(2);
  };

  // Add new ticker
  const addTicker = async (tickerData) => {
    try {
      // Capitalize the ticker and format price targets
      const capitalizedTickerData = {
        ...tickerData,
        ticker: tickerData.ticker.toUpperCase(),
        ptBear: formatPriceTarget(tickerData.ptBear),
        ptBase: formatPriceTarget(tickerData.ptBase),
        ptBull: formatPriceTarget(tickerData.ptBull)
      };
      
      const stockData = await fetchStockData(capitalizedTickerData.ticker);
      const newTicker = {
        ...capitalizedTickerData,
        dateIn: new Date().toLocaleDateString('en-US', { 
          year: '2-digit', 
          month: '2-digit', 
          day: '2-digit' 
        }),
        pokeDate: new Date().toLocaleDateString('en-US', { 
          year: '2-digit', 
          month: '2-digit', 
          day: '2-digit' 
        }),
        name: stockData.name,
        inputPrice: stockData.price,
        currentPrice: stockData.price,
        marketCap: stockData.marketCap,
        adv3Month: stockData.adv3Month,
        created_at: new Date().toISOString()
      };
      
      // Save to Supabase
      const savedTicker = await DatabaseService.addTicker(newTicker);
      setTickers(prev => [...prev, savedTicker]);
    } catch (error) {
      console.error('Error adding ticker:', error);
      throw error;
    }
  };

  // Update ticker
  const updateTicker = async (id, updates) => {
    try {
      // Remove fields that shouldn't be saved to database
      const { lastQuoteUpdate, ...cleanUpdates } = updates;
      
      // Format price targets in updates if they exist
      const formattedUpdates = {
        ...cleanUpdates,
        ...(cleanUpdates.ptBear !== undefined && { ptBear: formatPriceTarget(cleanUpdates.ptBear) }),
        ...(cleanUpdates.ptBase !== undefined && { ptBase: formatPriceTarget(cleanUpdates.ptBase) }),
        ...(cleanUpdates.ptBull !== undefined && { ptBull: formatPriceTarget(cleanUpdates.ptBull) }),
        pokeDate: new Date().toLocaleDateString('en-US', { 
          year: '2-digit', 
          month: '2-digit', 
          day: '2-digit' 
        }),
        updated_at: new Date().toISOString()
      };

      // Update in Supabase
      await DatabaseService.updateTicker(id, formattedUpdates);
      
      // Update local state
      setTickers(prev => prev.map(ticker => 
        ticker.id === id 
          ? { ...ticker, ...formattedUpdates }
          : ticker
      ));
    } catch (error) {
      console.error('Error updating ticker:', error);
      throw error;
    }
  };

  // Earnings tracking functions
  const updateEarningsData = async (ticker, cyq, updates) => {
    try {
      // Update in Supabase
      await DatabaseService.upsertEarningsData(ticker, cyq, updates);
      
      // Update local state
      setEarningsData(prev => {
        const existingIndex = prev.findIndex(item => item.ticker === ticker && item.cyq === cyq);
        if (existingIndex >= 0) {
          const newData = [...prev];
          newData[existingIndex] = { ...newData[existingIndex], ...updates };
          return newData;
        } else {
          return [...prev, { ticker, cyq, ...updates }];
        }
      });
    } catch (error) {
      console.error('Error updating earnings data:', error);
      throw error;
    }
  };

  const getEarningsData = (ticker, cyq) => {
    return earningsData.find(item => item.ticker === ticker && item.cyq === cyq) || {};
  };

  // Refresh earnings dates from Alpha Vantage
  const refreshEarningsDates = async (tickersToRefresh, targetCYQ) => {
    if (!tickersToRefresh || tickersToRefresh.length === 0) return { success: 0, errors: {} };

    const symbols = tickersToRefresh.map(ticker => ticker.ticker.replace(' US', ''));
    
    try {
      console.log(`🔄 Refreshing earnings dates for ${symbols.length} tickers for CYQ ${targetCYQ}...`);
      
      const { earnings, errors } = await QuoteService.getBatchEarnings(symbols);
      
      let successCount = 0;
      
      // Update earnings data for each ticker that returned data
      for (const [symbol, earningsInfo] of Object.entries(earnings)) {
        try {
          const ticker = tickersToRefresh.find(t => t.ticker.replace(' US', '') === symbol);
          if (ticker && earningsInfo.nextEarningsDate) {
            await updateEarningsData(ticker.ticker, targetCYQ, {
              earningsDate: earningsInfo.nextEarningsDate
            });
            successCount++;
            console.log(`✅ Updated earnings date for ${ticker.ticker}: ${earningsInfo.nextEarningsDate}`);
          }
        } catch (updateError) {
          console.error(`Error updating earnings for ${symbol}:`, updateError);
          errors[symbol] = updateError.message;
        }
      }
      
      console.log(`🎉 Successfully updated ${successCount} earnings dates`);
      return { success: successCount, errors };
      
    } catch (error) {
      console.error('Error refreshing earnings dates:', error);
      throw error;
    }
  };

  // Todo functions
  const addTodo = async (todoData) => {
    try {
      const newTodo = {
        ...todoData,
        dateEntered: new Date().toISOString(),
        isOpen: true
      };
      
      // Save to Supabase
      const savedTodo = await DatabaseService.addTodo(newTodo);
      setTodos(prev => [savedTodo, ...prev]);
      return savedTodo;
    } catch (error) {
      console.error('Error adding todo:', error);
      throw error;
    }
  };

  const updateTodo = async (id, updates) => {
    try {
      // If closing the todo, set the date closed
      if (updates.isOpen === false && !updates.dateClosed) {
        updates.dateClosed = new Date().toISOString();
      }
      // If reopening the todo, clear the date closed
      if (updates.isOpen === true) {
        updates.dateClosed = null;
      }

      // Update in Supabase
      await DatabaseService.updateTodo(id, updates);
      
      // Update local state
      setTodos(prev => prev.map(todo => 
        todo.id === id 
          ? { ...todo, ...updates }
          : todo
      ));
    } catch (error) {
      console.error('Error updating todo:', error);
      throw error;
    }
  };

  const deleteTodo = async (id) => {
    try {
      // Delete from Supabase
      await DatabaseService.deleteTodo(id);
      
      // Update local state
      setTodos(prev => prev.filter(todo => todo.id !== id));
    } catch (error) {
      console.error('Error deleting todo:', error);
      throw error;
    }
  };

  // Sort function
  const sortData = (data, field) => {
    if (!field) return data;
    
    return [...data].sort((a, b) => {
      let aVal = a[field];
      let bVal = b[field];
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Handle tab switching with automatic data refresh
  const handleTabSwitch = async (newTab) => {
    console.log(`🔄 Switching to tab: ${newTab} - Auto-refreshing data...`);
    
    // Only refresh if switching to a different tab
    if (newTab !== activeTab) {
      setIsTabSwitching(true);
      
      try {
        // Refresh data before switching tabs
        await refreshData();
        
        // Set the new active tab
        setActiveTab(newTab);
        
        console.log(`✅ Tab switched to: ${newTab} with fresh data`);
      } catch (error) {
        console.error('❌ Error refreshing data during tab switch:', error);
        // Still switch tabs even if refresh fails
        setActiveTab(newTab);
      } finally {
        setIsTabSwitching(false);
      }
    }
  };

  // Show loading while checking auth state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center">
        <div className="flex justify-center mb-4">
          <TrendingUp className="h-12 w-12 text-blue-600" />
        </div>
        <div className="text-lg font-medium text-gray-900 mb-2">Clearline Flow</div>
        <div className="text-sm text-gray-600">Loading...</div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <LoginScreen 
        onAuthSuccess={handleAuthSuccess} 
        authError={authError}
        isLoading={authLoading}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">Clearline Flow</h1>
              {isTabSwitching && (
                <div className="ml-4 text-sm text-blue-600 animate-pulse">
                  Refreshing data...
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4">
              {/* User info */}
              <div className="flex items-center space-x-2 text-sm">
                <User className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">
                  {AuthService.getUserFullName(currentUser)}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  userRole === 'readwrite' || userRole === 'admin' 
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {userRole === 'readwrite' || userRole === 'admin' ? 'Read/Write' : 'Read Only'}
                </span>
              </div>
              
              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Quote Errors Banner */}
      {Object.keys(quoteErrors).length > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <strong>Quote Issues:</strong> {Object.keys(quoteErrors).length} symbol(s) could not be updated
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-yellow-600">Show details</summary>
                  <div className="mt-1 text-xs text-yellow-600">
                    {Object.entries(quoteErrors).map(([symbol, error]) => (
                      <div key={symbol}>{symbol}: {error}</div>
                    ))}
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {(userRole === 'readwrite' || userRole === 'admin') && (
              <button
                onClick={() => handleTabSwitch('input')}
                disabled={isTabSwitching}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'input'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                } ${isTabSwitching ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <Plus className="inline h-4 w-4 mr-1" />
                Input Page
              </button>
            )}
            <button
              onClick={() => handleTabSwitch('database')}
              disabled={isTabSwitching}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'database'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              } ${isTabSwitching ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <Database className="inline h-4 w-4 mr-1" />
              Idea Database
            </button>
            <button
              onClick={() => handleTabSwitch('database-detailed')}
              disabled={isTabSwitching}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'database-detailed'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              } ${isTabSwitching ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <Database className="inline h-4 w-4 mr-1" />
              Idea Database Detailed
            </button>
            <button
              onClick={() => handleTabSwitch('pm-detail')}
              disabled={isTabSwitching}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'pm-detail'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              } ${isTabSwitching ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <BarChart3 className="inline h-4 w-4 mr-1" />
              PM Detail
            </button>
            <button
              onClick={() => handleTabSwitch('analyst-detail')}
              disabled={isTabSwitching}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analyst-detail'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              } ${isTabSwitching ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <Users className="inline h-4 w-4 mr-1" />
              Analyst Detail
            </button>
            <button
              onClick={() => handleTabSwitch('team')}
              disabled={isTabSwitching}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'team'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              } ${isTabSwitching ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <TrendingUp className="inline h-4 w-4 mr-1" />
              Team Output
            </button>
            <button
              onClick={() => handleTabSwitch('earnings')}
              disabled={isTabSwitching}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'earnings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              } ${isTabSwitching ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <BarChart3 className="inline h-4 w-4 mr-1" />
              Earnings Tracking
            </button>
            <button
              onClick={() => handleTabSwitch('todos')}
              disabled={isTabSwitching}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'todos'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              } ${isTabSwitching ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <CheckSquare className="inline h-4 w-4 mr-1" />
              Todo List
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {activeTab === 'input' && (userRole === 'readwrite' || userRole === 'admin') && (
          <InputPage onAddTicker={addTicker} analysts={analysts} />
        )}
        {activeTab === 'input' && userRole === 'readonly' && (
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <div className="px-4 py-6 sm:px-0">
              <div className="text-center">
                <div className="text-gray-500 text-lg">Input functionality requires Read/Write access</div>
                <div className="text-gray-400 text-sm mt-2">Contact your administrator for access</div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'database' && (
          <DatabasePage 
            tickers={sortData(tickers, sortField)} 
            onSort={handleSort}
            sortField={sortField}
            sortDirection={sortDirection}
            onUpdate={(userRole === 'readwrite' || userRole === 'admin') ? updateTicker : null}
            analysts={analysts}
            quotes={quotes}
            onUpdateQuote={updateSingleQuote}
            isLoadingQuotes={isLoadingQuotes}
            quoteErrors={quoteErrors}
          />
        )}
        {activeTab === 'database-detailed' && (
          <DatabaseDetailedPage 
            tickers={sortData(tickers, sortField)} 
            onSort={handleSort}
            sortField={sortField}
            sortDirection={sortDirection}
            onUpdate={(userRole === 'readwrite' || userRole === 'admin') ? updateTicker : null}
            analysts={analysts}
            quotes={quotes}
            onUpdateQuote={updateSingleQuote}
            isLoadingQuotes={isLoadingQuotes}
            quoteErrors={quoteErrors}
          />
        )}
        {activeTab === 'pm-detail' && (
          <PMDetailPage 
            tickers={tickers} 
            quotes={quotes}
            onUpdateQuote={updateSingleQuote}
            isLoadingQuotes={isLoadingQuotes}
            quoteErrors={quoteErrors}
          />
        )}
        {activeTab === 'analyst-detail' && (
          <AnalystDetailPage 
            tickers={tickers} 
            analysts={analysts}
            selectedAnalyst={selectedAnalyst}
            onSelectAnalyst={setSelectedAnalyst}
            quotes={quotes}
          />
        )}
        {activeTab === 'team' && (
          <TeamOutputPage tickers={tickers} analysts={analysts} />
        )}
        {activeTab === 'earnings' && (
          <EarningsTrackingPage 
            tickers={tickers}
            selectedCYQ={selectedCYQ}
            onSelectCYQ={setSelectedCYQ}
            selectedEarningsAnalyst={selectedEarningsAnalyst}
            onSelectEarningsAnalyst={setSelectedEarningsAnalyst}
            earningsData={earningsData}
            onUpdateEarnings={updateEarningsData}
            getEarningsData={getEarningsData}
            onRefreshEarnings={refreshEarningsDates}
            analysts={analysts}
          />
        )}
        {activeTab === 'todos' && (
          <TodoListPage 
            todos={todos}
            selectedTodoAnalyst={selectedTodoAnalyst}
            onSelectTodoAnalyst={setSelectedTodoAnalyst}
            onAddTodo={addTodo}
            onUpdateTodo={updateTodo}
            onDeleteTodo={deleteTodo}
            analysts={analysts}
            userRole={userRole}
          />
        )}
      </main>
    </div>
  );
};
  
// Input Page Component
const InputPage = ({ onAddTicker, analysts }) => {
  const [formData, setFormData] = useState({
    ticker: '',
    lsPosition: 'Long',
    thesis: '',
    priority: 'A',
    status: 'New',
    analyst: '',
    source: '',
    ptBear: '',
    ptBase: '',
    ptBull: '',
    catalystDate: '',
    valueOrGrowth: '',
    // Boolean fields
    maTargetBuyer: false,
    maTargetValuation: false,
    maTargetSeller: false,
    bigMoveRevert: false,
    activist: false,
    activistPotential: false,
    insiderTradeSignal: false,
    newMgmt: false,
    spin: false,
    bigAcq: false,
    fraudRisk: false,
    regulatoryRisk: false,
    cyclical: false,
    nonCyclical: false,
    highBeta: false,
    momo: false,
    selfHelp: false,
    rateExposure: false,
    strongDollar: false,
    extremeValuation: false
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  // Helper function to format price targets to 2 decimal places
  const formatPriceTarget = (value) => {
    if (!value || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!formData.ticker || !formData.thesis) {
      setSubmitMessage('Please fill in both Ticker and Thesis fields');
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage('Adding investment idea...');
    
    try {
      await onAddTicker(formData);
      setSubmitMessage('Investment idea added successfully!');
      
      // Reset form
      const resetData = {
        ticker: '',
        lsPosition: 'Long',
        thesis: '',
        priority: 'A',
        status: 'New',
        analyst: '',
        source: '',
        ptBear: '',
        ptBase: '',
        ptBull: '',
        catalystDate: '',
        valueOrGrowth: '',
        maTargetBuyer: false,
        maTargetValuation: false,
        maTargetSeller: false,
        bigMoveRevert: false,
        activist: false,
        activistPotential: false,
        insiderTradeSignal: false,
        newMgmt: false,
        spin: false,
        bigAcq: false,
        fraudRisk: false,
        regulatoryRisk: false,
        cyclical: false,
        nonCyclical: false,
        highBeta: false,
        momo: false,
        selfHelp: false,
        rateExposure: false,
        strongDollar: false,
        extremeValuation: false
      };
      
      setFormData(resetData);
      
      setTimeout(() => {
        setSubmitMessage('');
      }, 3000);
      
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      setSubmitMessage('Error adding investment idea: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePriceTargetBlur = (field, value) => {
    const formatted = formatPriceTarget(value);
    setFormData(prev => ({
      ...prev,
      [field]: formatted
    }));
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Add New Investment Idea
        </h3>
        
        <div className="space-y-6">
          {/* Required Fields */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Ticker *
              </label>
              <input
                type="text"
                required
                value={formData.ticker}
                onChange={(e) => handleChange('ticker', e.target.value)}
                placeholder="e.g., AAPL"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">Enter symbol without exchange suffix (e.g., AAPL not AAPL US)</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                L/S *
              </label>
              <select
                value={formData.lsPosition}
                onChange={(e) => handleChange('lsPosition', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="Long">Long</option>
                <option value="Short">Short</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Thesis *
            </label>
            <textarea
              required
              rows={3}
              value={formData.thesis}
              onChange={(e) => handleChange('thesis', e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>

          {/* Optional Fields */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => handleChange('priority', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="F">F</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="New">New</option>
                <option value="Portfolio">Portfolio</option>
                <option value="Current">Current</option>
                <option value="On-Deck">On-Deck</option>
                <option value="Old">Old</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Analyst
              </label>
              <select
                value={formData.analyst}
                onChange={(e) => handleChange('analyst', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">Select Analyst</option>
                {analysts.map(analyst => (
                  <option key={analyst} value={analyst}>{analyst}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Price Targets */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                PT Bear
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.ptBear}
                onChange={(e) => handleChange('ptBear', e.target.value)}
                onBlur={(e) => handlePriceTargetBlur('ptBear', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                PT Base
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.ptBase}
                onChange={(e) => handleChange('ptBase', e.target.value)}
                onBlur={(e) => handlePriceTargetBlur('ptBase', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                PT Bull
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.ptBull}
                onChange={(e) => handleChange('ptBull', e.target.value)}
                onBlur={(e) => handlePriceTargetBlur('ptBull', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          </div>

          {submitMessage && (
            <div className={`p-3 rounded-md ${
              submitMessage.includes('successfully') 
                ? 'bg-green-100 text-green-700' 
                : submitMessage.includes('Error')
                ? 'bg-red-100 text-red-700'
                : 'bg-blue-100 text-blue-700'
            }`}>
              {submitMessage}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className={`ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
                isSubmitting 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            >
              {isSubmitting ? 'Adding...' : 'Add Investment Idea'}
            </button>
          </div>

          {/* Additional Optional Fields Section */}
          <div className="border-t border-gray-200 pt-6 mt-6">
            <div className="mb-4">
              <h4 className="text-md font-medium text-gray-900 mb-2">Additional Fields</h4>
              <p className="text-sm text-gray-600">These fields provide additional detail and analysis for the investment idea.</p>
            </div>

            {/* Source and Catalyst Date */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Source
                </label>
                <input
                  type="text"
                  value={formData.source}
                  onChange={(e) => handleChange('source', e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Catalyst Date
                </label>
                <input
                  type="date"
                  value={formData.catalystDate}
                  onChange={(e) => handleChange('catalystDate', e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>

            {/* Value or Growth */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700">
                Value or Growth
              </label>
              <select
                value={formData.valueOrGrowth}
                onChange={(e) => handleChange('valueOrGrowth', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">Select...</option>
                <option value="Value">Value</option>
                <option value="Growth">Growth</option>
              </select>
            </div>

            {/* Boolean Investment Characteristics */}
            <div className="mb-6">
              <h5 className="text-sm font-medium text-gray-700 mb-3">Investment Characteristics</h5>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { key: 'maTargetBuyer', label: 'M&A Target - Buyer' },
                  { key: 'maTargetValuation', label: 'M&A Target - Valuation' },
                  { key: 'maTargetSeller', label: 'M&A Target - Seller' },
                  { key: 'bigMoveRevert', label: 'Big Move Revert' },
                  { key: 'activist', label: 'Activist' },
                  { key: 'activistPotential', label: 'Activist Potential' },
                  { key: 'insiderTradeSignal', label: 'Insider Trade Signal' },
                  { key: 'newMgmt', label: 'New Management' },
                  { key: 'spin', label: 'Spin' },
                  { key: 'bigAcq', label: 'Big Acquisition' },
                  { key: 'fraudRisk', label: 'Fraud Risk' },
                  { key: 'regulatoryRisk', label: 'Regulatory Risk' },
                  { key: 'cyclical', label: 'Cyclical' },
                  { key: 'nonCyclical', label: 'Non-Cyclical' },
                  { key: 'highBeta', label: 'High Beta' },
                  { key: 'momo', label: 'Momentum' },
                  { key: 'selfHelp', label: 'Self-Help' },
                  { key: 'rateExposure', label: 'Rate Exposure' },
                  { key: 'strongDollar', label: 'Strong Dollar' },
                  { key: 'extremeValuation', label: 'Extreme Valuation' }
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData[key]}
                      onChange={(e) => handleChange(key, e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label className="ml-2 text-sm text-gray-700">{label}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Enhanced Database Page Component with quotes
const DatabasePage = ({ tickers, onSort, sortField, sortDirection, onUpdate, analysts, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors }) => {
  const SortableHeader = ({ field, children }) => (
    <th
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </th>
  );

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Investment Idea Database ({tickers.length} ideas)
        </h3>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader field="ticker">Ticker</SortableHeader>
                <SortableHeader field="name">Name</SortableHeader>
                <SortableHeader field="dateIn">Date In</SortableHeader>
                <SortableHeader field="lsPosition">L/S</SortableHeader>
                <SortableHeader field="priority">Priority</SortableHeader>
                <SortableHeader field="status">Status</SortableHeader>
                <SortableHeader field="analyst">Analyst</SortableHeader>
                <SortableHeader field="currentPrice">Current Price</SortableHeader>
                {onUpdate && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tickers.map((ticker) => (
                <EnhancedTickerRow 
                  key={ticker.id} 
                  ticker={ticker} 
                  onUpdate={onUpdate}
                  analysts={analysts}
                  quotes={quotes}
                  onUpdateQuote={onUpdateQuote}
                  isLoadingQuotes={isLoadingQuotes}
                  quoteErrors={quoteErrors}
                />
              ))}
            </tbody>
          </table>
        </div>
        
        {tickers.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No investment ideas added yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Enhanced Ticker Row Component with quote integration
const EnhancedTickerRow = ({ ticker, onUpdate, analysts, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(ticker);

  const cleanSymbol = ticker.ticker.replace(' US', '');
  const quote = quotes[cleanSymbol];
  const hasQuoteError = quoteErrors[cleanSymbol];

  const handleSave = () => {
    onUpdate(ticker.id, editData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData(ticker);
    setIsEditing(false);
  };

  // Calculate P&L from input price vs current quote price
  const currentPrice = quote ? quote.price : ticker.currentPrice;

  if (isEditing && onUpdate) {
    return (
      <tr className="bg-blue-50">
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          {ticker.ticker}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {ticker.name}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {ticker.dateIn}
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <select
            value={editData.lsPosition}
            onChange={(e) => setEditData({...editData, lsPosition: e.target.value})}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="Long">Long</option>
            <option value="Short">Short</option>
          </select>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <select
            value={editData.priority}
            onChange={(e) => setEditData({...editData, priority: e.target.value})}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="F">F</option>
          </select>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <select
            value={editData.status}
            onChange={(e) => setEditData({...editData, status: e.target.value})}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="New">New</option>
            <option value="Portfolio">Portfolio</option>
            <option value="Current">Current</option>
            <option value="On-Deck">On-Deck</option>
            <option value="Old">Old</option>
          </select>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <select
            value={editData.analyst}
            onChange={(e) => setEditData({...editData, analyst: e.target.value})}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="">Select...</option>
            {analysts.map(analyst => (
              <option key={analyst} value={analyst}>{analyst}</option>
            ))}
          </select>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <QuoteDisplay 
            ticker={ticker.ticker}
            quote={quote}
            onUpdateQuote={onUpdateQuote}
            isLoading={isLoadingQuotes}
            hasError={hasQuoteError}
          />
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm">
          <div className="flex space-x-2">
            <button
              onClick={handleSave}
              className="text-green-600 hover:text-green-900 text-xs"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="text-red-600 hover:text-red-900 text-xs"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {ticker.ticker}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.name}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.dateIn}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          ticker.lsPosition === 'Long' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {ticker.lsPosition}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          ticker.priority === 'A' ? 'bg-red-100 text-red-800' :
          ticker.priority === 'B' ? 'bg-yellow-100 text-yellow-800' :
          ticker.priority === 'C' ? 'bg-blue-100 text-blue-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {ticker.priority}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          ticker.status === 'Current' ? 'bg-green-100 text-green-800' :
          ticker.status === 'Portfolio' ? 'bg-blue-100 text-blue-800' :
          ticker.status === 'On-Deck' ? 'bg-yellow-100 text-yellow-800' :
          ticker.status === 'New' ? 'bg-purple-100 text-purple-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {ticker.status}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {ticker.analyst || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <QuoteDisplay 
          ticker={ticker.ticker}
          quote={quote}
          onUpdateQuote={onUpdateQuote}
          isLoading={isLoadingQuotes}
          hasError={hasQuoteError}
        />
      </td>
      {onUpdate && (
        <td className="px-6 py-4 whitespace-nowrap text-sm">
          <button
            onClick={() => {
              console.log('🔥 EDIT BUTTON CLICKED for ticker:', ticker.ticker);
              console.log('Setting isEditing to true...');
              setIsEditing(true);
            }}
            className="text-blue-600 hover:text-blue-900 text-xs font-bold border border-blue-500 px-2 py-1 rounded"
          >
            🔧 Edit {ticker.ticker}
          </button>
        </td>
      )}
    </tr>
  );
};

// Database Detailed Page Component - Shows all fields with quotes integration
const DatabaseDetailedPage = ({ tickers, onSort, sortField, sortDirection, onUpdate, analysts, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors }) => {
  const SortableHeader = ({ field, children }) => (
    <th
      className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </th>
  );

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Investment Idea Database - Detailed View ({tickers.length} ideas)
        </h3>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader field="ticker">Ticker</SortableHeader>
                <SortableHeader field="name">Name</SortableHeader>
                <SortableHeader field="dateIn">Date In</SortableHeader>
                <SortableHeader field="pokeDate">Poke Date</SortableHeader>
                <SortableHeader field="lsPosition">L/S</SortableHeader>
                <SortableHeader field="priority">Priority</SortableHeader>
                <SortableHeader field="status">Status</SortableHeader>
                <SortableHeader field="analyst">Analyst</SortableHeader>
                <SortableHeader field="source">Source</SortableHeader>
                <SortableHeader field="inputPrice">Input Price</SortableHeader>
                <SortableHeader field="currentPrice">Current Price</SortableHeader>
                <SortableHeader field="marketCap">Market Cap</SortableHeader>
                <SortableHeader field="adv3Month">ADV 3M</SortableHeader>
                <SortableHeader field="ptBear">PT Bear</SortableHeader>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bear %</th>
                <SortableHeader field="ptBase">PT Base</SortableHeader>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base %</th>
                <SortableHeader field="ptBull">PT Bull</SortableHeader>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bull %</th>
                <SortableHeader field="catalystDate">Catalyst Date</SortableHeader>
                <SortableHeader field="valueOrGrowth">Value/Growth</SortableHeader>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">M&A Target Buyer</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">M&A Target Val</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">M&A Target Seller</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Big Move Revert</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activist</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activist Potential</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Insider Trade</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">New Mgmt</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Spin</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Big Acq</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fraud Risk</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Regulatory Risk</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cyclical</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Non-Cyclical</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">High Beta</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Momentum</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Self Help</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate Exposure</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Strong Dollar</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Extreme Val</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thesis</th>
                {onUpdate && <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tickers.map((ticker) => (
                <DetailedTickerRow 
                  key={ticker.id} 
                  ticker={ticker} 
                  onUpdate={onUpdate}
                  analysts={analysts}
                  quotes={quotes}
                  onUpdateQuote={onUpdateQuote}
                  isLoadingQuotes={isLoadingQuotes}
                  quoteErrors={quoteErrors}
                />
              ))}
            </tbody>
          </table>
        </div>
        
        {tickers.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No investment ideas added yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Detailed Ticker Row Component for inline editing in detailed view with quotes
const DetailedTickerRow = ({ ticker, onUpdate, analysts, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(ticker);

  // Ensure editData is synced with ticker prop changes
  useEffect(() => {
    setEditData(ticker);
  }, [ticker]);

  const cleanSymbol = ticker.ticker.replace(' US', '');
  const quote = quotes[cleanSymbol];
  const hasQuoteError = quoteErrors[cleanSymbol];

  const handleSave = () => {
    onUpdate(ticker.id, editData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData(ticker);
    setIsEditing(false);
  };

  const formatBoolean = (value) => value ? '✓' : '';
  
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return dateString;
  };

  const currentPrice = quote ? quote.price : ticker.currentPrice;

  // Debug logging to help diagnose the issue
  console.log('DetailedTickerRow render:', {
    tickerId: ticker.id,
    isEditing,
    hasOnUpdate: !!onUpdate,
    userCanEdit: !!onUpdate
  });

  if (isEditing && onUpdate) {
    console.log('Rendering EDIT MODE for ticker:', ticker.ticker);
    return (
      <tr className="bg-blue-50 border-2 border-blue-500">
        <td className="px-3 py-4 whitespace-nowrap text-sm font-bold text-blue-900">
          🔧 EDITING: {ticker.ticker}
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 max-w-32 truncate">
          {ticker.name}
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
          {formatDate(ticker.dateIn)}
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
          {formatDate(ticker.pokeDate)}
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <select
            value={editData.lsPosition}
            onChange={(e) => setEditData({...editData, lsPosition: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-20"
          >
            <option value="Long">Long</option>
            <option value="Short">Short</option>
          </select>
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <select
            value={editData.priority}
            onChange={(e) => setEditData({...editData, priority: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-12"
          >
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="F">F</option>
          </select>
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <select
            value={editData.status}
            onChange={(e) => setEditData({...editData, status: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-20"
          >
            <option value="New">New</option>
            <option value="Portfolio">Portfolio</option>
            <option value="Current">Current</option>
            <option value="On-Deck">On-Deck</option>
            <option value="Old">Old</option>
          </select>
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <select
            value={editData.analyst}
            onChange={(e) => setEditData({...editData, analyst: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          >
            <option value="">-</option>
            {analysts.map(analyst => (
              <option key={analyst} value={analyst}>{analyst}</option>
            ))}
          </select>
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <input
            type="text"
            value={editData.source || ''}
            onChange={(e) => setEditData({...editData, source: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-20"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
          ${ticker.inputPrice || '-'}
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <QuoteDisplay 
            ticker={ticker.ticker}
            quote={quote}
            onUpdateQuote={onUpdateQuote}
            isLoading={isLoadingQuotes}
            hasError={hasQuoteError}
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
          {ticker.marketCap ? `${(ticker.marketCap / 1000000).toFixed(0)}M` : '-'}
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
          {ticker.adv3Month ? `${(ticker.adv3Month / 1000000).toFixed(1)}M` : '-'}
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <input
            type="number"
            step="0.01"
            value={editData.ptBear || ''}
            onChange={(e) => setEditData({...editData, ptBear: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm">
          <span className={`${
            calculatePercentChange(editData.ptBear, currentPrice).startsWith('+') 
              ? 'text-green-600' 
              : calculatePercentChange(editData.ptBear, currentPrice).startsWith('-')
              ? 'text-red-600'
              : 'text-gray-500'
          }`}>
            {calculatePercentChange(editData.ptBear, currentPrice) || '-'}
          </span>
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <input
            type="number"
            step="0.01"
            value={editData.ptBase || ''}
            onChange={(e) => setEditData({...editData, ptBase: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm">
          <span className={`${
            calculatePercentChange(editData.ptBase, currentPrice).startsWith('+') 
              ? 'text-green-600' 
              : calculatePercentChange(editData.ptBase, currentPrice).startsWith('-')
              ? 'text-red-600'
              : 'text-gray-500'
          }`}>
            {calculatePercentChange(editData.ptBase, currentPrice) || '-'}
          </span>
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <input
            type="number"
            step="0.01"
            value={editData.ptBull || ''}
            onChange={(e) => setEditData({...editData, ptBull: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm">
          <span className={`${
            calculatePercentChange(editData.ptBull, currentPrice).startsWith('+') 
              ? 'text-green-600' 
              : calculatePercentChange(editData.ptBull, currentPrice).startsWith('-')
              ? 'text-red-600'
              : 'text-gray-500'
          }`}>
            {calculatePercentChange(editData.ptBull, currentPrice) || '-'}
          </span>
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <input
            type="date"
            value={editData.catalystDate || ''}
            onChange={(e) => setEditData({...editData, catalystDate: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-24"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <select
            value={editData.valueOrGrowth || ''}
            onChange={(e) => setEditData({...editData, valueOrGrowth: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          >
            <option value="">-</option>
            <option value="Value">Value</option>
            <option value="Growth">Growth</option>
          </select>
        </td>
        {/* Boolean fields - show as checkboxes */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.maTargetBuyer || false}
            onChange={(e) => setEditData({...editData, maTargetBuyer: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.maTargetValuation || false}
            onChange={(e) => setEditData({...editData, maTargetValuation: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.maTargetSeller || false}
            onChange={(e) => setEditData({...editData, maTargetSeller: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.bigMoveRevert || false}
            onChange={(e) => setEditData({...editData, bigMoveRevert: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.activist || false}
            onChange={(e) => setEditData({...editData, activist: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.activistPotential || false}
            onChange={(e) => setEditData({...editData, activistPotential: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.insiderTradeSignal || false}
            onChange={(e) => setEditData({...editData, insiderTradeSignal: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.newMgmt || false}
            onChange={(e) => setEditData({...editData, newMgmt: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.spin || false}
            onChange={(e) => setEditData({...editData, spin: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.bigAcq || false}
            onChange={(e) => setEditData({...editData, bigAcq: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.fraudRisk || false}
            onChange={(e) => setEditData({...editData, fraudRisk: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.regulatoryRisk || false}
            onChange={(e) => setEditData({...editData, regulatoryRisk: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.cyclical || false}
            onChange={(e) => setEditData({...editData, cyclical: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.nonCyclical || false}
            onChange={(e) => setEditData({...editData, nonCyclical: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.highBeta || false}
            onChange={(e) => setEditData({...editData, highBeta: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.momo || false}
            onChange={(e) => setEditData({...editData, momo: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.selfHelp || false}
            onChange={(e) => setEditData({...editData, selfHelp: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.rateExposure || false}
            onChange={(e) => setEditData({...editData, rateExposure: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.strongDollar || false}
            onChange={(e) => setEditData({...editData, strongDollar: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.extremeValuation || false}
            onChange={(e) => setEditData({...editData, extremeValuation: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4">
          <textarea
            value={editData.thesis || ''}
            onChange={(e) => setEditData({...editData, thesis: e.target.value})}
            rows={2}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-full resize-none"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm">
          <div className="flex space-x-2">
            <button
              onClick={handleSave}
              className="text-green-600 hover:text-green-900 text-xs font-medium"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="text-red-600 hover:text-red-900 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {ticker.ticker}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 max-w-32 truncate">
        {ticker.name}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {formatDate(ticker.dateIn)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {formatDate(ticker.pokeDate)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          ticker.lsPosition === 'Long' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {ticker.lsPosition}
        </span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          ticker.priority === 'A' ? 'bg-red-100 text-red-800' :
          ticker.priority === 'B' ? 'bg-yellow-100 text-yellow-800' :
          ticker.priority === 'C' ? 'bg-blue-100 text-blue-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {ticker.priority}
        </span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          ticker.status === 'Current' ? 'bg-green-100 text-green-800' :
          ticker.status === 'Portfolio' ? 'bg-blue-100 text-blue-800' :
          ticker.status === 'On-Deck' ? 'bg-yellow-100 text-yellow-800' :
          ticker.status === 'New' ? 'bg-purple-100 text-purple-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {ticker.status}
        </span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
        {ticker.analyst || '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.source || '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
        ${ticker.inputPrice || '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap">
        <QuoteDisplay 
          ticker={ticker.ticker}
          quote={quote}
          onUpdateQuote={onUpdateQuote}
          isLoading={isLoadingQuotes}
          hasError={hasQuoteError}
        />
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.marketCap ? `${(ticker.marketCap / 1000000).toFixed(0)}M` : '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.adv3Month ? `${(ticker.adv3Month / 1000000).toFixed(1)}M` : '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
        {ticker.ptBear ? `${parseFloat(ticker.ptBear).toFixed(2)}` : '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm">
        <span className={`${
          calculatePercentChange(ticker.ptBear, currentPrice).startsWith('+') 
            ? 'text-green-600' 
            : calculatePercentChange(ticker.ptBear, currentPrice).startsWith('-')
            ? 'text-red-600'
            : 'text-gray-500'
        }`}>
          {calculatePercentChange(ticker.ptBear, currentPrice) || '-'}
        </span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
        {ticker.ptBase ? `${parseFloat(ticker.ptBase).toFixed(2)}` : '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm">
        <span className={`${
          calculatePercentChange(ticker.ptBase, currentPrice).startsWith('+') 
            ? 'text-green-600' 
            : calculatePercentChange(ticker.ptBase, currentPrice).startsWith('-')
            ? 'text-red-600'
            : 'text-gray-500'
        }`}>
          {calculatePercentChange(ticker.ptBase, currentPrice) || '-'}
        </span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
        {ticker.ptBull ? `${parseFloat(ticker.ptBull).toFixed(2)}` : '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm">
        <span className={`${
          calculatePercentChange(ticker.ptBull, currentPrice).startsWith('+') 
            ? 'text-green-600' 
            : calculatePercentChange(ticker.ptBull, currentPrice).startsWith('-')
            ? 'text-red-600'
            : 'text-gray-500'
        }`}>
          {calculatePercentChange(ticker.ptBull, currentPrice) || '-'}
        </span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.catalystDate || '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.valueOrGrowth || '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.maTargetBuyer)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.maTargetValuation)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.maTargetSeller)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.bigMoveRevert)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.activist)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.activistPotential)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.insiderTradeSignal)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.newMgmt)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.spin)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.bigAcq)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.fraudRisk)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.regulatoryRisk)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.cyclical)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.nonCyclical)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.highBeta)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.momo)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.selfHelp)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.rateExposure)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.strongDollar)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.extremeValuation)}
      </td>
      <td className="px-3 py-4 text-sm text-gray-500">
        <div className="whitespace-normal break-words">
          {ticker.thesis}
        </div>
      </td>
      {onUpdate && (
        <td className="px-3 py-4 whitespace-nowrap text-sm">
          <button
            onClick={() => {
              console.log('🔥 EDIT BUTTON CLICKED for ticker:', ticker.ticker);
              console.log('Setting isEditing to true...');
              setIsEditing(true);
            }}
            className="text-blue-600 hover:text-blue-900 text-xs font-bold border border-blue-500 px-2 py-1 rounded"
          >
            🔧 Edit {ticker.ticker}
          </button>
        </td>
      )}
    </tr>
  );
};

// Helper function to calculate percentage change between price target and current price
const calculatePercentChange = (priceTarget, currentPrice) => {
  if (!priceTarget || !currentPrice || currentPrice === 0) return '';
  const change = (parseFloat(priceTarget) / parseFloat(currentPrice) - 1) * 100;
  return `${change >= 0 ? '+' : ''}${Math.round(change)}%`;
};

// PM Detail Page Component with quotes integration
const PMDetailPage = ({ tickers, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors }) => {
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  
  const statusOrder = ['Current', 'On-Deck', 'Portfolio', 'New', 'Old'];
  
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortData = (data, field) => {
    if (!field) return data;
    
    return [...data].sort((a, b) => {
      let aVal = a[field];
      let bVal = b[field];
      
      if (field === 'currentPrice' || field === 'ptBear' || field === 'ptBase' || field === 'ptBull') {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      } else if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  };

  const SortableHeader = ({ field, children, style }) => (
    <th 
      className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => handleSort(field)}
      style={style || { 
        width: field === 'ticker' ? '80px' : 
               field === 'lsPosition' ? '50px' :
               field === 'priority' ? '45px' :
               field === 'analyst' ? '45px' :
               field === 'currentPrice' ? '85px' :
               field === 'ptBear' || field === 'ptBase' || field === 'ptBull' ? '70px' :
               field === 'thesis' ? 'auto' : '50px' 
      }}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </th>
  );

  // Group tickers by status and create a flat array with status headers
  const groupedData = [];
  statusOrder.forEach(status => {
    const statusTickers = tickers.filter(ticker => ticker.status === status);
    if (statusTickers.length > 0) {
      const sortedTickers = sortData(statusTickers, sortField);
      // Add status header row
      groupedData.push({ type: 'header', status, count: sortedTickers.length });
      // Add ticker rows
      sortedTickers.forEach(ticker => {
        groupedData.push({ type: 'ticker', ticker, status });
      });
    }
  });

  // PDF Export Function for PM Detail
  const exportToPDF = () => {
    try {
      console.log('Starting PM Detail PDF export...');
      const doc = new jsPDF('landscape');
      
      // Add title
      doc.setFontSize(18);
      doc.text('Clearline Flow - PM Detail Output', 14, 22);
      
      // Add timestamp
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
      
      // Prepare data for the PDF table
      const tableData = [];
      
      statusOrder.forEach(status => {
        const statusTickers = tickers.filter(ticker => ticker.status === status);
        if (statusTickers.length > 0) {
          const sortedTickers = sortData(statusTickers, sortField);
          
          // Add status header row
          tableData.push([`${status} (${sortedTickers.length})`, '', '', '', '', '', '', '', '', '', '', '']);
          
          // Add ticker data rows
          sortedTickers.forEach(ticker => {
            const cleanSymbol = ticker.ticker.replace(' US', '');
            const quote = quotes[cleanSymbol];
            const currentPrice = quote ? quote.price : ticker.currentPrice;
            
            const row = [
              ticker.ticker || '-',
              ticker.lsPosition || '-',
              ticker.priority || '-',
              ticker.analyst || '-',
              currentPrice ? `$${parseFloat(currentPrice).toFixed(2)}` : '-',
              ticker.ptBear ? `$${parseFloat(ticker.ptBear).toFixed(2)}` : '-',
              calculatePercentChange(ticker.ptBear, currentPrice) || '-',
              ticker.ptBase ? `$${parseFloat(ticker.ptBase).toFixed(2)}` : '-',
              calculatePercentChange(ticker.ptBase, currentPrice) || '-',
              ticker.ptBull ? `$${parseFloat(ticker.ptBull).toFixed(2)}` : '-',
              calculatePercentChange(ticker.ptBull, currentPrice) || '-',
              ticker.thesis || '-'
            ];
            tableData.push(row);
          });
        }
      });
      
      console.log('PM Detail table data:', tableData);
      
      // Create the PDF table
      autoTable(doc, {
        head: [['Ticker', 'L/S', 'Pri', 'Ana', 'Price', 'Bear', 'Bear %', 'Base', 'Base %', 'Bull', 'Bull %', 'Thesis']],
        body: tableData,
        startY: 40,
        styles: {
          fontSize: 6,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [75, 85, 99],
          textColor: 255,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 18 }, // Ticker
          1: { cellWidth: 12 }, // L/S
          2: { cellWidth: 12 }, // Priority
          3: { cellWidth: 12 }, // Analyst
          4: { cellWidth: 18 }, // Price
          5: { cellWidth: 18 }, // PT Bear
          6: { cellWidth: 15 }, // Bear %
          7: { cellWidth: 18 }, // PT Base
          8: { cellWidth: 15 }, // Base %
          9: { cellWidth: 18 }, // PT Bull
          10: { cellWidth: 15 }, // Bull %
          11: { cellWidth: 65 }  // Thesis
        },
        didParseCell: function(data) {
          // Highlight status header rows
          if (data.cell.text[0] && (
            data.cell.text[0].includes('Current (') || 
            data.cell.text[0].includes('On-Deck (') || 
            data.cell.text[0].includes('Portfolio (') ||
            data.cell.text[0].includes('New (') ||
            data.cell.text[0].includes('Old (')
          )) {
            data.cell.styles.fillColor = [229, 231, 235]; // Light gray background
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });
      
      // Save the PDF
      const fileName = `pm-detail-output-${new Date().toISOString().split('T')[0]}.pdf`;
      console.log('Saving PM Detail PDF as:', fileName);
      doc.save(fileName);
      console.log('PM Detail PDF export completed successfully');
    } catch (error) {
      console.error('Error exporting PM Detail PDF:', error);
      alert(`Error exporting PDF: ${error.message}`);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            PM Detail Output
          </h3>
          <button
            onClick={exportToPDF}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Download className="h-4 w-4" />
            <span>Export to PDF</span>
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed', width: '100%' }}>
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader field="ticker" style={{ width: '80px' }}>Ticker</SortableHeader>
                <SortableHeader field="lsPosition" style={{ width: '50px' }}>L/S</SortableHeader>
                <SortableHeader field="priority" style={{ width: '45px' }}>Pri</SortableHeader>
                <SortableHeader field="analyst" style={{ width: '45px' }}>Ana</SortableHeader>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '85px' }}>Price</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '70px' }}>Bear</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '50px' }}>%</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '70px' }}>Base</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '50px' }}>%</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '70px' }}>Bull</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '50px' }}>%</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thesis</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {groupedData.map((item, index) => {
                if (item.type === 'header') {
                  return (
                    <tr key={`header-${item.status}`} className="bg-gray-100">
                      <td colSpan="12" className="px-6 py-3 text-sm font-medium text-gray-900">
                        {item.status} ({item.count})
                      </td>
                    </tr>
                  );
                } else {
                  const { ticker } = item;
                  const cleanSymbol = ticker.ticker.replace(' US', '');
                  const quote = quotes[cleanSymbol];
                  const currentPrice = quote ? quote.price : ticker.currentPrice;
                  
                  // Calculate percentage changes with color logic
                  const bearPercent = calculatePercentChange(ticker.ptBear, currentPrice);
                  const basePercent = calculatePercentChange(ticker.ptBase, currentPrice);
                  const bullPercent = calculatePercentChange(ticker.ptBull, currentPrice);
                  
                  const getPercentColor = (percent) => {
                    if (!percent || percent === '-') return 'text-gray-600';
                    const isPositive = percent.startsWith('+');
                    const isNegative = percent.startsWith('-');
                    return isPositive ? 'text-green-600 font-medium' : 
                           isNegative ? 'text-red-600 font-medium' : 'text-gray-600';
                  };
                  
                  return (
                    <tr key={ticker.id}>
                      <td className="px-2 py-2 whitespace-nowrap text-sm font-medium text-gray-900" style={{ width: '80px' }}>
                        <div className="truncate" title={ticker.ticker}>
                          {ticker.ticker}
                        </div>
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-center" style={{ width: '50px' }}>
                        <span className={`inline-flex px-1 py-0.5 text-xs font-semibold rounded ${
                          ticker.lsPosition === 'Long' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {ticker.lsPosition === 'Long' ? 'L' : 'S'}
                        </span>
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-center" style={{ width: '45px' }}>
                        <span className={`inline-flex w-6 h-6 items-center justify-center text-xs font-bold rounded-full ${
                          ticker.priority === 'A' ? 'bg-red-100 text-red-800' :
                          ticker.priority === 'B' ? 'bg-yellow-100 text-yellow-800' :
                          ticker.priority === 'C' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {ticker.priority}
                        </span>
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs text-gray-900 text-center" style={{ width: '45px' }}>
                        <div className="truncate" title={ticker.analyst || '-'}>
                          {ticker.analyst || '-'}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm" style={{ width: '85px' }}>
                        <QuoteDisplay 
                          ticker={ticker.ticker}
                          quote={quote}
                          onUpdateQuote={onUpdateQuote}
                          isLoading={isLoadingQuotes}
                          hasError={quoteErrors[cleanSymbol]}
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '70px' }}>
                        {ticker.ptBear ? `$${parseFloat(ticker.ptBear).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '50px' }}>
                        <span className={getPercentColor(bearPercent)}>
                          {bearPercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '70px' }}>
                        {ticker.ptBase ? `$${parseFloat(ticker.ptBase).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '50px' }}>
                        <span className={getPercentColor(basePercent)}>
                          {basePercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '70px' }}>
                        {ticker.ptBull ? `$${parseFloat(ticker.ptBull).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '50px' }}>
                        <span className={getPercentColor(bullPercent)}>
                          {bullPercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-sm text-gray-900">
                        <div className="break-words whitespace-normal max-w-xs" title={ticker.thesis}>
                          {ticker.thesis}
                        </div>
                      </td>
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
        </div>
        
        {groupedData.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No investment ideas found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Analyst Detail Page Component with quotes integration
const AnalystDetailPage = ({ tickers, analysts, selectedAnalyst, onSelectAnalyst, quotes }) => {
 const statusOrder = ['Current', 'On-Deck', 'Portfolio', 'New', 'Old'];
 
 const analystTickers = tickers.filter(ticker => ticker.analyst === selectedAnalyst);
 const groupedTickers = statusOrder.reduce((acc, status) => {
   acc[status] = analystTickers.filter(ticker => ticker.status === status);
   return acc;
 }, {});

 // PDF Export Function for Analyst Detail
 const exportToPDF = () => {
   try {
     console.log('Starting Analyst Detail PDF export...');
     const doc = new jsPDF('landscape');
     
     // Add title
     doc.setFontSize(18);
     doc.text(`Clearline Flow - Analyst Detail: ${selectedAnalyst}`, 14, 22);
     
     // Add timestamp
     doc.setFontSize(10);
     doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
     
     // Prepare data for the PDF table
     const tableData = [];
     
     statusOrder.forEach(status => {
       const statusTickers = groupedTickers[status];
       if (statusTickers.length > 0) {
         // Add status header row
         tableData.push([`${status} (${statusTickers.length})`, '', '', '', '', '']);
         
         // Add ticker data rows
         statusTickers.forEach(ticker => {
           const cleanSymbol = ticker.ticker.replace(' US', '');
           const quote = quotes[cleanSymbol];
           const currentPrice = quote ? quote.price : ticker.currentPrice;
           
           const row = [
             ticker.ticker || '-',
             ticker.name || '-',
             ticker.lsPosition || '-',
             ticker.priority || '-',
             currentPrice ? `$${parseFloat(currentPrice).toFixed(2)}` : '-',
             ticker.thesis || '-'
           ];
           tableData.push(row);
         });
       }
     });
     
     console.log('Analyst Detail table data:', tableData);
     
     // Create the PDF table
     autoTable(doc, {
       head: [['Ticker', 'Name', 'L/S', 'Priority', 'Current Price', 'Thesis']],
       body: tableData,
       startY: 40,
       styles: {
         fontSize: 8,
         cellPadding: 3,
       },
       headStyles: {
         fillColor: [75, 85, 99],
         textColor: 255,
         fontStyle: 'bold'
       },
       columnStyles: {
         0: { cellWidth: 25 }, // Ticker
         1: { cellWidth: 50 }, // Name
         2: { cellWidth: 20 }, // L/S
         3: { cellWidth: 20 }, // Priority
         4: { cellWidth: 25 }, // Current Price
         5: { cellWidth: 115 } // Thesis
       },
       didParseCell: function(data) {
         // Highlight status header rows
         if (data.cell.text[0] && (
           data.cell.text[0].includes('Current (') || 
           data.cell.text[0].includes('On-Deck (') || 
           data.cell.text[0].includes('Portfolio (') ||
           data.cell.text[0].includes('New (') ||
           data.cell.text[0].includes('Old (')
         )) {
           data.cell.styles.fillColor = [229, 231, 235]; // Light gray background
           data.cell.styles.fontStyle = 'bold';
         }
       }
     });
     
     // Save the PDF
     const fileName = `analyst-detail-${selectedAnalyst.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`;
     console.log('Saving Analyst Detail PDF as:', fileName);
     doc.save(fileName);
     console.log('Analyst Detail PDF export completed successfully');
   } catch (error) {
     console.error('Error exporting Analyst Detail PDF:', error);
     alert(`Error exporting PDF: ${error.message}`);
   }
 };

 return (
   <div className="space-y-6">
     <div className="flex items-center justify-between">
       <h3 className="text-lg leading-6 font-medium text-gray-900">
         Analyst Detail Output
       </h3>
       <div className="flex items-center space-x-4">
         <button
           onClick={exportToPDF}
           className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
         >
           <Download className="h-4 w-4" />
           <span>Export to PDF</span>
         </button>
         <div className="flex items-center space-x-2">
           <label className="text-sm font-medium text-gray-700">Select Analyst:</label>
           <select
             value={selectedAnalyst}
             onChange={(e) => onSelectAnalyst(e.target.value)}
             className="border border-gray-300 rounded-md px-3 py-1 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
           >
             {analysts.map(analyst => (
               <option key={analyst} value={analyst}>{analyst}</option>
             ))}
           </select>
         </div>
       </div>
     </div>
     
     <div className="bg-gray-100 px-4 py-2 rounded">
       <p className="text-sm text-gray-600">
         Showing {analystTickers.length} ideas for analyst {selectedAnalyst}
       </p>
     </div>
     
     {statusOrder.map(status => {
       const statusTickers = groupedTickers[status];
       if (statusTickers.length === 0) return null;
       
       return (
         <div key={status} className="bg-white shadow rounded-lg">
           <div className="px-4 py-3 border-b border-gray-200">
             <h4 className="text-md font-medium text-gray-900">
               {status} ({statusTickers.length})
             </h4>
           </div>
           <div className="overflow-x-auto">
             <table className="min-w-full divide-y divide-gray-200">
               <thead className="bg-gray-50">
                 <tr>
                   <th className="w-24 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticker</th>
                   <th className="w-48 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                   <th className="w-20 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">L/S</th>
                   <th className="w-20 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                   <th className="w-28 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Price</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thesis</th>
                 </tr>
               </thead>
               <tbody className="bg-white divide-y divide-gray-200">
                 {statusTickers.map((ticker) => {
                   const cleanSymbol = ticker.ticker.replace(' US', '');
                   const quote = quotes[cleanSymbol];
                   
                   return (
                     <tr key={ticker.id}>
                       <td className="w-24 px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                         {ticker.ticker}
                       </td>
                       <td className="w-48 px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                         {ticker.name}
                       </td>
                       <td className="w-20 px-6 py-4 whitespace-nowrap">
                         <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                           ticker.lsPosition === 'Long' 
                             ? 'bg-green-100 text-green-800' 
                             : 'bg-red-100 text-red-800'
                         }`}>
                           {ticker.lsPosition}
                         </span>
                       </td>
                       <td className="w-20 px-6 py-4 whitespace-nowrap">
                         <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                           ticker.priority === 'A' ? 'bg-red-100 text-red-800' :
                           ticker.priority === 'B' ? 'bg-yellow-100 text-yellow-800' :
                           ticker.priority === 'C' ? 'bg-blue-100 text-blue-800' :
                           'bg-gray-100 text-gray-800'
                         }`}>
                           {ticker.priority}
                         </span>
                       </td>
                       <td className="w-28 px-6 py-4 whitespace-nowrap">
                         <QuoteDisplay 
                           ticker={ticker.ticker}
                           quote={quote}
                           isLoading={false}
                           hasError={false}
                         />
                       </td>
                       <td className="px-6 py-4 text-sm text-gray-500">
                         <div className="break-words">
                           {ticker.thesis}
                         </div>
                       </td>
                     </tr>
                   );
                 })}
               </tbody>
             </table>
           </div>
         </div>
       );
     })}
     
     {analystTickers.length === 0 && (
       <div className="bg-white shadow rounded-lg p-6">
         <p className="text-center text-gray-500">No ideas assigned to analyst {selectedAnalyst}</p>
       </div>
     )}
   </div>
 );
};

// Team Output Page Component
const TeamOutputPage = ({ tickers, analysts }) => {
 const getTickersForCell = (analyst, status, lsPosition) => {
   return tickers.filter(ticker => 
     ticker.analyst === analyst && 
     ticker.status === status && 
     ticker.lsPosition === lsPosition
   );
 };

 const getUnassignedTickersForCell = (status, lsPosition) => {
   return tickers.filter(ticker => 
     (!ticker.analyst || ticker.analyst === '') && 
     ticker.status === status && 
     ticker.lsPosition === lsPosition &&
     ['Current', 'On-Deck', 'Portfolio'].includes(ticker.status)
   );
 };

 // PDF Export Function
 const exportToPDF = () => {
   try {
     console.log('Starting PDF export...');
     const doc = new jsPDF('landscape');
     
     // Add title
     doc.setFontSize(18);
     doc.text('Clearline Flow - Team Output Matrix', 14, 22);
     
     // Add timestamp
     doc.setFontSize(10);
     doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
     
     // Prepare data for the PDF table
     const tableData = [];
     console.log('Analysts:', analysts);
     
     // Add analyst rows
     analysts.forEach(analyst => {
       const row = [analyst];
       
       // Current-Long
       const currentLong = getTickersForCell(analyst, 'Current', 'Long');
       row.push(currentLong.map(t => t.ticker).join(', ') || '-');
       
       // Current-Short  
       const currentShort = getTickersForCell(analyst, 'Current', 'Short');
       row.push(currentShort.map(t => t.ticker).join(', ') || '-');
       
       // OnDeck-Long
       const onDeckLong = getTickersForCell(analyst, 'On-Deck', 'Long');
       row.push(onDeckLong.map(t => t.ticker).join(', ') || '-');
       
       // OnDeck-Short
       const onDeckShort = getTickersForCell(analyst, 'On-Deck', 'Short');
       row.push(onDeckShort.map(t => t.ticker).join(', ') || '-');
       
       // Portfolio-Long
       const portfolioLong = getTickersForCell(analyst, 'Portfolio', 'Long');
       row.push(portfolioLong.map(t => t.ticker).join(', ') || '-');
       
       // Portfolio-Short
       const portfolioShort = getTickersForCell(analyst, 'Portfolio', 'Short');
       row.push(portfolioShort.map(t => t.ticker).join(', ') || '-');
       
       tableData.push(row);
     });
     
     // Add "To Assign" row
     const toAssignRow = ['To Assign'];
     toAssignRow.push(getUnassignedTickersForCell('Current', 'Long').map(t => t.ticker).join(', ') || '-');
     toAssignRow.push(getUnassignedTickersForCell('Current', 'Short').map(t => t.ticker).join(', ') || '-');
     toAssignRow.push(getUnassignedTickersForCell('On-Deck', 'Long').map(t => t.ticker).join(', ') || '-');
     toAssignRow.push(getUnassignedTickersForCell('On-Deck', 'Short').map(t => t.ticker).join(', ') || '-');
     toAssignRow.push(getUnassignedTickersForCell('Portfolio', 'Long').map(t => t.ticker).join(', ') || '-');
     toAssignRow.push(getUnassignedTickersForCell('Portfolio', 'Short').map(t => t.ticker).join(', ') || '-');
     tableData.push(toAssignRow);
     
     console.log('Table data:', tableData);
     
     // Create the PDF table using the correct autoTable syntax
     autoTable(doc, {
       head: [['Analyst', 'Current-Long', 'Current-Short', 'OnDeck-Long', 'OnDeck-Short', 'Portfolio-Long', 'Portfolio-Short']],
       body: tableData,
       startY: 40,
       styles: {
         fontSize: 8,
         cellPadding: 3,
       },
       headStyles: {
         fillColor: [75, 85, 99], // Gray color
         textColor: 255,
         fontStyle: 'bold'
       },
       alternateRowStyles: {
         fillColor: [248, 250, 252] // Light gray
       },
       columnStyles: {
         0: { cellWidth: 30 }, // Analyst column
         1: { cellWidth: 35 }, // Current-Long
         2: { cellWidth: 35 }, // Current-Short
         3: { cellWidth: 35 }, // OnDeck-Long
         4: { cellWidth: 35 }, // OnDeck-Short
         5: { cellWidth: 35 }, // Portfolio-Long
         6: { cellWidth: 35 }  // Portfolio-Short
       },
       didParseCell: function(data) {
         // Highlight "To Assign" row
         if (data.row.index === analysts.length) {
           data.cell.styles.fillColor = [254, 226, 226]; // Light red background
           data.cell.styles.fontStyle = 'bold';
         }
       }
     });
     
     // Save the PDF
     const fileName = `team-output-matrix-${new Date().toISOString().split('T')[0]}.pdf`;
     console.log('Saving PDF as:', fileName);
     doc.save(fileName);
     console.log('PDF export completed successfully');
   } catch (error) {
     console.error('Error exporting PDF:', error);
     alert(`Error exporting PDF: ${error.message}`);
   }
 };

 return (
   <div className="bg-white shadow rounded-lg">
     <div className="px-4 py-5 sm:p-6">
       <div className="flex items-center justify-between mb-4">
         <h3 className="text-lg leading-6 font-medium text-gray-900">
           Team Output Matrix
         </h3>
         <button
           onClick={exportToPDF}
           className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
         >
           <Download className="h-4 w-4" />
           <span>Export to PDF</span>
         </button>
       </div>
       
       <div className="overflow-x-auto">
         <table className="min-w-full divide-y divide-gray-200">
           <thead className="bg-gray-50">
             <tr>
               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                 Analyst
               </th>
               <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                 Current-Long
               </th>
               <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                 Current-Short
               </th>
               <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                 OnDeck-Long
               </th>
               <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                 OnDeck-Short
               </th>
               <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                 Portfolio-Long
               </th>
               <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                 Portfolio-Short
               </th>
             </tr>
           </thead>
           <tbody className="bg-white divide-y divide-gray-200">
             {analysts.map((analyst) => (
               <tr key={analyst}>
                 <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                   {analyst}
                 </td>
                 <td className="px-6 py-4 text-center">
                   <div className="space-y-1">
                     {getTickersForCell(analyst, 'Current', 'Long').map(ticker => (
                       <div key={ticker.id} className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                         {ticker.ticker}
                       </div>
                     ))}
                   </div>
                 </td>
                 <td className="px-6 py-4 text-center">
                   <div className="space-y-1">
                     {getTickersForCell(analyst, 'Current', 'Short').map(ticker => (
                       <div key={ticker.id} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                         {ticker.ticker}
                       </div>
                     ))}
                   </div>
                 </td>
                 <td className="px-6 py-4 text-center">
                   <div className="space-y-1">
                     {getTickersForCell(analyst, 'On-Deck', 'Long').map(ticker => (
                       <div key={ticker.id} className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                         {ticker.ticker}
                       </div>
                     ))}
                   </div>
                 </td>
                 <td className="px-6 py-4 text-center">
                   <div className="space-y-1">
                     {getTickersForCell(analyst, 'On-Deck', 'Short').map(ticker => (
                       <div key={ticker.id} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                         {ticker.ticker}
                       </div>
                     ))}
                   </div>
                 </td>
                 <td className="px-6 py-4 text-center">
                   <div className="space-y-1">
                     {getTickersForCell(analyst, 'Portfolio', 'Long').map(ticker => (
                       <div key={ticker.id} className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                         {ticker.ticker}
                       </div>
                     ))}
                   </div>
                 </td>
                 <td className="px-6 py-4 text-center">
                   <div className="space-y-1">
                     {getTickersForCell(analyst, 'Portfolio', 'Short').map(ticker => (
                       <div key={ticker.id} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                         {ticker.ticker}
                       </div>
                     ))}
                   </div>
                 </td>
               </tr>
             ))}
             
             {/* To Assign Row */}
             <tr className="bg-gray-50">
               <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                 To Assign
               </td>
               <td className="px-6 py-4 text-center">
                 <div className="space-y-1">
                   {getUnassignedTickersForCell('Current', 'Long').map(ticker => (
                     <div key={ticker.id} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                       {ticker.ticker}
                     </div>
                   ))}
                 </div>
               </td>
               <td className="px-6 py-4 text-center">
                 <div className="space-y-1">
                   {getUnassignedTickersForCell('Current', 'Short').map(ticker => (
                     <div key={ticker.id} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                       {ticker.ticker}
                     </div>
                   ))}
                 </div>
               </td>
               <td className="px-6 py-4 text-center">
                 <div className="space-y-1">
                   {getUnassignedTickersForCell('On-Deck', 'Long').map(ticker => (
                     <div key={ticker.id} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                       {ticker.ticker}
                     </div>
                   ))}
                 </div>
               </td>
               <td className="px-6 py-4 text-center">
                 <div className="space-y-1">
                   {getUnassignedTickersForCell('On-Deck', 'Short').map(ticker => (
                     <div key={ticker.id} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                       {ticker.ticker}
                     </div>
                   ))}
                 </div>
               </td>
               <td className="px-6 py-4 text-center">
                 <div className="space-y-1">
                   {getUnassignedTickersForCell('Portfolio', 'Long').map(ticker => (
                     <div key={ticker.id} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                       {ticker.ticker}
                     </div>
                   ))}
                 </div>
               </td>
               <td className="px-6 py-4 text-center">
                 <div className="space-y-1">
                   {getUnassignedTickersForCell('Portfolio', 'Short').map(ticker => (
                     <div key={ticker.id} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                       {ticker.ticker}
                     </div>
                   ))}
                 </div>
               </td>
             </tr>
           </tbody>
         </table>
       </div>
     </div>
   </div>
 );
};

// Earnings Tracking Page Component
const EarningsTrackingPage = ({ tickers, selectedCYQ, onSelectCYQ, selectedEarningsAnalyst, onSelectEarningsAnalyst, earningsData, onUpdateEarnings, getEarningsData, onRefreshEarnings, analysts }) => {
  // Filter tickers to only show Portfolio status
  let portfolioTickers = tickers.filter(ticker => ticker.status === 'Portfolio');
  
  // Apply analyst filter if selected
  if (selectedEarningsAnalyst) {
    portfolioTickers = portfolioTickers.filter(ticker => ticker.analyst === selectedEarningsAnalyst);
  }
  
  // Generate CYQ options (current year and next year, all quarters)
  const currentYear = new Date().getFullYear();
  const cyqOptions = [];
  for (let year of [currentYear - 1, currentYear, currentYear + 1]) {
    for (let quarter of ['Q1', 'Q2', 'Q3', 'Q4']) {
      cyqOptions.push(`${year}${quarter}`);
    }
  }

  // Calculate days until earnings
  const calculateDaysUntilEarnings = (earningsDate) => {
    if (!earningsDate) return 999999; // Put items without dates at the bottom
    const today = new Date();
    const earnings = new Date(earningsDate);
    const diffTime = earnings - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Sort tickers by Days Until Earnings (smallest first)
  const sortedTickers = [...portfolioTickers].sort((a, b) => {
    const aEarningsData = getEarningsData(a.ticker, selectedCYQ);
    const bEarningsData = getEarningsData(b.ticker, selectedCYQ);
    const aDays = calculateDaysUntilEarnings(aEarningsData.earningsDate);
    const bDays = calculateDaysUntilEarnings(bEarningsData.earningsDate);
    return aDays - bDays;
  });

  // Format days for display
  const formatDaysUntilEarnings = (earningsDate) => {
    if (!earningsDate) return '-';
    const days = calculateDaysUntilEarnings(earningsDate);
    if (days === 999999) return '-';
    return days;
  };

  // Refresh earnings state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');

  // Handle refresh earnings dates
  const handleRefreshEarnings = async () => {
    if (!onRefreshEarnings || sortedTickers.length === 0) return;

    setIsRefreshing(true);
    setRefreshMessage('Fetching earnings dates from Alpha Vantage...');

    try {
      const result = await onRefreshEarnings(sortedTickers, selectedCYQ);
      
      if (result.success > 0) {
        setRefreshMessage(`✅ Successfully updated ${result.success} earnings dates`);
      } else {
        setRefreshMessage('⚠️ No earnings dates were updated');
      }

      // Show any errors
      if (Object.keys(result.errors).length > 0) {
        console.warn('Earnings refresh errors:', result.errors);
      }

      // Clear message after 5 seconds
      setTimeout(() => {
        setRefreshMessage('');
      }, 5000);

    } catch (error) {
      console.error('Error refreshing earnings:', error);
      setRefreshMessage(`❌ Error: ${error.message}`);
      
      setTimeout(() => {
        setRefreshMessage('');
      }, 5000);
    } finally {
      setIsRefreshing(false);
    }
  };

  // PDF Export Function for Earnings Tracking
  const exportToPDF = () => {
    try {
      console.log('Starting Earnings Tracking PDF export...');
      const doc = new jsPDF('landscape');
      
      // Add title
      doc.setFontSize(18);
      const title = selectedEarningsAnalyst 
        ? `Clearline Flow - Earnings Tracking: ${selectedEarningsAnalyst} (${selectedCYQ})`
        : `Clearline Flow - Earnings Tracking: All Analysts (${selectedCYQ})`;
      doc.text(title, 14, 22);
      
      // Add timestamp
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
      
      // Prepare data for the PDF table
      const tableData = [];
      
      sortedTickers.forEach(ticker => {
        const currentEarningsData = getEarningsData(ticker.ticker, selectedCYQ);
        
        const row = [
          ticker.ticker || '-',
          ticker.analyst || '-',
          selectedCYQ || '-',
          formatDaysUntilEarnings(currentEarningsData.earningsDate) || '-',
          currentEarningsData.earningsDate || '-',
          currentEarningsData.qpCallDate || '-',
          currentEarningsData.quarterlyPrint || '-',
          currentEarningsData.preMarketTimeSlot || '-'
        ];
        tableData.push(row);
      });
      
      console.log('Earnings Tracking table data:', tableData);
      
      // Create the PDF table
      autoTable(doc, {
        head: [['Ticker', 'Analyst', 'CYQ', 'Days Until', 'Earnings Date', 'QP Call Date', 'Quarterly Print', 'Pre-Market Slot']],
        body: tableData,
        startY: 40,
        styles: {
          fontSize: 8,
          cellPadding: 3,
        },
        headStyles: {
          fillColor: [75, 85, 99],
          textColor: 255,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 25 }, // Ticker
          1: { cellWidth: 25 }, // Analyst
          2: { cellWidth: 20 }, // CYQ
          3: { cellWidth: 25 }, // Days Until
          4: { cellWidth: 30 }, // Earnings Date
          5: { cellWidth: 30 }, // QP Call Date
          6: { cellWidth: 35 }, // Quarterly Print
          7: { cellWidth: 35 }  // Pre-Market Slot
        }
      });
      
      // Save the PDF
      const analystSuffix = selectedEarningsAnalyst ? `-${selectedEarningsAnalyst.replace(/\s+/g, '-').toLowerCase()}` : '-all-analysts';
      const fileName = `earnings-tracking${analystSuffix}-${selectedCYQ}-${new Date().toISOString().split('T')[0]}.pdf`;
      console.log('Saving Earnings Tracking PDF as:', fileName);
      doc.save(fileName);
      console.log('Earnings Tracking PDF export completed successfully');
    } catch (error) {
      console.error('Error exporting Earnings Tracking PDF:', error);
      alert(`Error exporting PDF: ${error.message}`);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Earnings Tracking ({sortedTickers.length} Portfolio tickers)
          </h3>
          <div className="flex items-center space-x-4">
            <button
              onClick={exportToPDF}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <Download className="h-4 w-4" />
              <span>Export to PDF</span>
            </button>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Analyst:</label>
              <select
                value={selectedEarningsAnalyst}
                onChange={(e) => onSelectEarningsAnalyst(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">All Analysts</option>
                {analysts.map(analyst => (
                  <option key={analyst} value={analyst}>{analyst}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">CYQ:</label>
              <select
                value={selectedCYQ}
                onChange={(e) => onSelectCYQ(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                {cyqOptions.map(cyq => (
                  <option key={cyq} value={cyq}>{cyq}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleRefreshEarnings}
              disabled={isRefreshing || sortedTickers.length === 0}
              className={`flex items-center space-x-1 px-3 py-1 rounded text-sm font-medium ${
                isRefreshing || sortedTickers.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh Earnings Dates</span>
            </button>
          </div>
        </div>
        
        {refreshMessage && (
          <div className={`mb-4 p-3 rounded-md ${
            refreshMessage.includes('✅') ? 'bg-green-100 text-green-700' :
            refreshMessage.includes('⚠️') ? 'bg-yellow-100 text-yellow-700' :
            refreshMessage.includes('❌') ? 'bg-red-100 text-red-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {refreshMessage}
          </div>
        )}
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticker</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Analyst</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CYQ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days Until Earnings</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Earnings Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">QP Call Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preview Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Callback Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedTickers.map((ticker) => (
                <EarningsTrackingRow 
                  key={`${ticker.ticker}-${selectedCYQ}`}
                  ticker={ticker}
                  cyq={selectedCYQ}
                  earningsData={getEarningsData(ticker.ticker, selectedCYQ)}
                  onUpdateEarnings={onUpdateEarnings}
                  formatDaysUntilEarnings={formatDaysUntilEarnings}
                />
              ))}
            </tbody>
          </table>
        </div>
        
        {sortedTickers.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">
              {selectedEarningsAnalyst 
                ? `No Portfolio tickers found for analyst ${selectedEarningsAnalyst}.`
                : 'No Portfolio tickers found.'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Earnings Tracking Row Component
const EarningsTrackingRow = ({ ticker, cyq, earningsData, onUpdateEarnings, formatDaysUntilEarnings }) => {
 const [isEditing, setIsEditing] = useState(false);
 const [editData, setEditData] = useState({
   earningsDate: earningsData.earningsDate || '',
   qpCallDate: earningsData.qpCallDate || '',
   previewDate: earningsData.previewDate || '',
   callbackDate: earningsData.callbackDate || ''
 });

 const handleSave = () => {
   onUpdateEarnings(ticker.ticker, cyq, editData);
   setIsEditing(false);
 };

 const handleCancel = () => {
   setEditData({
     earningsDate: earningsData.earningsDate || '',
     qpCallDate: earningsData.qpCallDate || '',
     previewDate: earningsData.previewDate || '',
     callbackDate: earningsData.callbackDate || ''
   });
   setIsEditing(false);
 };

 const daysUntilEarnings = formatDaysUntilEarnings(earningsData.earningsDate);

 if (isEditing) {
   return (
     <tr className="bg-blue-50">
       <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
         {ticker.ticker}
       </td>
       <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
         {ticker.analyst || '-'}
       </td>
       <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
         {cyq}
       </td>
       <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
         {daysUntilEarnings}
       </td>
       <td className="px-6 py-4 whitespace-nowrap">
         <input
           type="date"
           value={editData.earningsDate}
           onChange={(e) => setEditData({...editData, earningsDate: e.target.value})}
           className="text-sm border border-gray-300 rounded px-2 py-1"
         />
       </td>
       <td className="px-6 py-4 whitespace-nowrap">
         <input
           type="date"
           value={editData.qpCallDate}
           onChange={(e) => setEditData({...editData, qpCallDate: e.target.value})}
           className="text-sm border border-gray-300 rounded px-2 py-1"
         />
       </td>
       <td className="px-6 py-4 whitespace-nowrap">
         <input
           type="date"
           value={editData.previewDate}
           onChange={(e) => setEditData({...editData, previewDate: e.target.value})}
           className="text-sm border border-gray-300 rounded px-2 py-1"
         />
       </td>
       <td className="px-6 py-4 whitespace-nowrap">
         <input
           type="date"
           value={editData.callbackDate}
           onChange={(e) => setEditData({...editData, callbackDate: e.target.value})}
           className="text-sm border border-gray-300 rounded px-2 py-1"
         />
       </td>
       <td className="px-6 py-4 whitespace-nowrap text-sm">
         <div className="flex space-x-2">
           <button
             onClick={handleSave}
             className="text-green-600 hover:text-green-900 text-xs"
           >
             Save
           </button>
           <button
             onClick={handleCancel}
             className="text-red-600 hover:text-red-900 text-xs"
           >
             Cancel
           </button>
         </div>
       </td>
     </tr>
   );
 }

 return (
   <tr className="hover:bg-gray-50" onDoubleClick={() => setIsEditing(true)}>
     <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
       {ticker.ticker}
     </td>
     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
       {ticker.analyst || '-'}
     </td>
     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
       {cyq}
     </td>
     <td className="px-6 py-4 whitespace-nowrap text-sm">
       <span className={`${
         daysUntilEarnings !== '-' && daysUntilEarnings <= 7 ? 'text-red-600 font-medium' :
         daysUntilEarnings !== '-' && daysUntilEarnings <= 30 ? 'text-yellow-600 font-medium' :
         'text-gray-900'
       }`}>
         {daysUntilEarnings}
       </span>
     </td>
     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
       {earningsData.earningsDate || '-'}
     </td>
     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
       {earningsData.qpCallDate || '-'}
     </td>
     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
       {earningsData.previewDate || '-'}
     </td>
     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
       {earningsData.callbackDate || '-'}
     </td>
     <td className="px-6 py-4 whitespace-nowrap text-sm">
       <button
         onClick={() => setIsEditing(true)}
         className="text-blue-600 hover:text-blue-900 text-xs font-bold border border-blue-500 px-2 py-1 rounded"
       >
         🔧 Edit {ticker.ticker}
       </button>
     </td>
   </tr>
 );
};

// Todo List Page Component
const TodoListPage = ({ todos, selectedTodoAnalyst, onSelectTodoAnalyst, onAddTodo, onUpdateTodo, onDeleteTodo, analysts, userRole }) => {
  const [sortField, setSortField] = useState('dateEntered');
  const [sortDirection, setSortDirection] = useState('desc');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTodo, setNewTodo] = useState({
    ticker: '',
    analyst: '',
    priority: 'medium',
    item: ''
  });

  // Calculate days since entered
  const calculateDaysSinceEntered = (dateEntered) => {
    const entered = new Date(dateEntered);
    const now = new Date();
    const diffTime = Math.abs(now - entered);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // Filter todos based on selected analyst
  const filteredTodos = selectedTodoAnalyst 
    ? todos.filter(todo => todo.analyst === selectedTodoAnalyst)
    : todos;

  // Separate open and recently closed todos
  const openTodos = filteredTodos.filter(todo => todo.isOpen);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentlyClosedTodos = filteredTodos.filter(todo => 
    !todo.isOpen && todo.dateClosed && new Date(todo.dateClosed) >= sevenDaysAgo
  );

  // Sort function
  const sortTodos = (todosToSort) => {
    if (!sortField) return todosToSort;
    
    return [...todosToSort].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      
      // Handle date fields
      if (sortField === 'dateEntered' || sortField === 'dateClosed') {
        aVal = new Date(aVal || 0);
        bVal = new Date(bVal || 0);
      }
      // Handle priority field with custom order
      else if (sortField === 'priority') {
        const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
        aVal = priorityOrder[aVal] || 0;
        bVal = priorityOrder[bVal] || 0;
      }
      // Handle string fields
      else if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  };

  // Handle sort
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sortable header component
  const SortableHeader = ({ field, children }) => (
    <th 
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Todo List</h1>
        <div className="flex space-x-4">
          <button
            onClick={() => {
              const doc = new jsPDF();
              
              // Title
              doc.setFontSize(16);
              doc.text('Todo List Report', 20, 20);
              
              // Filter info
              doc.setFontSize(10);
              const filterText = selectedTodoAnalyst ? `Analyst: ${selectedTodoAnalyst}` : 'All Analysts';
              doc.text(filterText, 20, 30);
              doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 35);
              
              // Open todos
              if (openTodos.length > 0) {
                doc.setFontSize(12);
                doc.text('Open Todos', 20, 50);
                
                const openTableData = sortTodos(openTodos).map(todo => [
                  todo.ticker,
                  todo.analyst,
                  formatDate(todo.dateEntered),
                  calculateDaysSinceEntered(todo.dateEntered).toString(),
                  todo.priority,
                  todo.item.length > 50 ? todo.item.substring(0, 50) + '...' : todo.item
                ]);
                
                autoTable(doc, {
                  startY: 55,
                  head: [['Ticker', 'Analyst', 'Date Entered', 'Days Since', 'Priority', 'Item']],
                  body: openTableData,
                  styles: { fontSize: 8 },
                  headStyles: { fillColor: [59, 130, 246] }
                });
              }
              
              // Recently closed todos
              if (recentlyClosedTodos.length > 0) {
                const startY = openTodos.length > 0 ? doc.lastAutoTable.finalY + 20 : 55;
                
                doc.setFontSize(12);
                doc.text('Recently Closed Todos (Last 7 Days)', 20, startY);
                
                const closedTableData = sortTodos(recentlyClosedTodos).map(todo => [
                  todo.ticker,
                  todo.analyst,
                  formatDate(todo.dateEntered),
                  formatDate(todo.dateClosed),
                  todo.priority,
                  todo.item.length > 50 ? todo.item.substring(0, 50) + '...' : todo.item
                ]);
                
                autoTable(doc, {
                  startY: startY + 5,
                  head: [['Ticker', 'Analyst', 'Date Entered', 'Date Closed', 'Priority', 'Item']],
                  body: closedTableData,
                  styles: { fontSize: 8 },
                  headStyles: { fillColor: [34, 197, 94] }
                });
              }
              
              doc.save(`todo-list-${selectedTodoAnalyst || 'all'}-${new Date().toISOString().split('T')[0]}.pdf`);
            }}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </button>
          {(userRole === 'readwrite' || userRole === 'admin') && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Todo
            </button>
          )}
        </div>
      </div>

      {/* Analyst Filter */}
      <div className="flex items-center space-x-4">
        <label className="text-sm font-medium text-gray-700">Filter by Analyst:</label>
        <select
          value={selectedTodoAnalyst}
          onChange={(e) => onSelectTodoAnalyst(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          <option value="">All Analysts</option>
          {analysts.map(analyst => (
            <option key={analyst} value={analyst}>{analyst}</option>
          ))}
        </select>
      </div>

      {/* Add Todo Form - Moved to top */}
      {showAddForm && (userRole === 'readwrite' || userRole === 'admin') && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium mb-4">Add New Todo</h3>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!newTodo.ticker || !newTodo.analyst || !newTodo.item) return;
            
            try {
              await onAddTodo(newTodo);
              setNewTodo({ ticker: '', analyst: '', priority: 'medium', item: '' });
              setShowAddForm(false);
            } catch (error) {
              console.error('Error adding todo:', error);
            }
          }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ticker</label>
              <input
                type="text"
                value={newTodo.ticker}
                onChange={(e) => setNewTodo({...newTodo, ticker: e.target.value.toUpperCase()})}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Analyst</label>
              <select
                value={newTodo.analyst}
                onChange={(e) => setNewTodo({...newTodo, analyst: e.target.value})}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              >
                <option value="">Select Analyst</option>
                {analysts.map(analyst => (
                  <option key={analyst} value={analyst}>{analyst}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={newTodo.priority}
                onChange={(e) => setNewTodo({...newTodo, priority: e.target.value})}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="md:col-span-2 lg:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Actions</label>
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Item Description</label>
              <textarea
                value={newTodo.item}
                onChange={(e) => setNewTodo({...newTodo, item: e.target.value})}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows="3"
                required
              />
            </div>
          </form>
        </div>
      )}

      {/* Open Todos Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Open Todos ({openTodos.length})
        </h2>
        {openTodos.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No open todos found.</p>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortableHeader field="ticker">Ticker</SortableHeader>
                  <SortableHeader field="analyst">Analyst</SortableHeader>
                  <SortableHeader field="dateEntered">Date Entered</SortableHeader>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days Since</th>
                  <SortableHeader field="priority">Priority</SortableHeader>
                  <SortableHeader field="item">Item</SortableHeader>
                  {(userRole === 'readwrite' || userRole === 'admin') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortTodos(openTodos).map((todo) => (
                  <TodoRow 
                    key={todo.id} 
                    todo={todo} 
                    onUpdateTodo={onUpdateTodo}
                    onDeleteTodo={onDeleteTodo}
                    calculateDaysSinceEntered={calculateDaysSinceEntered}
                    formatDate={formatDate}
                    userRole={userRole}
                    hasWriteAccess={userRole === 'readwrite' || userRole === 'admin'}
                    isClosed={false}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recently Closed Todos Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Recently Closed Todos - Last 7 Days ({recentlyClosedTodos.length})
        </h2>
        {recentlyClosedTodos.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No recently closed todos found.</p>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortableHeader field="ticker">Ticker</SortableHeader>
                  <SortableHeader field="analyst">Analyst</SortableHeader>
                  <SortableHeader field="dateEntered">Date Entered</SortableHeader>
                  <SortableHeader field="dateClosed">Date Closed</SortableHeader>
                  <SortableHeader field="priority">Priority</SortableHeader>
                  <SortableHeader field="item">Item</SortableHeader>
                  {(userRole === 'readwrite' || userRole === 'admin') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortTodos(recentlyClosedTodos).map((todo) => (
                  <TodoRow 
                    key={todo.id} 
                    todo={todo} 
                    onUpdateTodo={onUpdateTodo}
                    onDeleteTodo={onDeleteTodo}
                    calculateDaysSinceEntered={calculateDaysSinceEntered}
                    formatDate={formatDate}
                    userRole={userRole}
                    hasWriteAccess={userRole === 'readwrite' || userRole === 'admin'}
                    isClosed={true}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// Todo Row Component with double-click editing
const TodoRow = ({ todo, onUpdateTodo, onDeleteTodo, calculateDaysSinceEntered, formatDate, userRole, hasWriteAccess, isClosed = false }) => {
  const [editingField, setEditingField] = useState(null); // 'priority' or 'item'
  const [editValue, setEditValue] = useState('');

  const handleDoubleClick = (field, currentValue) => {
    if (!hasWriteAccess) return;
    setEditingField(field);
    setEditValue(currentValue);
  };

  const handleSaveEdit = async () => {
    if (editingField && editValue !== todo[editingField]) {
      try {
        await onUpdateTodo(todo.id, { [editingField]: editValue });
      } catch (error) {
        console.error('Error updating todo:', error);
      }
    }
    setEditingField(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <tr className={isClosed ? 'bg-white' : ''}>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {todo.ticker}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {todo.analyst}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {formatDate(todo.dateEntered)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {isClosed ? formatDate(todo.dateClosed) : calculateDaysSinceEntered(todo.dateEntered)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        {editingField === 'priority' ? (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyPress}
            autoFocus
            className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        ) : (
          <span 
            className={`px-2 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 ${getPriorityColor(todo.priority)} ${hasWriteAccess ? 'hover:ring-2 hover:ring-blue-300' : ''}`}
            onDoubleClick={() => handleDoubleClick('priority', todo.priority)}
            title={hasWriteAccess ? 'Double-click to edit' : ''}
          >
            {todo.priority}
          </span>
        )}
      </td>
      <td className="px-6 py-4 text-sm text-gray-900">
        {editingField === 'item' ? (
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyPress}
            autoFocus
            className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows="2"
          />
        ) : (
          <div 
            className={`cursor-pointer hover:bg-gray-50 p-1 rounded break-words ${hasWriteAccess ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
            title={hasWriteAccess ? 'Double-click to edit' : ''}
            onDoubleClick={() => handleDoubleClick('item', todo.item)}
          >
            {todo.item}
          </div>
        )}
      </td>
      {hasWriteAccess && (
        <td className="px-6 py-4 whitespace-nowrap text-sm">
          <div className="flex space-x-2">
            <button
              onClick={() => onUpdateTodo(todo.id, { isOpen: !todo.isOpen })}
              className={`text-xs font-bold border px-2 py-1 rounded ${
                todo.isOpen 
                  ? 'text-green-600 hover:text-green-900 border-green-500' 
                  : 'text-blue-600 hover:text-blue-900 border-blue-500'
              }`}
            >
              {todo.isOpen ? 'Close' : 'Reopen'}
            </button>
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this todo?')) {
                  onDeleteTodo(todo.id);
                }
              }}
              className="text-red-600 hover:text-red-900 text-xs font-bold border border-red-500 px-2 py-1 rounded"
            >
              Delete
            </button>
          </div>
        </td>
      )}
    </tr>
  );
};

// Enhanced Quote Display Component
const QuoteDisplay = ({ ticker, quote, onUpdateQuote, isLoading, hasError }) => {
  const cleanSymbol = ticker.replace(' US', '');
  
  if (!quote) {
    return (
      <div className="text-sm text-gray-500">
        ${ticker?.currentPrice || '-'}
        {hasError && (
          <div className="text-xs text-red-500">Quote error</div>
        )}
      </div>
    );
  }
  
  return (
    <div className="text-sm">
      <div className="font-medium text-gray-900 flex items-center">
        ${quote.price.toFixed(2)}
        {onUpdateQuote && (
          <button
            onClick={() => onUpdateQuote(cleanSymbol)}
            disabled={isLoading}
            className="ml-1 text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400"
          >
            <RefreshCw className={`h-3 w-3 inline ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ClearlineFlow;
