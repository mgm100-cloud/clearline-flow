import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Database, Users, TrendingUp, BarChart3, LogOut, ChevronUp, ChevronDown, RefreshCw, Download, CheckSquare, User, Mail } from 'lucide-react';
import { DatabaseService } from './databaseService';
import { AuthService } from './services/authService';
import LoginScreen from './components/LoginScreen';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// TwelveData API configuration - using environment variable
const TWELVE_DATA_API_KEY = process.env.REACT_APP_TWELVE_DATA_API_KEY || 'YOUR_API_KEY_HERE';
const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

// Financial Modeling Prep API configuration - for earnings data only
const FMP_API_KEY = process.env.REACT_APP_FMP_API_KEY || 'YOUR_FMP_API_KEY_HERE';
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

// Debug environment variables
console.log('🔑 TwelveData API Key Status:', {
  hasKey: !!process.env.REACT_APP_TWELVE_DATA_API_KEY,
  keyLength: process.env.REACT_APP_TWELVE_DATA_API_KEY ? process.env.REACT_APP_TWELVE_DATA_API_KEY.length : 0,
  firstChars: process.env.REACT_APP_TWELVE_DATA_API_KEY ? process.env.REACT_APP_TWELVE_DATA_API_KEY.substring(0, 8) + '...' : 'NOT_SET',
  usingFallback: TWELVE_DATA_API_KEY === 'YOUR_API_KEY_HERE'
});

console.log('📊 FMP API Key Status:', {
  hasKey: !!process.env.REACT_APP_FMP_API_KEY,
  keyLength: process.env.REACT_APP_FMP_API_KEY ? process.env.REACT_APP_FMP_API_KEY.length : 0,
  firstChars: process.env.REACT_APP_FMP_API_KEY ? process.env.REACT_APP_FMP_API_KEY.substring(0, 8) + '...' : 'NOT_SET',
  usingFallback: FMP_API_KEY === 'YOUR_FMP_API_KEY_HERE'
});

// Helper function to calculate percentage change between price targets and current price
const calculatePercentChange = (priceTarget, currentPrice) => {
  if (!priceTarget || !currentPrice || currentPrice === 0) return '';
  const change = (parseFloat(priceTarget) / parseFloat(currentPrice) - 1) * 100;
  return `${change >= 0 ? '+' : ''}${Math.round(change)}%`;
};

// Quote service for TwelveData integration
const QuoteService = {
  // Bloomberg to TwelveData suffix mapping (TwelveData uses different format)
  bloombergToTwelveDataMap: {
    'LN': ':LSE',      // London Stock Exchange
    'GR': ':FWB',      // Germany Frankfurt (Xetra)
    'GY': ':FWB',      // Germany Frankfurt (alternative)
    'CN': ':TSX',      // Canada Toronto Stock Exchange
    'CT': ':TSXV',     // Canada Toronto Venture Exchange
    'JP': ':TYO',      // Japan Tokyo Stock Exchange
    'JT': ':TYO',      // Japan Tokyo Stock Exchange (alternative)
    'HK': ':HKG',      // Hong Kong Stock Exchange
    'AU': ':ASX',      // Australia ASX
    'FP': ':EPA',      // France Euronext Paris
    'IM': ':MTA',      // Italy Borsa Italiana (main market)
    'HM': ':MTA',      // Italy HI-MTF (alternative Italian platform)
    'TE': ':MTA',      // Italy EuroTLX (Italian platform)
    'SM': ':MCE',      // Spain Madrid Stock Exchange
    'SW': ':SWX',      // Switzerland SIX Swiss Exchange
    'SS': ':SHH',      // China Shanghai Stock Exchange
    'SZ': ':SHZ',      // China Shenzhen Stock Exchange
    'IN': ':BSE',      // India Bombay Stock Exchange
    'KS': ':SEO',      // South Korea Seoul Stock Exchange
    'TB': ':BKK',      // Thailand Bangkok Stock Exchange
    'MK': ':KLS',      // Malaysia Kuala Lumpur Stock Exchange
    'SP': ':SGX',      // Singapore Stock Exchange
    'TT': ':TWO',      // Taiwan Stock Exchange
  },

  // Convert Bloomberg format symbol to TwelveData format
  convertBloombergToTwelveData(symbol) {
    if (!symbol || typeof symbol !== 'string') {
      return symbol;
    }

    // Clean the symbol and convert to uppercase
    const cleanSymbol = symbol.trim().toUpperCase();
    
    // Check if symbol has a space-separated suffix (Bloomberg format)
    const parts = cleanSymbol.split(' ');
    
    if (parts.length === 2) {
      const [ticker, bloombergSuffix] = parts;
      const twelveDataSuffix = this.bloombergToTwelveDataMap[bloombergSuffix];
      
      if (twelveDataSuffix) {
        const convertedSymbol = ticker + twelveDataSuffix;
        console.log(`Converted Bloomberg symbol "${symbol}" to TwelveData format "${convertedSymbol}"`);
        return convertedSymbol;
      } else {
        console.warn(`Unknown Bloomberg suffix "${bloombergSuffix}" for symbol "${symbol}". Using original symbol.`);
        return cleanSymbol;
      }
    }
    
    // If no Bloomberg suffix detected, return original symbol
    return cleanSymbol;
  },

  async getQuote(symbol) {
    if (!TWELVE_DATA_API_KEY || TWELVE_DATA_API_KEY === 'YOUR_API_KEY_HERE') {
      throw new Error('TwelveData API key not configured');
    }

    // Convert Bloomberg format to TwelveData format
    const convertedSymbol = this.convertBloombergToTwelveData(symbol);

    try {
      // Use GLOBAL_QUOTE for current market prices
      const url = `${TWELVE_DATA_BASE_URL}/quote?symbol=${convertedSymbol}&apikey=${TWELVE_DATA_API_KEY}`;
      console.log(`Fetching current quote for ${convertedSymbol} (original: ${symbol}) from:`, url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log(`TwelveData global quote response for ${convertedSymbol}:`, data);
      
      // Check for API errors first
      if (data['error']) {
        throw new Error(`TwelveData Error: ${data['error']}`);
      } else if (data['note']) {
        throw new Error('API call frequency limit reached. Please try again later.');
      } else if (data['code'] && data['message']) {
        throw new Error(`TwelveData Error: ${data['message']}`);
      }
      
      // TwelveData quote API returns quote data directly in the response object
      if (data['symbol'] && data['close']) {
        return {
          symbol: convertedSymbol,
          originalSymbol: symbol, // Keep track of original symbol
          price: parseFloat(data['close']),
          change: data['change'] ? parseFloat(data['change']) : null,
          changePercent: data['percent_change'] ? parseFloat(data['percent_change']) : null,
          volume: data['volume'] ? parseInt(data['volume']) : null,
          previousClose: data['previous_close'] ? parseFloat(data['previous_close']) : null,
          high: data['high'] ? parseFloat(data['high']) : null,
          low: data['low'] ? parseFloat(data['low']) : null,
          open: data['open'] ? parseFloat(data['open']) : null,
          lastUpdated: data['datetime'],
          source: 'quote',
          isIntraday: true
        };
      } else {
        throw new Error('No quote data available');
      }
    } catch (error) {
      console.error(`Quote API failed for ${convertedSymbol} (original: ${symbol}):`, error);
      
      // Fallback to price endpoint
      console.log(`Falling back to price endpoint for ${convertedSymbol}...`);
      try {
        return await this.getPriceOnly(symbol);
      } catch (priceError) {
        console.error(`Price fallback also failed for ${convertedSymbol}:`, priceError);
        throw error; // Throw original quote error
      }
    }
  },

  // Fallback price-only endpoint
  async getPriceOnly(symbol) {
    // Convert Bloomberg format to TwelveData format
    const convertedSymbol = this.convertBloombergToTwelveData(symbol);

    try {
      const url = `${TWELVE_DATA_BASE_URL}/price?symbol=${convertedSymbol}&apikey=${TWELVE_DATA_API_KEY}`;
      console.log(`Fetching price-only for ${convertedSymbol} (original: ${symbol}) from:`, url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log(`TwelveData price response for ${convertedSymbol}:`, data);
      
      // Check for API errors
      if (data['error']) {
        throw new Error(`TwelveData Price Error: ${data['error']}`);
      } else if (data['note']) {
        throw new Error('API call frequency limit reached. Please try again later.');
      } else if (data['code'] && data['message']) {
        throw new Error(`TwelveData Price Error: ${data['message']}`);
      }
      
      // Price endpoint returns just the price value
      if (data['price']) {
        return {
          symbol: convertedSymbol,
          originalSymbol: symbol,
          price: parseFloat(data['price']),
          change: null, // Price endpoint doesn't provide change data
          changePercent: null,
          volume: null,
          previousClose: null,
          high: null,
          low: null,
          open: null,
          lastUpdated: new Date().toISOString(),
          source: 'price',
          isIntraday: false
        };
      } else {
        throw new Error('No price data available');
      }
    } catch (error) {
      console.error(`Error fetching price for ${convertedSymbol} (original: ${symbol}):`, error);
      throw error;
    }
  },

  // Fallback method for daily quotes when intraday is not available
  async getGlobalQuote(symbol) {
    // Convert Bloomberg format to TwelveData format
    const convertedSymbol = this.convertBloombergToTwelveData(symbol);

    try {
      const url = `${TWELVE_DATA_BASE_URL}/quote?symbol=${convertedSymbol}&apikey=${TWELVE_DATA_API_KEY}`;
      console.log(`Fetching daily quote for ${convertedSymbol} (original: ${symbol}) from:`, url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      // Check for API errors first
      if (data['error']) {
        throw new Error(`TwelveData Error: ${data['error']}`);
      } else if (data['note']) {
        throw new Error('API call frequency limit reached. Please try again later.');
      } else if (data['code'] && data['message']) {
        throw new Error(`TwelveData Error: ${data['message']}`);
      }
      
      // TwelveData quote API returns quote data directly in the response object
      if (data['symbol'] && data['close']) {
        return {
          symbol: convertedSymbol,
          originalSymbol: symbol, // Keep track of original symbol
          price: parseFloat(data['close']),
          change: data['change'] ? parseFloat(data['change']) : null,
          changePercent: data['percent_change'] ? parseFloat(data['percent_change']) : null,
          volume: data['volume'] ? parseInt(data['volume']) : null,
          previousClose: data['previous_close'] ? parseFloat(data['previous_close']) : null,
          high: data['high'] ? parseFloat(data['high']) : null,
          low: data['low'] ? parseFloat(data['low']) : null,
          open: data['open'] ? parseFloat(data['open']) : null,
          lastUpdated: data['datetime'],
          isIntraday: false
        };
      } else {
        throw new Error('No quote data available');
      }
    } catch (error) {
      console.error(`Error fetching global quote for ${convertedSymbol} (original: ${symbol}):`, error);
      throw error;
    }
  },

  async getCompanyOverview(symbol) {
    if (!TWELVE_DATA_API_KEY || TWELVE_DATA_API_KEY === 'YOUR_API_KEY_HERE') {
      throw new Error('TwelveData API key not configured');
    }

    // Convert symbol if it's in Bloomberg format
    const convertedSymbol = this.convertBloombergToTwelveData(symbol);

    try {
      const url = `${TWELVE_DATA_BASE_URL}/profile?symbol=${encodeURIComponent(convertedSymbol)}&apikey=${TWELVE_DATA_API_KEY}`;
      console.log(`Getting company overview for ${convertedSymbol} from:`, url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log(`TwelveData company overview response for ${convertedSymbol}:`, data);
      
      // Check for API limit or error
      if (data['error']) {
        const errorMsg = data['error'];
        throw new Error(`TwelveData error: ${errorMsg}`);
      }

      // Check if data is available (TwelveData returns empty object for unavailable symbols)
      if (!data.symbol || Object.keys(data).length < 5) {
        // International stocks often don't have fundamental data available
        const isInternational = convertedSymbol.includes('.') && !convertedSymbol.includes('.US');
        if (isInternational) {
          console.warn(`Company overview not available for international stock ${convertedSymbol} - this is a known TwelveData limitation`);
          return {
            symbol: convertedSymbol,
            originalSymbol: symbol,
            name: this.extractCompanyNameFromSymbol(symbol),
            marketCap: null,
            description: 'Company overview not available for international stocks via TwelveData',
            industry: null,
            sector: null,
            isInternational: true,
            limitationNote: 'TwelveData has limited fundamental data coverage for international stocks'
          };
        } else {
          throw new Error(`No company data available for ${convertedSymbol}`);
        }
      }
      
      return {
        symbol: convertedSymbol,
        originalSymbol: symbol,
        name: data.name,
        marketCap: data.market_cap ? parseFloat(data.market_cap) : null,
        description: data.description,
        industry: data.industry,
        sector: data.sector,
        peRatio: data.pe_ratio ? parseFloat(data.pe_ratio) : null,
        pegRatio: data.peg_ratio ? parseFloat(data.peg_ratio) : null,
        bookValue: data.book_value ? parseFloat(data.book_value) : null,
        dividendYield: data.dividend_yield ? parseFloat(data.dividend_yield) : null,
        eps: data.eps ? parseFloat(data.eps) : null,
        beta: data.beta ? parseFloat(data.beta) : null,
        weekHigh52: data['52_week_high'] ? parseFloat(data['52_week_high']) : null,
        weekLow52: data['52_week_low'] ? parseFloat(data['52_week_low']) : null
      };
    } catch (error) {
      console.error(`Error fetching company overview for ${convertedSymbol}:`, error);
      throw error;
    }
  },

  // Helper function to extract a basic company name from symbol for international stocks
  extractCompanyNameFromSymbol(symbol) {
    // For international stocks, try to extract a meaningful name from the symbol
    const parts = symbol.split(' ');
    if (parts.length > 1) {
      // Bloomberg format like "RKT LN" - use the base symbol
      return parts[0];
    }
    
    // Symbol with exchange suffix like "RKT.LON"
    const baseParts = symbol.split('.');
    if (baseParts.length > 1) {
      return baseParts[0];
    }
    
    // Default to the symbol itself
    return symbol;
  },

  // Get company market capitalization from Financial Modeling Prep
  async getCompanyMarketcap(symbol) {
    if (!FMP_API_KEY || FMP_API_KEY === 'YOUR_FMP_API_KEY_HERE') {
      throw new Error('Financial Modeling Prep API key not configured');
    }

    // Clean symbol - remove Bloomberg suffixes for FMP (FMP uses standard US symbols)
    const cleanSymbol = symbol.replace(/ US$/, '').trim().toUpperCase();

    try {
      const url = `https://financialmodelingprep.com/stable/market-capitalization?symbol=${cleanSymbol}&apikey=${FMP_API_KEY}`;
      console.log(`Getting market cap for ${cleanSymbol} from:`, url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log(`FMP market cap response for ${cleanSymbol}:`, data);
      
      // Check for API errors
      if (data['Error Message']) {
        throw new Error(`FMP error: ${data['Error Message']}`);
      }

      // FMP returns an array with market cap data
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(`No market cap data available for ${cleanSymbol}`);
      }

      const marketCapData = data[0];
      
      return {
        symbol: cleanSymbol,
        originalSymbol: symbol,
        marketCap: marketCapData.marketCap ? parseFloat(marketCapData.marketCap) : null,
        date: marketCapData.date
      };
      
    } catch (error) {
      console.error(`Error fetching market cap for ${cleanSymbol}:`, error);
      throw error;
    }
  },

  // Get daily volume data with international stock handling
  async getDailyVolumeData(symbol, days = 90) {
    // Convert symbol if it's in Bloomberg format
    const convertedSymbol = this.convertBloombergToTwelveData(symbol);

          try {
        const url = `${TWELVE_DATA_BASE_URL}/time_series?symbol=${encodeURIComponent(convertedSymbol)}&interval=1day&outputsize=${days}&apikey=${TWELVE_DATA_API_KEY}`;
        console.log(`Getting daily volume data for ${convertedSymbol} from:`, url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log(`TwelveData daily volume response for ${convertedSymbol}:`, data);

        // Check for API limit or error
        if (data['status'] === 'error' || data['code']) {
          const errorMsg = data['message'] || data['error'] || 'Unknown error';
          throw new Error(`TwelveData error: ${errorMsg}`);
        }

        const timeSeries = data['values'];
        if (!timeSeries || data['status'] !== 'ok') {
          const isInternational = convertedSymbol.includes(':') && !convertedSymbol.includes(':NASDAQ') && !convertedSymbol.includes(':NYSE');
          if (isInternational) {
            console.warn(`Daily volume data not available for international stock ${convertedSymbol}`);
            return {
              symbol: convertedSymbol,
              originalSymbol: symbol,
              averageDailyVolume: null,
              isInternational: true,
              limitationNote: 'Volume data may be limited for international stocks'
            };
          } else {
            throw new Error(`No daily time series data available for ${convertedSymbol}`);
          }
        }

        // Calculate average daily volume for the specified period
        
        // Take the most recent 'days' worth of data and extract volumes
        const volumes = timeSeries
          .slice(0, days)
          .map(item => parseFloat(item['volume']))
          .filter(vol => vol > 0);
      
      console.log(`📊 Volume calculation for ${convertedSymbol}: Found ${volumes.length} valid volume entries out of ${days} requested days`);
      
      if (volumes.length === 0) {
        return {
          symbol: convertedSymbol,
          originalSymbol: symbol,
          averageDailyVolume: null,
          note: 'No valid volume data found in the specified period'
        };
      }

      const averageVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
      
      return {
        symbol: convertedSymbol,
        originalSymbol: symbol,
        averageDailyVolume: Math.round(averageVolume),
        daysCalculated: volumes.length,
        periodRequested: days
      };
    } catch (error) {
      console.error(`Error fetching daily volume data for ${convertedSymbol}:`, error);
      
      // For international stocks, return a graceful fallback
      const isInternational = convertedSymbol.includes('.') && !convertedSymbol.includes('.US');
      if (isInternational) {
        return {
          symbol: convertedSymbol,
          originalSymbol: symbol,
          averageDailyVolume: null,
          isInternational: true,
          error: 'Volume data not available for international stocks',
          limitationNote: 'TwelveData has limited volume data for international markets'
        };
      }
      
      throw error;
    }
  },

  // Get upcoming earnings date using Financial Modeling Prep with Twelve Data fallback
  async getUpcomingEarningsDate(symbol) {
    // Try FMP first
    const fmpResult = await this.getUpcomingEarningsFromFMP(symbol);
    if (fmpResult) {
      return fmpResult;
    }

    // Fallback to Twelve Data if FMP fails
    console.log(`FMP failed for ${symbol}, falling back to Twelve Data...`);
    return await this.getUpcomingEarningsFromTwelveData(symbol);
  },

  // Get earnings from Financial Modeling Prep
  async getUpcomingEarningsFromFMP(symbol) {
    if (!FMP_API_KEY || FMP_API_KEY === 'YOUR_FMP_API_KEY_HERE') {
      console.warn('Financial Modeling Prep API key not configured, skipping FMP');
      return null;
    }

    // Clean symbol - remove Bloomberg suffixes for FMP (FMP uses standard US symbols)
    const cleanSymbol = symbol.replace(/ US$/, '').trim().toUpperCase();

    try {
      // FMP earnings endpoint for specific symbol
      const url = `https://financialmodelingprep.com/stable/earnings?symbol=${cleanSymbol}&apikey=${FMP_API_KEY}`;
      console.log(`Fetching earnings data for ${cleanSymbol} (original: ${symbol}) from FMP:`, url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log(`FMP earnings response for ${cleanSymbol}:`, JSON.stringify(data).substring(0, 500) + '...');
      
      // Check for API errors
      if (data['Error Message']) {
        console.warn(`FMP earnings error: ${data['Error Message']}`);
        return null;
      }

      // Check if data is array with earnings dates
      if (!Array.isArray(data) || data.length === 0) {
        console.warn(`No earnings data found for ${cleanSymbol} in FMP`);
        return null;
      }

      // Get today's date for comparison
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize to start of day
      
      // Debug logging for PLAY symbol
      if (cleanSymbol === 'PLAY') {
        console.log(`DEBUG PLAY - Today's date (normalized):`, today);
        console.log(`DEBUG PLAY - All earnings dates from FMP:`, data.map(earning => ({
          originalDate: earning.date,
          parsedDateUTC: new Date(earning.date), // Show the problematic UTC parsing
          parsedDateLocal: (() => {
            const dateParts = earning.date.split('-');
            return new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
          })(),
          normalizedDate: (() => {
            const dateParts = earning.date.split('-');
            const d = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
            d.setHours(0, 0, 0, 0);
            return d;
          })(),
          comparison: (() => {
            const dateParts = earning.date.split('-');
            const d = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
            d.setHours(0, 0, 0, 0);
            return `${d} >= ${today} = ${d >= today}`;
          })()
        })));
      }
      
      // Find all future earnings dates
      const futureEarnings = data.filter(earning => {
        if (!earning.date) return false;
        
        // Parse date string as local date, not UTC to avoid timezone issues
        const dateParts = earning.date.split('-');
        const earningDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        earningDate.setHours(0, 0, 0, 0); // Normalize earnings date to start of day
        
        // Debug logging for PLAY symbol
        if (cleanSymbol === 'PLAY') {
          console.log(`DEBUG PLAY - Comparing: ${earningDate} >= ${today} = ${earningDate >= today} for date ${earning.date}`);
        }
        
        return earningDate >= today;
      });

      if (futureEarnings.length === 0) {
        console.warn(`No future earnings found for ${cleanSymbol} in FMP`);
        return null;
      }
      
      // Sort by date and get the next upcoming earnings (earliest future date)
      const sortedEarnings = futureEarnings.sort((a, b) => new Date(a.date) - new Date(b.date));
      const nextEarning = sortedEarnings[0];
      
      const earningsDate = new Date(nextEarning.date);
      
      return {
        symbol: cleanSymbol,
        originalSymbol: symbol,
        nextEarningsDate: nextEarning.date,
        estimatedEPS: nextEarning.eps ? parseFloat(nextEarning.eps) : null,
        estimatedEPSHigh: nextEarning.epsEstimatedHigh ? parseFloat(nextEarning.epsEstimatedHigh) : null,
        estimatedEPSLow: nextEarning.epsEstimatedLow ? parseFloat(nextEarning.epsEstimatedLow) : null,
        estimatedRevenue: nextEarning.revenueEstimated ? parseFloat(nextEarning.revenueEstimated) : null,
        numberOfEstimates: nextEarning.numberOfEstimates ? parseInt(nextEarning.numberOfEstimates) : null,
        time: nextEarning.time || null,
        updatedFromDate: nextEarning.updatedFromDate || null,
        fiscalDateEnding: nextEarning.fiscalDateEnding || null,
        currency: 'USD', // FMP primarily covers US stocks
        source: 'FMP',
        isActual: true, // This is from the actual earnings data
        daysUntilEarnings: Math.ceil((earningsDate - today) / (1000 * 60 * 60 * 24))
      };
      
    } catch (error) {
      console.error(`Error fetching FMP earnings data for ${cleanSymbol} (original: ${symbol}):`, error);
      return null;
    }
  },

  // Fallback to Twelve Data for earnings
  async getUpcomingEarningsFromTwelveData(symbol) {
    if (!TWELVE_DATA_API_KEY || TWELVE_DATA_API_KEY === 'YOUR_API_KEY_HERE') {
      console.warn('Twelve Data API key not configured, cannot use fallback');
      return null;
    }

    // Convert Bloomberg format to TwelveData format
    const convertedSymbol = this.convertBloombergToTwelveData(symbol);

    try {
      const url = `${TWELVE_DATA_BASE_URL}/earnings?symbol=${convertedSymbol}&apikey=${TWELVE_DATA_API_KEY}`;
      console.log(`Fetching earnings data for ${convertedSymbol} (original: ${symbol}) from Twelve Data fallback:`, url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log(`Twelve Data earnings response for ${convertedSymbol}:`, JSON.stringify(data).substring(0, 500) + '...');
      
      // Check for errors or empty response
      if (data['status'] === 'error' || data['code']) {
        const errorMsg = data['message'] || data['error'] || 'Unknown error';
        console.warn(`Twelve Data earnings error for ${convertedSymbol}: ${errorMsg}`);
        return null;
      }

      // Twelve Data earnings endpoint returns different format
      if (!data || !data['earnings'] || !Array.isArray(data['earnings'])) {
        console.warn(`No earnings data found for ${convertedSymbol} in Twelve Data`);
        return null;
      }

      const earnings = data['earnings'];
      if (earnings.length === 0) {
        console.warn(`No earnings data in Twelve Data response for ${convertedSymbol}`);
        return null;
      }
      
      // The next earnings date is the LAST date in the list (as requested)
      const lastEarning = earnings[earnings.length - 1];
      
      if (!lastEarning.date) {
        console.warn(`No date found in last earnings entry for ${convertedSymbol} in Twelve Data`);
        return null;
      }
      
      const earningsDate = new Date(lastEarning.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize to start of day for comparison
      
      return {
        symbol: convertedSymbol,
        originalSymbol: symbol,
        nextEarningsDate: lastEarning.date,
        estimatedEPS: lastEarning.eps_estimate ? parseFloat(lastEarning.eps_estimate) : null,
        actualEPS: lastEarning.eps_actual ? parseFloat(lastEarning.eps_actual) : null,
        reportedEPS: lastEarning.reported_eps ? parseFloat(lastEarning.reported_eps) : null,
        fiscalDateEnding: lastEarning.fiscal_date_ending,
        period: lastEarning.period,
        currency: lastEarning.currency || 'USD',
        source: 'TwelveData',
        isActual: true, // This is from the actual earnings data, not estimated
        daysUntilEarnings: Math.ceil((earningsDate - today) / (1000 * 60 * 60 * 24))
      };
      
    } catch (error) {
      console.error(`Error fetching Twelve Data earnings data for ${convertedSymbol} (original: ${symbol}):`, error);
      return null;
    }
  },

  // Legacy earnings data function (kept for backward compatibility)
  async getEarningsData(symbol) {
    console.warn('getEarningsData is deprecated, use getUpcomingEarningsDate instead');
    return this.getUpcomingEarningsDate(symbol);
  },

  async getBatchQuotes(symbols) {
    const quotes = {};
    const errors = {};
    
    // TwelveData premium tier allows 75 calls per minute
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      try {
        const quote = await this.getQuote(symbol);
        // Use the converted symbol as the key but store original for reference
        const keySymbol = quote.originalSymbol || symbol;
        quotes[keySymbol] = quote;
      } catch (error) {
        errors[symbol] = error.message;
      }
    }
    
    return { quotes, errors };
  },

  async getBatchEarnings(symbols) {
    const earnings = {};
    const errors = {};
    
    // TwelveData premium tier allows 75 calls per minute
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      try {
        const earningsData = await this.getUpcomingEarningsDate(symbol);
        if (earningsData) {
          // Use the original symbol as the key
          const keySymbol = earningsData.originalSymbol || symbol;
          earnings[keySymbol] = earningsData;
        }
      } catch (error) {
        errors[symbol] = error.message;
      }
    }
    
    return { earnings, errors };
  },

  // Symbol search for finding international stocks
  async searchSymbols(keywords) {
    if (!TWELVE_DATA_API_KEY || TWELVE_DATA_API_KEY === 'YOUR_API_KEY_HERE') {
      throw new Error('TwelveData API key not configured');
    }

    try {
      const url = `${TWELVE_DATA_BASE_URL}/symbol_search?symbol=${encodeURIComponent(keywords)}&apikey=${TWELVE_DATA_API_KEY}`;
      console.log(`Searching symbols for "${keywords}" from:`, url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log(`TwelveData symbol search response for "${keywords}":`, data);
      
      if (data['status'] === 'ok' && data['data']) {
        return data['data'].map(match => ({
          symbol: match['symbol'],
          name: match['name'],
          type: match['type'],
          region: match['region'],
          marketOpen: match['market_open'],
          marketClose: match['market_close'],
          timezone: match['timezone'],
          currency: match['currency'],
          matchScore: parseFloat(match['score'])
        }));
      } else if (data['error']) {
        throw new Error(`TwelveData Error: ${data['error']}`);
      } else if (data['note']) {
        throw new Error('API call frequency limit reached. Please try again later.');
      } else {
        return [];
      }
    } catch (error) {
      console.error(`Error searching symbols for "${keywords}":`, error);
      throw error;
    }
  },

  // Debug function to test international stock data availability
  async debugInternationalStock(symbol) {
    console.log(`🔍 Debugging international stock: ${symbol}`);
    
    try {
      // Convert Bloomberg format if needed
      const convertedSymbol = this.convertBloombergToTwelveData(symbol);
      console.log(`📝 Symbol conversion: ${symbol} → ${convertedSymbol}`);
      
      // Test each API endpoint
      const results = {
        symbol: symbol,
        convertedSymbol: convertedSymbol,
        isInternational: convertedSymbol.includes('.') || convertedSymbol.includes(' '),
        timestamp: new Date().toISOString()
      };
      
      // Test Quote API
      console.log('📊 Testing Quote API...');
      try {
        const quote = await this.getQuote(convertedSymbol);
        results.quote = {
          success: true,
          data: quote,
          note: 'Quote data available ✅'
        };
        console.log('✅ Quote API successful:', quote);
      } catch (error) {
        results.quote = {
          success: false,
          error: error.message,
          note: 'Quote data failed ❌'
        };
        console.error('❌ Quote API failed:', error.message);
      }
      
      // Test Company Overview API
      console.log('🏢 Testing Company Overview API...');
      try {
        const overview = await this.getCompanyOverview(convertedSymbol);
        results.overview = {
          success: true,
          data: overview,
          note: overview.isInternational ? 'Limited data for international stock ⚠️' : 'Company data available ✅'
        };
        console.log('✅ Company Overview successful:', overview);
      } catch (error) {
        results.overview = {
          success: false,
          error: error.message,
          note: 'Company overview failed ❌'
        };
        console.error('❌ Company Overview failed:', error.message);
      }
      
      // Test Volume Data API
      console.log('📈 Testing Volume Data API...');
      try {
        const volume = await this.getDailyVolumeData(convertedSymbol);
        results.volume = {
          success: true,
          data: volume,
          note: volume.isInternational ? 'Limited volume data for international stock ⚠️' : 'Volume data available ✅'
        };
        console.log('✅ Volume Data successful:', volume);
      } catch (error) {
        results.volume = {
          success: false,
          error: error.message,
          note: 'Volume data failed ❌'
        };
        console.error('❌ Volume Data failed:', error.message);
      }
      
      // Test Symbol Search API
      console.log('🔍 Testing Symbol Search API...');
      try {
        const search = await this.searchSymbols(symbol.split('.')[0]);
        results.search = {
          success: true,
          data: search,
          note: 'Symbol search available ✅'
        };
        console.log('✅ Symbol Search successful:', search);
      } catch (error) {
        results.search = {
          success: false,
          error: error.message,
          note: 'Symbol search failed ❌'
        };
        console.error('❌ Symbol Search failed:', error.message);
      }
      
      // Test Earnings Calendar API
      console.log('📅 Testing Earnings Calendar API...');
      try {
        const earnings = await this.getUpcomingEarningsDate(convertedSymbol);
        results.earningsCalendar = {
          success: true,
          data: earnings,
          note: earnings ? 'Upcoming earnings date found ✅' : 'No upcoming earnings found ⚠️'
        };
        console.log('✅ Earnings Calendar API successful:', earnings);
      } catch (error) {
        results.earningsCalendar = {
          success: false,
          error: error.message,
          note: 'Earnings calendar failed ❌'
        };
        console.error('❌ Earnings Calendar API failed:', error.message);
      }
      
      // Summary
      const workingAPIs = Object.values(results).filter(r => r.success).length - 4; // subtract metadata fields
      const totalAPIs = 4;
      
      results.summary = {
        workingAPIs: workingAPIs,
        totalAPIs: totalAPIs,
        successRate: `${workingAPIs}/${totalAPIs}`,
        recommendation: results.isInternational ? 
          'International stock - expect limited fundamental data. Quote data should work.' :
          'US stock - all data should be available.',
        dataAvailability: {
          prices: results.quote?.success ? '✅ Available' : '❌ Not Available',
          fundamentals: results.overview?.success && !results.overview?.data?.isInternational ? '✅ Available' : '⚠️ Limited/Not Available',
          volume: results.volume?.success && !results.volume?.data?.isInternational ? '✅ Available' : '⚠️ Limited/Not Available',
          search: results.search?.success ? '✅ Available' : '❌ Not Available'
        }
      };
      
      console.log('📋 Debug Summary:', results.summary);
      console.log('🔍 Full Debug Results:', results);
      
      return results;
      
    } catch (error) {
      console.error('❌ Debug function failed:', error);
      return {
        symbol: symbol,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
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
  const [analysts, setAnalysts] = useState(['LT', 'GA', 'DP', 'MS', 'DO', 'MM']);
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
  const [isRefreshingMarketData, setIsRefreshingMarketData] = useState(false);
  const [isRefreshingCompanyNames, setIsRefreshingCompanyNames] = useState(false);
  
  // Tab switching state
  const [isTabSwitching, setIsTabSwitching] = useState(false);

  // Utility functions for formatting market data
  const formatMarketCap = (marketCapValue) => {
    if (!marketCapValue || marketCapValue === 0) return '-';
    
    // Convert to millions with 1 decimal place and add commas
    const millions = marketCapValue / 1000000;
    return millions.toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
  };

  const formatVolumeDollars = (volumeValue) => {
    if (!volumeValue || volumeValue === 0) return '-';
    const volumeInMillions = volumeValue / 1000000;
    return `${volumeInMillions.toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })}`;
  };

  // Helper function to truncate company names
  const truncateName = (name, maxLength = 20) => {
    if (!name) return '-';
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength) + '...';
  };

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
          const analystCode = AuthService.getUserAnalystCode(user);
          console.log('👤 User role determined:', role);
          console.log('👤 User analyst code:', analystCode);
          console.log('📋 User metadata:', user?.user_metadata);
          setCurrentUser(user);
          setUserRole(role);
          setIsAuthenticated(true);
          
          // Set default analyst selections based on user's analyst_code
          if (analystCode && analysts.includes(analystCode)) {
            setSelectedAnalyst(analystCode);
            setSelectedTodoAnalyst(analystCode);
            // For earnings tracking, set to 'All Analysts' if user is MM, otherwise use their analyst code
            if (analystCode === 'MM') {
              setSelectedEarningsAnalyst('All Analysts');
            } else {
              setSelectedEarningsAnalyst(analystCode);
            }
          }
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
        const analystCode = AuthService.getUserAnalystCode(user);
        console.log('👤 User role determined:', role);
        console.log('👤 User analyst code:', analystCode);
        console.log('📋 User metadata:', user?.user_metadata);
        setCurrentUser(user);
        setUserRole(role);
        setIsAuthenticated(true);
        setAuthError('');
        
        // Set default analyst selections based on user's analyst_code
        if (analystCode && analysts.includes(analystCode)) {
          setSelectedAnalyst(analystCode);
          setSelectedTodoAnalyst(analystCode);
          // For earnings tracking, set to 'All Analysts' if user is MM, otherwise use their analyst code
          if (analystCode === 'MM') {
            setSelectedEarningsAnalyst('All Analysts');
          } else {
            setSelectedEarningsAnalyst(analystCode);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('🚪 User signed out');
        setCurrentUser(null);
        setUserRole('');
        setIsAuthenticated(false);
        setActiveTab('input');
        setAuthError('');
        // Reset to default values
        setSelectedAnalyst('LT');
        setSelectedTodoAnalyst('');
        setSelectedEarningsAnalyst('');
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
    const analystCode = AuthService.getUserAnalystCode(user);
    console.log('👤 User role determined:', role);
    console.log('👤 User analyst code:', analystCode);
    console.log('📋 User metadata:', user?.user_metadata);
    setCurrentUser(user);
    setUserRole(role);
    setIsAuthenticated(true);
    setAuthError('');
    
    // Set default analyst selections based on user's analyst_code
    if (analystCode && analysts.includes(analystCode)) {
      setSelectedAnalyst(analystCode);
      setSelectedTodoAnalyst(analystCode);
      // For earnings tracking, set to 'All Analysts' if user is MM, otherwise use their analyst code
      if (analystCode === 'MM') {
        setSelectedEarningsAnalyst('All Analysts');
      } else {
        setSelectedEarningsAnalyst(analystCode);
      }
    }
    
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
      
      // Update quotes state - using original symbols as keys
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
      // Use the original symbol as the key
      const keySymbol = quote.originalSymbol || cleanSymbol;
      setQuotes(prev => ({ ...prev, [keySymbol]: quote }));
      
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
      
      // Get quote, market cap, and volume data
      const [quote, marketCapData, volumeData] = await Promise.all([
        QuoteService.getQuote(cleanSymbol).catch(error => {
          console.warn(`Could not fetch quote for ${cleanSymbol}:`, error.message);
          return null;
        }),
        QuoteService.getCompanyMarketcap(cleanSymbol).catch(error => {
          console.warn(`Could not fetch market cap for ${cleanSymbol}:`, error.message);
          return null;
        }),
        QuoteService.getDailyVolumeData(cleanSymbol).catch(error => {
          console.warn(`Could not fetch volume data for ${cleanSymbol}:`, error.message);
          return null;
        })
      ]);

      // Determine if this is an international stock
      const isInternational = volumeData?.isInternational || 
                              cleanSymbol.includes('.') || cleanSymbol.includes(' ');

      // Create the stock data object with fallbacks for international stocks
      const stockData = {
        ticker: ticker,
        originalSymbol: cleanSymbol,
        convertedSymbol: quote?.symbol || marketCapData?.symbol || cleanSymbol,
        
        // Price data (usually available for international stocks)
        price: quote?.price || Math.random() * 100 + 20,
        change: quote?.change || (Math.random() - 0.5) * 10,
        changePercent: quote?.changePercent || (Math.random() - 0.5) * 5,
        
        // Company information (limited for international stocks)
        name: QuoteService.extractCompanyNameFromSymbol(cleanSymbol) || 
              `${cleanSymbol} Company`,
        
        // Market cap from Financial Modeling Prep (rounded for bigint column)
        marketCap: marketCapData?.marketCap ? Math.round(marketCapData.marketCap) : 
                   (isInternational ? null : Math.round(Math.random() * 50000000000 + 5000000000)),
        
        // Volume data (limited for international stocks)
        averageDailyVolume: volumeData?.averageDailyVolume || 
                           (isInternational ? null : Math.floor(Math.random() * 2000000 + 100000)),
        
        // Calculate ADV in dollars (volume × price) - rounded for bigint column
        adv3Month: (volumeData?.averageDailyVolume && quote?.price) ? 
                   Math.round(volumeData.averageDailyVolume * quote.price) : 
                   (isInternational ? null : Math.round((Math.floor(Math.random() * 2000000 + 100000)) * (Math.random() * 100 + 20))),
        
        // Additional metadata
        isInternational: isInternational,
        dataLimitations: isInternational ? {
          marketCap: 'Market cap not available for international stocks',
          volume: volumeData?.limitationNote || 'Volume data may be limited for international stocks',
          fundamentals: 'Limited fundamental data available for international stocks'
        } : null,
        
        // Mock additional data
        volume: quote?.volume || Math.floor(Math.random() * 1000000 + 50000),
        peRatio: isInternational ? null : Math.random() * 30 + 5,
        sector: isInternational ? 'N/A' : 'Technology',
        industry: isInternational ? 'N/A' : 'Software',
        
        // Technical indicators
        rsi: Math.random() * 40 + 30,
        macd: (Math.random() - 0.5) * 2,
        
        // Risk metrics
        beta: Math.random() * 2 + 0.5,
        volatility: Math.random() * 0.3 + 0.1,
        
        // News sentiment (mock for now)
        sentiment: Math.random() > 0.5 ? 'positive' : 'negative',
        sentimentScore: Math.random() * 2 - 1
      };

      console.log(`✅ Successfully fetched data for ${cleanSymbol}${isInternational ? ' (international stock)' : ''}`);
      return stockData;
      
    } catch (error) {
      console.error(`❌ Error fetching data for ${cleanSymbol}:`, error);
      
      // Return fallback data to prevent the app from breaking
      return {
        ticker: ticker,
        originalSymbol: cleanSymbol,
        name: `${cleanSymbol} (Data Error)`,
        price: 0,
        change: 0,
        changePercent: 0,
        marketCap: null,
        averageDailyVolume: null,
        volume: 0,
        isInternational: cleanSymbol.includes('.') || cleanSymbol.includes(' '),
        error: error.message,
        dataError: true
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
        name: capitalizedTickerData.name || stockData.name, // Use form data name if available, fallback to API
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
      console.log(`💾 Sending to Supabase - Ticker ID: ${id}, Updates:`, formattedUpdates);
      await DatabaseService.updateTicker(id, formattedUpdates);
      console.log(`✅ Successfully saved to Supabase for ticker ID: ${id}`);
      
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

  // Refresh earnings dates from TwelveData
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

  // Refresh market cap and average daily volume for all tickers
  const refreshMarketData = async () => {
    if (tickers.length === 0) return { success: 0, errors: {} };

    setIsRefreshingMarketData(true);
    
    try {
      console.log(`🔄 Refreshing market data for ${tickers.length} tickers...`);
      
      let successCount = 0;
      let internationalCount = 0;
      const errors = {};
      const warnings = {};
      
      // Process tickers in batches to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (ticker) => {
          const cleanSymbol = ticker.ticker.replace(' US', '');
          
          try {
            console.log(`🔄 Fetching market data for ${cleanSymbol}...`);
            
            const [marketCapData, volumeData, quoteData] = await Promise.all([
              QuoteService.getCompanyMarketcap(cleanSymbol).catch(error => {
                console.warn(`Could not fetch market cap for ${cleanSymbol}:`, error.message);
                return null;
              }),
              QuoteService.getDailyVolumeData(cleanSymbol).catch(error => {
                console.warn(`Could not fetch volume data for ${cleanSymbol}:`, error.message);
                return null;
              }),
              QuoteService.getQuote(cleanSymbol).catch(error => {
                console.warn(`Could not fetch quote data for ${cleanSymbol}:`, error.message);
                return null;
              })
            ]);
            
            const updates = {};
            
            if (marketCapData?.marketCap) {
              updates.marketCap = Math.round(marketCapData.marketCap); // Round to integer for bigint column
            }
            
            if (volumeData?.averageDailyVolume && quoteData?.price) {
              // Convert share volume to dollar volume - store full dollar amount
              const dollarVolume = volumeData.averageDailyVolume * quoteData.price;
              updates.adv3Month = Math.round(dollarVolume); // Store full dollar amount as integer for bigint column
              console.log(`💰 ADV calculation for ${cleanSymbol}: ${volumeData.averageDailyVolume} shares × $${quoteData.price} = $${dollarVolume.toLocaleString()} (stored as $${updates.adv3Month.toLocaleString()})`);
            }
            
            if (quoteData?.price) {
              updates.currentPrice = quoteData.price;
              updates.lastQuoteUpdate = new Date().toISOString();
              
              // Store quote in state (using original symbol as key)
              const keySymbol = quoteData.originalSymbol || cleanSymbol;
              setQuotes(prev => ({ ...prev, [keySymbol]: quoteData }));
            }
            
            // Update ticker in database if we have updates
            if (Object.keys(updates).length > 0) {
              console.log(`🔄 About to update ticker ${cleanSymbol} (ID: ${ticker.id}) with:`, updates);
              await updateTicker(ticker.id, updates);
              successCount++;
              console.log(`✅ Updated market data for ${cleanSymbol}:`, updates);
            } else {
              console.log(`⚠️ No updates for ${cleanSymbol} - volumeData: ${!!volumeData}, quoteData: ${!!quoteData}`);
            }
            
          } catch (error) {
            console.error(`Error refreshing market data for ${cleanSymbol}:`, error);
            errors[cleanSymbol] = error.message;
          }
        }));
        
        // Small delay between batches to be respectful to the API
        if (i + batchSize < tickers.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`🎉 Market data refresh completed: ${successCount} successful, ${Object.keys(errors).length} errors`);
      return { success: successCount, errors };
      
    } catch (error) {
      console.error('Error refreshing market data:', error);
      throw error;
    } finally {
      setIsRefreshingMarketData(false);
    }
  };

  // Refresh company names function
  const refreshCompanyNames = async () => {
    if (!isAuthenticated || !tickers.length) return;
    
    setIsRefreshingCompanyNames(true);
    console.log('🔄 Starting company names refresh...');
    
    try {
      const batchSize = 3; // Small batch size to be respectful to the API
      let successCount = 0;
      const errors = {};
      
      for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (ticker) => {
          const cleanSymbol = ticker.ticker.replace(' US', '');
          
          try {
            console.log(`🔄 Fetching company overview for ${cleanSymbol}...`);
            
            const companyOverview = await QuoteService.getCompanyOverview(cleanSymbol);
            
            if (companyOverview?.name && companyOverview.name !== ticker.name) {
              const updates = { name: companyOverview.name };
              
              console.log(`🔄 Updating company name for ${cleanSymbol}: "${ticker.name}" → "${companyOverview.name}"`);
              await updateTicker(ticker.id, updates);
              
              // Update local state
              setTickers(prev => prev.map(t => 
                t.id === ticker.id 
                  ? { ...t, name: companyOverview.name }
                  : t
              ));
              
              successCount++;
              console.log(`✅ Updated company name for ${cleanSymbol}`);
            } else {
              console.log(`⚠️ No company name update needed for ${cleanSymbol} - current: "${ticker.name}", fetched: "${companyOverview?.name}"`);
            }
            
          } catch (error) {
            console.error(`Error fetching company name for ${cleanSymbol}:`, error);
            errors[cleanSymbol] = error.message;
          }
        }));
        
        // Small delay between batches to be respectful to the API
        if (i + batchSize < tickers.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      console.log(`🎉 Company names refresh completed: ${successCount} updated, ${Object.keys(errors).length} errors`);
      return { success: successCount, errors };
      
    } catch (error) {
      console.error('Error refreshing company names:', error);
      throw error;
    } finally {
      setIsRefreshingCompanyNames(false);
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

  const refreshTodos = async () => {
    try {
      console.log('🔄 Refreshing todos...');
      const todosData = await DatabaseService.getTodos();
      console.log('✅ Successfully refreshed todos:', todosData);
      setTodos(todosData);
    } catch (error) {
      console.error('❌ Error refreshing todos:', error);
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

  // Refresh database data
  const refreshDatabaseData = async () => {
    if (!isAuthenticated) return;
    
    setIsRefreshingData(true);
    console.log('🔄 Refreshing database data...');
    
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
      console.log('✅ Database data refresh completed successfully');
      
    } catch (error) {
      console.error('❌ Error refreshing database data:', error);
    } finally {
      setIsRefreshingData(false);
    }
  };

  // Refresh analysts data
  const refreshAnalysts = async () => {
    if (!isAuthenticated) return;
    
    console.log('🔄 Refreshing analysts data...');
    
    try {
      const analystsData = await DatabaseService.getAnalysts();
      console.log('✅ Refreshed analysts from Supabase:', analystsData);
      setAnalysts(analystsData);
    } catch (error) {
      console.error('❌ Error refreshing analysts data:', error);
    }
  };

  const handleTabSwitch = async (tab) => {
    setActiveTab(tab);
    setSelectedTodoAnalyst(null);
    
    // Refresh data based on the selected tab
    try {
      switch (tab) {
        case 'database':
          await Promise.all([
            refreshDatabaseData(),
            refreshAnalysts()
          ]);
          break;
        case 'databaseDetailed':
          await Promise.all([
            refreshDatabaseData(),
            refreshAnalysts()
          ]);
          break;
        case 'todoList':
          // Only refresh analysts, let TodoList component handle its own refresh
          await refreshAnalysts();
          break;
        case 'analysts':
          await refreshAnalysts();
          break;
        case 'settings':
          await refreshAnalysts();
          break;
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
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
      <main className={`${activeTab === 'database-detailed' ? 'py-6' : 'max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8'}`}>
        {activeTab === 'input' && (userRole === 'readwrite' || userRole === 'admin') && (
          <InputPage onAddTicker={addTicker} analysts={analysts} currentUser={currentUser} />
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
            onRefreshMarketData={refreshMarketData}
            isRefreshingMarketData={isRefreshingMarketData}
            onRefreshData={refreshData}
            isRefreshingData={isRefreshingData}
            onRefreshCompanyNames={refreshCompanyNames}
            isRefreshingCompanyNames={isRefreshingCompanyNames}
            formatMarketCap={formatMarketCap}
            formatVolumeDollars={formatVolumeDollars}
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
            onRefreshMarketData={refreshMarketData}
            isRefreshingMarketData={isRefreshingMarketData}
            onRefreshData={refreshData}
            isRefreshingData={isRefreshingData}
            formatMarketCap={formatMarketCap}
            formatVolumeDollars={formatVolumeDollars}
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
            onUpdateQuote={updateSingleQuote}
            isLoadingQuotes={isLoadingQuotes}
            quoteErrors={quoteErrors}
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
            onRefreshTodos={refreshTodos}
            currentUser={currentUser}
          />
        )}
      </main>
    </div>
  );
};
  
// Input Page Component
const InputPage = ({ onAddTicker, analysts, currentUser }) => {
  const [formData, setFormData] = useState({
    ticker: '',
    name: '',
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
  const [isLookingUpCompany, setIsLookingUpCompany] = useState(false);
  const [companyLookupMessage, setCompanyLookupMessage] = useState('');

  // Set analyst field based on current user's analyst_code
  useEffect(() => {
    if (currentUser) {
      const analystCode = AuthService.getUserAnalystCode(currentUser);
      if (analystCode && analysts.includes(analystCode)) {
        setFormData(prev => ({
          ...prev,
          analyst: analystCode
        }));
      }
    }
  }, [currentUser, analysts]);

  // Helper function to format price targets to 2 decimal places
  const formatPriceTarget = (value) => {
    if (!value || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(2);
  };

  // Function to look up company name from ticker symbol
  const lookupCompanyName = async (ticker) => {
    if (!ticker || ticker.trim() === '') {
      setFormData(prev => ({ ...prev, name: '' }));
      setCompanyLookupMessage('');
      return;
    }

    const cleanTicker = ticker.trim().toUpperCase();
    setIsLookingUpCompany(true);
    setCompanyLookupMessage('Looking up company name...');

    try {
      const companyOverview = await QuoteService.getCompanyOverview(cleanTicker);
      
      if (companyOverview?.name) {
        setFormData(prev => ({ ...prev, name: companyOverview.name }));
        setCompanyLookupMessage(`Found: ${companyOverview.name}`);
        
        // Clear the message after 3 seconds
        setTimeout(() => {
          setCompanyLookupMessage('');
        }, 3000);
      } else {
        setFormData(prev => ({ ...prev, name: QuoteService.extractCompanyNameFromSymbol(cleanTicker) }));
        setCompanyLookupMessage('Company name not found via API, using ticker symbol');
        
        // Clear the message after 3 seconds
        setTimeout(() => {
          setCompanyLookupMessage('');
        }, 3000);
      }
    } catch (error) {
      console.error('Error looking up company name:', error);
      setFormData(prev => ({ ...prev, name: QuoteService.extractCompanyNameFromSymbol(cleanTicker) }));
      setCompanyLookupMessage('Unable to fetch company name, using ticker symbol');
      
      // Clear the message after 3 seconds
      setTimeout(() => {
        setCompanyLookupMessage('');
      }, 3000);
    } finally {
      setIsLookingUpCompany(false);
    }
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
      
      // Get the current user's analyst code to preserve it after reset
      const currentAnalyst = currentUser ? AuthService.getUserAnalystCode(currentUser) : '';
      const preserveAnalyst = currentAnalyst && analysts.includes(currentAnalyst) ? currentAnalyst : '';
      
      // Reset form but preserve analyst selection
      const resetData = {
        ticker: '',
        name: '',
        lsPosition: 'Long',
        thesis: '',
        priority: 'A',
        status: 'New',
        analyst: preserveAnalyst,
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

    // If ticker field is being changed, trigger company name lookup
    if (field === 'ticker') {
      // Use a debounced approach to avoid too many API calls
      setTimeout(() => {
        lookupCompanyName(value);
      }, 500);
    }
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

          {/* Company Name Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Company Name
              {isLookingUpCompany && <span className="ml-2 text-blue-600 text-xs">🔄 Looking up...</span>}
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Company name will be looked up automatically"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            {companyLookupMessage && (
              <p className="mt-1 text-xs text-blue-600">{companyLookupMessage}</p>
            )}
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
const DatabasePage = ({ tickers, onSort, sortField, sortDirection, onUpdate, analysts, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors, onRefreshMarketData, isRefreshingMarketData, onRefreshData, isRefreshingData, onRefreshCompanyNames, isRefreshingCompanyNames, formatMarketCap, formatVolumeDollars }) => {
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
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Investment Idea Database ({tickers.length} ideas)
          </h3>
          
          <div className="flex space-x-3">
            {onRefreshData && (
              <button
                onClick={onRefreshData}
                disabled={isRefreshingData}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                  isRefreshingData 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'
                }`}
              >
                {isRefreshingData ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Refreshing...
                  </>
                ) : (
                  'Refresh Data'
                )}
              </button>
            )}
            
            {onRefreshMarketData && (
              <button
                onClick={onRefreshMarketData}
                disabled={isRefreshingMarketData}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                  isRefreshingMarketData 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }`}
              >
                {isRefreshingMarketData ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Refreshing...
                  </>
                ) : (
                  'Refresh Market Data'
                )}
              </button>
            )}
            
            {onRefreshCompanyNames && (
              <button
                onClick={onRefreshCompanyNames}
                disabled={isRefreshingCompanyNames}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                  isRefreshingCompanyNames 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500'
                }`}
              >
                {isRefreshingCompanyNames ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Refreshing...
                  </>
                ) : (
                  'Refresh Company Names'
                )}
              </button>
            )}
          </div>
        </div>
        
        <div className="overflow-auto" style={{ height: '70vh', position: 'relative' }}>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-20">
              <tr>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 sticky left-0 bg-gray-50 z-30"
                  onClick={() => onSort('ticker')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Ticker</span>
                    {sortField === 'ticker' && (
                      sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-40"
                  onClick={() => onSort('name')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Name</span>
                    {sortField === 'name' && (
                      sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <SortableHeader field="dateIn">Date In</SortableHeader>
                <SortableHeader field="pokeDate">Poke Date</SortableHeader>
                <SortableHeader field="lsPosition">L/S</SortableHeader>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-12"
                  onClick={() => onSort('priority')}
                >
                  <div className="flex items-center space-x-1">
                    <span>PRI</span>
                    {sortField === 'priority' && (
                      sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <SortableHeader field="status">Status</SortableHeader>
                <SortableHeader field="analyst">Analyst</SortableHeader>
                <SortableHeader field="inputPrice">Input Price</SortableHeader>
                <SortableHeader field="currentPrice">Current Price</SortableHeader>
                <th
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => onSort('marketCap')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Market Cap (M)</span>
                    {sortField === 'marketCap' && (
                      sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => onSort('adv3Month')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>ADV 3M ($M)</span>
                    {sortField === 'adv3Month' && (
                      sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
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
                  formatMarketCap={formatMarketCap}
                  formatVolumeDollars={formatVolumeDollars}
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
const EnhancedTickerRow = ({ ticker, onUpdate, analysts, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors, formatMarketCap, formatVolumeDollars }) => {
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
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-blue-50 z-10">
          {ticker.ticker}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {ticker.name}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {ticker.dateIn}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {ticker.pokeDate}
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
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
          {ticker.inputPrice ? `$${parseFloat(ticker.inputPrice).toFixed(2)}` : '-'}
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
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
          {formatMarketCap ? formatMarketCap(ticker.marketCap) : '-'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
          {formatVolumeDollars ? formatVolumeDollars(ticker.adv3Month) : '-'}
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
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10">
        {ticker.ticker}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 w-40" title={ticker.name}>
        {ticker.name && ticker.name.length > 20 ? ticker.name.substring(0, 20) + '...' : ticker.name}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.dateIn}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.pokeDate}
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
      <td className="px-6 py-4 whitespace-nowrap w-12">
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
          ticker.status === 'Portfolio' ? 'bg-green-100 text-green-800' :
          ticker.status === 'Current' ? 'bg-blue-100 text-blue-800' :
          ticker.status === 'New' ? 'bg-purple-100 text-purple-800' :
          ticker.status === 'On-Deck' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {ticker.status}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.analyst}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
        {ticker.inputPrice ? `$${parseFloat(ticker.inputPrice).toFixed(2)}` : '-'}
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
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
        {ticker.marketCap ? (
          formatMarketCap(ticker.marketCap)
        ) : (
          <span className="flex items-center justify-end">
            <span className="text-gray-400">-</span>
            {(ticker.ticker.includes('.') || ticker.ticker.includes(' ')) && (
              <span 
                className="ml-1 text-xs text-yellow-600 cursor-help" 
                title="Market cap data not available for international stocks via TwelveData"
              >
                ⓘ
              </span>
            )}
          </span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
        {ticker.adv3Month ? (
          formatVolumeDollars(ticker.adv3Month)
        ) : (
          <span className="flex items-center justify-end">
            <span className="text-gray-400">-</span>
            {(ticker.ticker.includes('.') || ticker.ticker.includes(' ')) && (
              <span 
                className="ml-1 text-xs text-yellow-600 cursor-help" 
                title="3-month average daily volume data not available for international stocks via TwelveData"
              >
                ⓘ
              </span>
            )}
          </span>
        )}
      </td>
      {onUpdate && (
        <td className="px-6 py-4 whitespace-nowrap text-sm">
          <button
            onClick={() => setIsEditing(true)}
            className="text-indigo-600 hover:text-indigo-900"
          >
            Edit
          </button>
        </td>
      )}
    </tr>
  );
};

// Database Detailed Page Component - Shows all fields with quotes integration
const DatabaseDetailedPage = ({ tickers, onSort, sortField, sortDirection, onUpdate, analysts, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors, onRefreshMarketData, isRefreshingMarketData, onRefreshData, isRefreshingData, formatMarketCap, formatVolumeDollars }) => {
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
    <div className="bg-white shadow rounded-lg" style={{ width: '98vw', maxWidth: '98vw', marginLeft: '10px' }}>
      <div className="pl-2 pr-2 py-5 sm:pl-2 sm:pr-2 sm:py-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Investment Idea Database - Detailed View ({tickers.length} ideas)
          </h3>
          
          <div className="flex space-x-3">
            {onRefreshData && (
              <button
                onClick={onRefreshData}
                disabled={isRefreshingData}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                  isRefreshingData 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'
                }`}
              >
                {isRefreshingData ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Refreshing...
                  </>
                ) : (
                  'Refresh Data'
                )}
              </button>
            )}
            
            {onRefreshMarketData && (
              <button
                onClick={onRefreshMarketData}
                disabled={isRefreshingMarketData}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                  isRefreshingMarketData 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }`}
              >
                {isRefreshingMarketData ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Refreshing...
                  </>
                ) : (
                  'Refresh Market Data'
                )}
              </button>
            )}
          </div>
        </div>
        
        <div className="overflow-auto" style={{ height: '75vh', position: 'relative' }}>
          <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
            <thead className="bg-gray-50 sticky top-0 z-20">
              <tr>
                <th
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 sticky left-0 bg-gray-50 z-30"
                  onClick={() => onSort('ticker')}
                  style={{ width: '80px', minWidth: '80px' }}
                >
                  <div className="flex items-center space-x-1">
                    <span>Ticker</span>
                    {sortField === 'ticker' && (
                      sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-32"
                  onClick={() => onSort('name')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Name</span>
                    {sortField === 'name' && (
                      sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <SortableHeader field="dateIn">Date In</SortableHeader>
                <SortableHeader field="pokeDate">Poke Date</SortableHeader>
                <SortableHeader field="lsPosition">L/S</SortableHeader>
                <th
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-12"
                  onClick={() => onSort('priority')}
                >
                  <div className="flex items-center space-x-1">
                    <span>PRI</span>
                    {sortField === 'priority' && (
                      sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <SortableHeader field="status">Status</SortableHeader>
                <SortableHeader field="analyst">Analyst</SortableHeader>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                
                {/* Financial Data */}
                <th
                  className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => onSort('inputPrice')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Input Price</span>
                    {sortField === 'inputPrice' && (
                      sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <SortableHeader field="currentPrice">Current Price</SortableHeader>
                <th
                  className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => onSort('marketCap')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Market Cap (M)</span>
                    {sortField === 'marketCap' && (
                      sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th
                  className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => onSort('adv3Month')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>ADV 3M ($M)</span>
                    {sortField === 'adv3Month' && (
                      sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                
                {/* Price Targets */}
                <SortableHeader field="ptBear">PT Bear</SortableHeader>
                <SortableHeader field="ptBase">PT Base</SortableHeader>
                <SortableHeader field="ptBull">PT Bull</SortableHeader>
                
                {/* Additional Info */}
                <SortableHeader field="catalystDate">Catalyst Date</SortableHeader>
                <SortableHeader field="valueOrGrowth">Value/Growth</SortableHeader>
                
                {/* M&A Characteristics */}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">M&A Target Buyer</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">M&A Target Val</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">M&A Target Seller</th>
                
                {/* Other Investment Characteristics */}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Big Move Revert</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activist</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activist Potential</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Insider Trade</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">New Mgmt</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Spin</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Big Acq</th>
                
                {/* Risk Factors */}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fraud Risk</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Regulatory Risk</th>
                
                {/* Market Characteristics */}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cyclical</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Non-Cyclical</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">High Beta</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Momentum</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Self Help</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate Exposure</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Strong Dollar</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Extreme Val</th>
                
                {/* Thesis */}
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
                  formatMarketCap={formatMarketCap}
                  formatVolumeDollars={formatVolumeDollars}
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

// Detailed Ticker Row Component for Database Detailed Page
const DetailedTickerRow = ({ ticker, onUpdate, analysts, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors, formatMarketCap, formatVolumeDollars }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(ticker);

  // Helper function to format price targets to 2 decimal places
  const formatPriceTarget = (value) => {
    if (!value || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(2);
  };

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

  const cleanSymbol = ticker.ticker.replace(' US', '');
  const quote = quotes ? quotes[cleanSymbol] : null;
  const hasQuoteError = quoteErrors ? quoteErrors[cleanSymbol] : false;

  if (isEditing && onUpdate) {
    return (
      <tr className="bg-blue-50">
        <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-blue-50 z-10" style={{ width: '80px', minWidth: '80px' }}>
          {ticker.ticker}
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 w-32" title={ticker.name}>
          {ticker.name && ticker.name.length > 20 ? ticker.name.substring(0, 20) + '...' : ticker.name}
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
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          >
            <option value="Long">Long</option>
            <option value="Short">Short</option>
          </select>
        </td>
        <td className="px-3 py-4 whitespace-nowrap w-12">
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
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
          {ticker.inputPrice ? `$${parseFloat(ticker.inputPrice).toFixed(2)}` : '-'}
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
          <QuoteDisplay 
            ticker={ticker.ticker}
            quote={quote}
            onUpdateQuote={onUpdateQuote}
            isLoading={isLoadingQuotes}
            hasError={hasQuoteError}
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
          {formatMarketCap ? formatMarketCap(ticker.marketCap) : '-'}
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
          {formatVolumeDollars ? formatVolumeDollars(ticker.adv3Month) : '-'}
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <input
            type="number"
            step="0.01"
            value={editData.ptBear || ''}
            onChange={(e) => setEditData({...editData, ptBear: e.target.value})}
            onBlur={(e) => setEditData({...editData, ptBear: formatPriceTarget(e.target.value)})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <input
            type="number"
            step="0.01"
            value={editData.ptBase || ''}
            onChange={(e) => setEditData({...editData, ptBase: e.target.value})}
            onBlur={(e) => setEditData({...editData, ptBase: formatPriceTarget(e.target.value)})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <input
            type="number"
            step="0.01"
            value={editData.ptBull || ''}
            onChange={(e) => setEditData({...editData, ptBull: e.target.value})}
            onBlur={(e) => setEditData({...editData, ptBull: formatPriceTarget(e.target.value)})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          />
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
          <input
            type="text"
            value={editData.valueOrGrowth || ''}
            onChange={(e) => setEditData({...editData, valueOrGrowth: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-20"
          />
        </td>
        {/* M&A Characteristics */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.maTargetBuyer || false}
            onChange={(e) => setEditData({...editData, maTargetBuyer: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.maTargetValuation || false}
            onChange={(e) => setEditData({...editData, maTargetValuation: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.maTargetSeller || false}
            onChange={(e) => setEditData({...editData, maTargetSeller: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Other checkboxes for all boolean fields */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.bigMoveRevert || false}
            onChange={(e) => setEditData({...editData, bigMoveRevert: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.activist || false}
            onChange={(e) => setEditData({...editData, activist: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.activistPotential || false}
            onChange={(e) => setEditData({...editData, activistPotential: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.insiderTradeSignal || false}
            onChange={(e) => setEditData({...editData, insiderTradeSignal: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.newMgmt || false}
            onChange={(e) => setEditData({...editData, newMgmt: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.spin || false}
            onChange={(e) => setEditData({...editData, spin: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.bigAcq || false}
            onChange={(e) => setEditData({...editData, bigAcq: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.fraudRisk || false}
            onChange={(e) => setEditData({...editData, fraudRisk: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.regulatoryRisk || false}
            onChange={(e) => setEditData({...editData, regulatoryRisk: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.cyclical || false}
            onChange={(e) => setEditData({...editData, cyclical: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.nonCyclical || false}
            onChange={(e) => setEditData({...editData, nonCyclical: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.highBeta || false}
            onChange={(e) => setEditData({...editData, highBeta: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.momo || false}
            onChange={(e) => setEditData({...editData, momo: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.selfHelp || false}
            onChange={(e) => setEditData({...editData, selfHelp: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.rateExposure || false}
            onChange={(e) => setEditData({...editData, rateExposure: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.strongDollar || false}
            onChange={(e) => setEditData({...editData, strongDollar: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.extremeValuation || false}
            onChange={(e) => setEditData({...editData, extremeValuation: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <textarea
            value={editData.thesis || ''}
            onChange={(e) => setEditData({...editData, thesis: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-40 h-20"
          />
        </td>
        {onUpdate && (
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
        )}
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white hover:bg-gray-50 z-10" style={{ width: '80px', minWidth: '80px' }}>
        {ticker.ticker}
        {/* Add international stock indicator */}
        {(ticker.ticker.includes('.') || ticker.ticker.includes(' ')) && (
          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800" title="International stock - limited data availability">
            🌍
          </span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 w-40" title={ticker.name}>
        {ticker.name && ticker.name.length > 20 ? ticker.name.substring(0, 20) + '...' : ticker.name}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.dateIn}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {formatDate(ticker.pokeDate)}
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
      <td className="px-6 py-4 whitespace-nowrap w-12">
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
          ticker.status === 'Portfolio' ? 'bg-green-100 text-green-800' :
          ticker.status === 'Current' ? 'bg-blue-100 text-blue-800' :
          ticker.status === 'New' ? 'bg-purple-100 text-purple-800' :
          ticker.status === 'On-Deck' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {ticker.status}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.analyst}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.source || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
        {ticker.inputPrice ? `$${parseFloat(ticker.inputPrice).toFixed(2)}` : '-'}
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
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
        {ticker.marketCap ? (
          formatMarketCap(ticker.marketCap)
        ) : (
          <span className="flex items-center justify-end">
            <span className="text-gray-400">-</span>
            {(ticker.ticker.includes('.') || ticker.ticker.includes(' ')) && (
              <span 
                className="ml-1 text-xs text-yellow-600 cursor-help" 
                title="Market cap data not available for international stocks via TwelveData"
              >
                ⓘ
              </span>
            )}
          </span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
        {ticker.adv3Month ? (
          formatVolumeDollars(ticker.adv3Month)
        ) : (
          <span className="flex items-center justify-end">
            <span className="text-gray-400">-</span>
            {(ticker.ticker.includes('.') || ticker.ticker.includes(' ')) && (
              <span 
                className="ml-1 text-xs text-yellow-600 cursor-help" 
                title="3-month average daily volume data not available for international stocks via TwelveData"
              >
                ⓘ
              </span>
            )}
          </span>
        )}
      </td>
      {/* Price Targets */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {ticker.ptBear ? formatPriceTarget(ticker.ptBear) : '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {ticker.ptBase ? formatPriceTarget(ticker.ptBase) : '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {ticker.ptBull ? formatPriceTarget(ticker.ptBull) : '-'}
      </td>
      {/* Additional Info */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {formatDate(ticker.catalystDate)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.valueOrGrowth || '-'}
      </td>
      {/* M&A Characteristics */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.maTargetBuyer)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.maTargetValuation)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.maTargetSeller)}
      </td>
      {/* Other Investment Characteristics */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.bigMoveRevert)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.activist)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.activistPotential)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.insiderTradeSignal)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.newMgmt)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.spin)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.bigAcq)}
      </td>
      {/* Risk Factors */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.fraudRisk)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.regulatoryRisk)}
      </td>
      {/* Market Characteristics */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.cyclical)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.nonCyclical)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.highBeta)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.momo)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.selfHelp)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.rateExposure)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.strongDollar)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        {formatBoolean(ticker.extremeValuation)}
      </td>
      {/* Thesis */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" title={ticker.thesis}>
        {ticker.thesis && ticker.thesis.length > 50 ? ticker.thesis.substring(0, 50) + '...' : ticker.thesis || '-'}
      </td>
      {onUpdate && (
        <td className="px-6 py-4 whitespace-nowrap text-sm">
          <button
            onClick={() => setIsEditing(true)}
            className="text-blue-600 hover:text-blue-900 text-xs"
          >
            Edit
          </button>
        </td>
      )}
    </tr>
  );
};

// Analyst Detail Page Component with quotes integration
const AnalystDetailPage = ({ tickers, analysts, selectedAnalyst, onSelectAnalyst, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors }) => {
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
      
      // Handle percentage fields by calculating them
      if (field === 'bearPercent' || field === 'basePercent' || field === 'bullPercent') {
        const cleanSymbolA = a.ticker.replace(' US', '');
        const cleanSymbolB = b.ticker.replace(' US', '');
        const quoteA = quotes[cleanSymbolA];
        const quoteB = quotes[cleanSymbolB];
        const currentPriceA = quoteA ? quoteA.price : a.currentPrice;
        const currentPriceB = quoteB ? quoteB.price : b.currentPrice;
        
        if (field === 'bearPercent') {
          aVal = calculatePercentChange(a.ptBear, currentPriceA);
          bVal = calculatePercentChange(b.ptBear, currentPriceB);
        } else if (field === 'basePercent') {
          aVal = calculatePercentChange(a.ptBase, currentPriceA);
          bVal = calculatePercentChange(b.ptBase, currentPriceB);
        } else if (field === 'bullPercent') {
          aVal = calculatePercentChange(a.ptBull, currentPriceA);
          bVal = calculatePercentChange(b.ptBull, currentPriceB);
        }
        
        // Convert percentage strings to numbers for sorting
        const aNum = aVal ? parseFloat(aVal.replace(/[+%]/g, '')) : -999;
        const bNum = bVal ? parseFloat(bVal.replace(/[+%]/g, '')) : -999;
        aVal = aNum;
        bVal = bNum;
      } else if (field === 'currentPrice' || field === 'ptBear' || field === 'ptBase' || field === 'ptBull') {
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
        width: field === 'ticker' ? '85px' : 
               field === 'lsPosition' ? '40px' :
               field === 'priority' ? '35px' :
               field === 'currentPrice' ? '75px' :
               field === 'ptBear' || field === 'ptBase' || field === 'ptBull' ? '60px' :
               field === 'thesis' ? 'auto' : '45px' 
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

  const analystTickers = tickers.filter(ticker => ticker.analyst === selectedAnalyst);
  
  // Group tickers by status and create a flat array with status headers
  const groupedData = [];
  statusOrder.forEach(status => {
    const statusTickers = analystTickers.filter(ticker => ticker.status === status);
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
        const statusTickers = analystTickers.filter(ticker => ticker.status === status);
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
      
      // Create the PDF table
      autoTable(doc, {
        head: [['Ticker', 'L/S', 'Pri', 'Price', 'Bear', 'Bear %', 'Base', 'Base %', 'Bull', 'Bull %', 'Thesis']],
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
          3: { cellWidth: 18 }, // Price
          4: { cellWidth: 18 }, // PT Bear
          5: { cellWidth: 15 }, // Bear %
          6: { cellWidth: 18 }, // PT Base
          7: { cellWidth: 15 }, // Base %
          8: { cellWidth: 18 }, // PT Bull
          9: { cellWidth: 15 }, // Bull %
          10: { cellWidth: 85 }  // Thesis (wider since no analyst column)
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
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Analyst Detail Output - {selectedAnalyst}
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
        
        <div className="mb-4 bg-gray-100 px-4 py-2 rounded">
          <p className="text-sm text-gray-600">
            Showing {analystTickers.length} ideas for analyst {selectedAnalyst}
          </p>
        </div>
        
        <div className="overflow-auto" style={{ height: '70vh', position: 'relative' }}>
          <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed', width: '100%' }}>
            <thead className="bg-gray-50 sticky top-0 z-20">
              <tr>
                <SortableHeader field="ticker" style={{ width: '85px' }}>Ticker</SortableHeader>
                <SortableHeader field="lsPosition" style={{ width: '40px' }}>L/S</SortableHeader>
                <SortableHeader field="priority" style={{ width: '35px' }}>Pri</SortableHeader>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '75px' }}>Price</th>
                <SortableHeader field="ptBear" style={{ width: '60px' }}>Bear</SortableHeader>
                <SortableHeader field="bearPercent" style={{ width: '45px' }}>%</SortableHeader>
                <SortableHeader field="ptBase" style={{ width: '60px' }}>Base</SortableHeader>
                <SortableHeader field="basePercent" style={{ width: '45px' }}>%</SortableHeader>
                <SortableHeader field="ptBull" style={{ width: '60px' }}>Bull</SortableHeader>
                <SortableHeader field="bullPercent" style={{ width: '45px' }}>%</SortableHeader>
                <SortableHeader field="thesis">Thesis</SortableHeader>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {groupedData.map((item, index) => {
                if (item.type === 'header') {
                  return (
                    <tr key={`header-${item.status}`} className="bg-gray-100">
                      <td colSpan="11" className="px-6 py-3 text-sm font-medium text-gray-900">
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
                  
                  // Check if row should be highlighted (Long position with negative base % or Short position with positive base %)
                  
                  return (
                    <tr key={ticker.id} className={((ticker.lsPosition === 'Long' && basePercent && basePercent.startsWith('-')) || (ticker.lsPosition === 'Short' && basePercent && basePercent.startsWith('+'))) ? 'bg-red-50' : ''}>
                      <td className="px-2 py-2 whitespace-nowrap text-sm font-medium text-gray-900" style={{ width: '85px' }}>
                        <div className="truncate" title={ticker.ticker}>
                          {ticker.ticker}
                        </div>
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-center" style={{ width: '40px' }}>
                        <span className={`inline-flex px-1 py-0.5 text-xs font-semibold rounded ${
                          ticker.lsPosition === 'Long' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {ticker.lsPosition === 'Long' ? 'L' : 'S'}
                        </span>
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-center" style={{ width: '35px' }}>
                        <span className={`inline-flex w-6 h-6 items-center justify-center text-xs font-bold rounded-full ${
                          ticker.priority === 'A' ? 'bg-red-100 text-red-800' :
                          ticker.priority === 'B' ? 'bg-yellow-100 text-yellow-800' :
                          ticker.priority === 'C' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {ticker.priority}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm" style={{ width: '75px' }}>
                        <QuoteDisplay 
                          ticker={ticker.ticker}
                          quote={quote}
                          onUpdateQuote={onUpdateQuote}
                          isLoading={isLoadingQuotes}
                          hasError={quoteErrors[cleanSymbol]}
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '60px' }}>
                        {ticker.ptBear ? `$${parseFloat(ticker.ptBear).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '45px' }}>
                        <span className={getPercentColor(bearPercent)}>
                          {bearPercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '60px' }}>
                        {ticker.ptBase ? `$${parseFloat(ticker.ptBase).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '45px' }}>
                        <span className={getPercentColor(basePercent)}>
                          {basePercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '60px' }}>
                        {ticker.ptBull ? `$${parseFloat(ticker.ptBull).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '45px' }}>
                        <span className={getPercentColor(bullPercent)}>
                          {bullPercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-sm text-gray-900">
                        <div className="break-words whitespace-normal" title={ticker.thesis}>
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
            <p className="text-gray-500">No ideas assigned to analyst {selectedAnalyst}</p>
          </div>
        )}
      </div>
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
  
  // Apply analyst filter if selected and not "All Analysts"
  if (selectedEarningsAnalyst && selectedEarningsAnalyst !== 'All Analysts') {
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
    setRefreshMessage('Fetching earnings dates from TwelveData...');

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
const TodoListPage = ({ todos, selectedTodoAnalyst, onSelectTodoAnalyst, onAddTodo, onUpdateTodo, onDeleteTodo, analysts, userRole, onRefreshTodos, currentUser }) => {
  const [sortField, setSortField] = useState('dateEntered');
  const [sortDirection, setSortDirection] = useState('desc');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [newTodo, setNewTodo] = useState({
    ticker: '',
    analyst: '',
    priority: 'medium',
    item: ''
  });
  const isFirstMount = useRef(true);

  // Initial refresh when component is mounted - only run once
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      const initialRefresh = async () => {
        try {
          await onRefreshTodos();
        } catch (error) {
          console.error('Error in initial refresh:', error);
        }
      };
      initialRefresh();
    }
  }, [onRefreshTodos]);

  // Auto-refresh todos every 5 minutes when component is mounted
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await onRefreshTodos();
      } catch (error) {
        console.error('Error in auto-refresh:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [onRefreshTodos]);

  // Handle manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshTodos();
    } catch (error) {
      console.error('Error refreshing todos:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

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
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
              isRefreshing 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
            }`}
          >
            {isRefreshing ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh List
              </>
            )}
          </button>
          <button
            onClick={async () => {
              if (isEmailSending) return;
              
              setIsEmailSending(true);
              
              try {
                // Generate HTML email content
                const filterText = selectedTodoAnalyst ? `Analyst: ${selectedTodoAnalyst}` : 'All Analysts';
                const emailDate = new Date().toLocaleDateString();
                
                // Helper function to get priority color and styling for mobile
                const getPriorityBadge = (priority) => {
                  const colors = {
                    'high': { bg: '#fee2e2', text: '#dc2626' },
                    'medium': { bg: '#fef3c7', text: '#d97706' },
                    'low': { bg: '#dcfce7', text: '#16a34a' }
                  };
                  const color = colors[priority] || colors['medium'];
                  return `<span style="background-color: ${color.bg}; color: ${color.text}; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; display: inline-block;">${priority}</span>`;
                };
                
                // Start building mobile-friendly HTML email
                let emailBody = `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Todo List Report</title>
                </head>
                <body style="font-family: Arial, sans-serif; margin: 0; padding: 10px; background-color: #f5f5f5;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: white;">
                    
                    <!-- Header -->
                    <tr>
                      <td style="background-color: #0066cc; color: white; padding: 15px; text-align: center;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: bold;">📋 Todo List Report</h1>
                        <p style="margin: 5px 0 0 0; font-size: 14px;">${filterText}</p>
                        <p style="margin: 5px 0 0 0; font-size: 12px;">Generated: ${emailDate}</p>
                      </td>
                    </tr>`;
                
                // Custom sort for email: Priority (high>medium>low), then Days Since (lowest first)
                const sortTodosForEmail = (todos) => {
                  return [...todos].sort((a, b) => {
                    // Priority order: high=3, medium=2, low=1
                    const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
                    const aPriority = priorityOrder[a.priority] || 0;
                    const bPriority = priorityOrder[b.priority] || 0;
                    
                    // First sort by priority (high to low)
                    if (aPriority !== bPriority) {
                      return bPriority - aPriority;
                    }
                    
                    // Then sort by days since entered (lowest first)
                    const aDays = calculateDaysSinceEntered(a.dateEntered);
                    const bDays = calculateDaysSinceEntered(b.dateEntered);
                    return aDays - bDays;
                  });
                };
                
                // Open todos section - Mobile-friendly card layout
                if (openTodos.length > 0) {
                  emailBody += `
                    <!-- Open Todos Section -->
                    <tr>
                      <td style="padding: 15px;">
                        <h2 style="margin: 0 0 10px 0; color: #333; font-size: 18px; font-weight: bold;">🔥 Open Todos (${openTodos.length})</h2>
                      </td>
                    </tr>`;
                  
                  sortTodosForEmail(openTodos).forEach((todo, index) => {
                    const daysSince = calculateDaysSinceEntered(todo.dateEntered);
                    const bgColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
                    
                    emailBody += `
                    <tr>
                      <td style="padding: 0 15px;">
                        <table width="100%" cellpadding="8" cellspacing="0" style="background-color: ${bgColor}; border: 1px solid #e0e0e0; margin-bottom: 8px;">
                          <tr>
                            <td style="font-weight: bold; font-size: 16px; color: #0066cc;">${todo.ticker}</td>
                            <td style="text-align: right; font-size: 12px; color: #666;">
                              ${getPriorityBadge(todo.priority)}
                            </td>
                          </tr>
                          <tr>
                            <td colspan="2" style="font-size: 14px; color: #333; padding-top: 5px;">
                              <strong>Analyst:</strong> ${todo.analyst}
                            </td>
                          </tr>
                          <tr>
                            <td style="font-size: 12px; color: #666;">
                              <strong>Entered:</strong> ${formatDate(todo.dateEntered)}
                            </td>
                            <td style="text-align: right; font-size: 12px; color: #666;">
                              <strong>${daysSince} days ago</strong>
                            </td>
                          </tr>
                          <tr>
                            <td colspan="2" style="font-size: 13px; color: #333; padding-top: 5px; line-height: 1.4;">
                              <strong>Task:</strong> ${todo.item}
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>`;
                  });
                }
                
                // Recently closed todos section - Mobile-friendly card layout
                if (recentlyClosedTodos.length > 0) {
                  emailBody += `
                    <!-- Recently Closed Todos Section -->
                    <tr>
                      <td style="padding: 15px; border-top: 2px solid #e0e0e0;">
                        <h2 style="margin: 0 0 10px 0; color: #333; font-size: 18px; font-weight: bold;">✅ Recently Closed - Last 7 Days (${recentlyClosedTodos.length})</h2>
                      </td>
                    </tr>`;
                  
                  sortTodosForEmail(recentlyClosedTodos).forEach((todo, index) => {
                    const bgColor = index % 2 === 0 ? '#f0fff4' : '#f8fff8';
                    
                    emailBody += `
                    <tr>
                      <td style="padding: 0 15px;">
                        <table width="100%" cellpadding="8" cellspacing="0" style="background-color: ${bgColor}; border: 1px solid #d4e6d4; margin-bottom: 8px;">
                          <tr>
                            <td style="font-weight: bold; font-size: 16px; color: #0066cc;">${todo.ticker}</td>
                            <td style="text-align: right; font-size: 12px; color: #666;">
                              ${getPriorityBadge(todo.priority)}
                            </td>
                          </tr>
                          <tr>
                            <td colspan="2" style="font-size: 14px; color: #333; padding-top: 5px;">
                              <strong>Analyst:</strong> ${todo.analyst}
                            </td>
                          </tr>
                          <tr>
                            <td style="font-size: 12px; color: #666;">
                              <strong>Entered:</strong> ${formatDate(todo.dateEntered)}
                            </td>
                            <td style="text-align: right; font-size: 12px; color: #666;">
                              <strong>Closed:</strong> ${formatDate(todo.dateClosed)}
                            </td>
                          </tr>
                          <tr>
                            <td colspan="2" style="font-size: 13px; color: #333; padding-top: 5px; line-height: 1.4;">
                              <strong>Task:</strong> ${todo.item}
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>`;
                  });
                }
                
                // Footer
                emailBody += `
                    <!-- Footer -->
                    <tr>
                      <td style="padding: 15px; background-color: #f5f5f5; border-top: 1px solid #e0e0e0; text-align: center;">
                        <p style="margin: 0; color: #666; font-size: 12px;">
                          Generated by <strong>Clearline Flow</strong><br>
                          ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
                        </p>
                      </td>
                    </tr>
                    
                  </table>
                </body>
                </html>`;
                
                // Send email via API
                const subject = `Todo List Report - ${filterText} - ${emailDate}`;
                const fromName = currentUser ? AuthService.getUserFullName(currentUser) : 'Clearline Flow App';
                const fromEmail = currentUser?.email || null;
                
                // Create recipients array with both mmajzner@clearlinecap.com and current user's email
                const recipients = ['mmajzner@clearlinecap.com'];
                if (currentUser?.email && currentUser.email !== 'mmajzner@clearlinecap.com') {
                  recipients.push(currentUser.email);
                }
                
                const response = await fetch('/api/send-email', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    to: recipients,
                    subject: subject,
                    content: emailBody,
                    fromName: fromName,
                    fromEmail: fromEmail
                  }),
                });
                
                const result = await response.json();
                
                if (result.success) {
                  alert('✅ Email sent successfully!');
                } else {
                  console.error('Email send failed:', result);
                  alert('❌ Failed to send email: ' + (result.error || 'Unknown error'));
                }
                
              } catch (error) {
                console.error('Error sending email:', error);
                alert('❌ Failed to send email. Please check console for details.');
              } finally {
                setIsEmailSending(false);
              }
            }}
            disabled={isEmailSending}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center ${
              isEmailSending 
                ? 'bg-gray-400 cursor-not-allowed text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isEmailSending ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending Email...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Email Todo List
              </>
            )}
          </button>
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

// PM Detail Page Component - Shows status-grouped view with price target analysis
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
      
      // Handle percentage fields by calculating them
      if (field === 'bearPercent' || field === 'basePercent' || field === 'bullPercent') {
        const cleanSymbolA = a.ticker.replace(' US', '');
        const cleanSymbolB = b.ticker.replace(' US', '');
        const quoteA = quotes ? quotes[cleanSymbolA] : null;
        const quoteB = quotes ? quotes[cleanSymbolB] : null;
        const currentPriceA = quoteA ? quoteA.price : a.currentPrice;
        const currentPriceB = quoteB ? quoteB.price : b.currentPrice;
        
        if (field === 'bearPercent') {
          aVal = calculatePercentChange(a.ptBear, currentPriceA);
          bVal = calculatePercentChange(b.ptBear, currentPriceB);
        } else if (field === 'basePercent') {
          aVal = calculatePercentChange(a.ptBase, currentPriceA);
          bVal = calculatePercentChange(b.ptBase, currentPriceB);
        } else if (field === 'bullPercent') {
          aVal = calculatePercentChange(a.ptBull, currentPriceA);
          bVal = calculatePercentChange(b.ptBull, currentPriceB);
        }
        
        // Convert percentage strings to numbers for sorting
        const aNum = aVal ? parseFloat(aVal.replace(/[+%]/g, '')) : -999;
        const bNum = bVal ? parseFloat(bVal.replace(/[+%]/g, '')) : -999;
        aVal = aNum;
        bVal = bNum;
      } else if (field === 'currentPrice' || field === 'ptBear' || field === 'ptBase' || field === 'ptBull') {
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
        width: field === 'ticker' ? '85px' : 
               field === 'lsPosition' ? '40px' :
               field === 'priority' ? '35px' :
               field === 'analyst' ? '60px' :
               field === 'currentPrice' ? '75px' :
               field === 'ptBear' || field === 'ptBase' || field === 'ptBull' ? '60px' :
               field === 'thesis' ? 'auto' : '45px' 
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

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          PM Detail Output
        </h3>
        
        <div className="mb-4 bg-gray-100 px-4 py-2 rounded">
          <p className="text-sm text-gray-600">
            Showing {tickers.length} total ideas across all analysts
          </p>
        </div>
        
        <div className="overflow-auto" style={{ height: '70vh', position: 'relative' }}>
          <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed', width: '100%' }}>
            <thead className="bg-gray-50 sticky top-0 z-20">
              <tr>
                <SortableHeader field="ticker" style={{ width: '85px' }}>Ticker</SortableHeader>
                <SortableHeader field="lsPosition" style={{ width: '40px' }}>L/S</SortableHeader>
                <SortableHeader field="priority" style={{ width: '35px' }}>Pri</SortableHeader>
                <SortableHeader field="analyst" style={{ width: '60px' }}>Analyst</SortableHeader>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '75px' }}>Price</th>
                <SortableHeader field="ptBear" style={{ width: '60px' }}>Bear</SortableHeader>
                <SortableHeader field="bearPercent" style={{ width: '45px' }}>%</SortableHeader>
                <SortableHeader field="ptBase" style={{ width: '60px' }}>Base</SortableHeader>
                <SortableHeader field="basePercent" style={{ width: '45px' }}>%</SortableHeader>
                <SortableHeader field="ptBull" style={{ width: '60px' }}>Bull</SortableHeader>
                <SortableHeader field="bullPercent" style={{ width: '45px' }}>%</SortableHeader>
                <SortableHeader field="thesis">Thesis</SortableHeader>
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
                  const quote = quotes ? quotes[cleanSymbol] : null;
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
                  
                  // Check if row should be highlighted (Long position with negative base % or Short position with positive base %)
                  
                  return (
                    <tr key={ticker.id} className={((ticker.lsPosition === 'Long' && basePercent && basePercent.startsWith('-')) || (ticker.lsPosition === 'Short' && basePercent && basePercent.startsWith('+'))) ? 'bg-red-50' : ''}>
                      <td className="px-2 py-2 whitespace-nowrap text-sm font-medium text-gray-900" style={{ width: '85px' }}>
                        <div className="truncate" title={ticker.ticker}>
                          {ticker.ticker}
                        </div>
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-center" style={{ width: '40px' }}>
                        <span className={`inline-flex px-1 py-0.5 text-xs font-semibold rounded ${
                          ticker.lsPosition === 'Long' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {ticker.lsPosition === 'Long' ? 'L' : 'S'}
                        </span>
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-center" style={{ width: '35px' }}>
                        <span className={`inline-flex w-6 h-6 items-center justify-center text-xs font-bold rounded-full ${
                          ticker.priority === 'A' ? 'bg-red-100 text-red-800' :
                          ticker.priority === 'B' ? 'bg-yellow-100 text-yellow-800' :
                          ticker.priority === 'C' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {ticker.priority}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '60px' }}>
                        <div className="truncate" title={ticker.analyst}>
                          {ticker.analyst || '-'}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm" style={{ width: '75px' }}>
                        <QuoteDisplay 
                          ticker={ticker.ticker}
                          quote={quote}
                          onUpdateQuote={onUpdateQuote}
                          isLoading={isLoadingQuotes}
                          hasError={quoteErrors[cleanSymbol]}
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '60px' }}>
                        {ticker.ptBear ? `$${parseFloat(ticker.ptBear).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '45px' }}>
                        <span className={getPercentColor(bearPercent)}>
                          {bearPercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '60px' }}>
                        {ticker.ptBase ? `$${parseFloat(ticker.ptBase).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '45px' }}>
                        <span className={getPercentColor(basePercent)}>
                          {basePercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '60px' }}>
                        {ticker.ptBull ? `$${parseFloat(ticker.ptBull).toFixed(2)}` : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '45px' }}>
                        <span className={getPercentColor(bullPercent)}>
                          {bullPercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-sm text-gray-900">
                        <div className="break-words whitespace-normal" title={ticker.thesis}>
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

export default ClearlineFlow;
