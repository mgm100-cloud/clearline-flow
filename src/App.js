import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Plus, Database, Users, TrendingUp, BarChart3, LogOut, ChevronUp, ChevronDown, RefreshCw, Download, CheckSquare, User, Mail, FileText, Upload, Wifi, WifiOff } from 'lucide-react';
import { DatabaseService } from './databaseService';
import { AuthService } from './services/authService';
import { twelveDataWS } from './services/twelveDataWebSocket';
import LoginScreen from './components/LoginScreen';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// TwelveData API configuration - using environment variable
const TWELVE_DATA_API_KEY = process.env.REACT_APP_TWELVE_DATA_API_KEY || 'YOUR_API_KEY_HERE';
const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

// Financial Modeling Prep API configuration - for earnings data only
const FMP_API_KEY = process.env.REACT_APP_FMP_API_KEY || 'YOUR_FMP_API_KEY_HERE';
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

// AlphaVantage API configuration - for company overview data (CIK, fiscal year-end)
const ALPHA_VANTAGE_API_KEY = process.env.REACT_APP_ALPHA_VANTAGE_API_KEY || 'YOUR_ALPHA_VANTAGE_API_KEY_HERE';
const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

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

console.log('🏛️ AlphaVantage API Key Status:', {
  hasKey: !!process.env.REACT_APP_ALPHA_VANTAGE_API_KEY,
  keyLength: process.env.REACT_APP_ALPHA_VANTAGE_API_KEY ? process.env.REACT_APP_ALPHA_VANTAGE_API_KEY.length : 0,
  firstChars: process.env.REACT_APP_ALPHA_VANTAGE_API_KEY ? process.env.REACT_APP_ALPHA_VANTAGE_API_KEY.substring(0, 8) + '...' : 'NOT_SET',
  usingFallback: ALPHA_VANTAGE_API_KEY === 'YOUR_ALPHA_VANTAGE_API_KEY_HERE'
});

// Helper function to calculate percentage change between price targets and current price
const calculatePercentChange = (priceTarget, currentPrice) => {
  if (!priceTarget || !currentPrice || currentPrice === 0) return '';
  const change = (parseFloat(priceTarget) / parseFloat(currentPrice) - 1) * 100;
  return `${change >= 0 ? '+' : ''}${Math.round(change)}%`;
};

// Currency symbol helper based on Bloomberg suffix
const getCurrencySymbol = (ticker) => {
  if (!ticker) return '$';
  const upper = ticker.toUpperCase();
  
  // Map Bloomberg suffixes to currency symbols
  if (upper.includes(' LN') || upper.includes(' LI')) return '£';  // UK - British Pound
  if (upper.includes(' GR') || upper.includes(' GY')) return '€';  // Germany - Euro
  if (upper.includes(' FP')) return '€';  // France - Euro
  if (upper.includes(' IM') || upper.includes(' HM') || upper.includes(' TE')) return '€';  // Italy - Euro
  if (upper.includes(' SM')) return '€';  // Spain - Euro
  if (upper.includes(' NA')) return '€';  // Netherlands - Euro
  if (upper.includes(' BB')) return '€';  // Belgium - Euro
  if (upper.includes(' ID')) return '€';  // Ireland - Euro
  if (upper.includes(' FH')) return '€';  // Finland - Euro
  if (upper.includes(' AV')) return '€';  // Austria - Euro
  if (upper.includes(' PL')) return '€';  // Portugal - Euro
  if (upper.includes(' GA')) return '€';  // Greece - Euro
  if (upper.includes(' SW')) return 'CHF';  // Switzerland - Swiss Franc
  if (upper.includes(' JP') || upper.includes(' JT')) return '¥';  // Japan - Yen
  if (upper.includes(' HK')) return 'HK$';  // Hong Kong - HK Dollar
  if (upper.includes(' AU')) return 'A$';  // Australia - Australian Dollar
  if (upper.includes(' CN') || upper.includes(' CT')) return 'C$';  // Canada - Canadian Dollar
  if (upper.includes(' SS') || upper.includes(' SZ')) return '¥';  // China - Yuan (uses same symbol as Yen)
  if (upper.includes(' KS') || upper.includes(' KQ')) return '₩';  // South Korea - Won
  if (upper.includes(' IN')) return '₹';  // India - Rupee
  if (upper.includes(' SP')) return 'S$';  // Singapore - Singapore Dollar
  if (upper.includes(' TB')) return '฿';  // Thailand - Baht
  if (upper.includes(' MK')) return 'RM';  // Malaysia - Ringgit
  if (upper.includes(' DC')) return 'kr';  // Denmark - Danish Krone
  if (upper.includes(' SS')) return 'kr';  // Sweden - Swedish Krona
  if (upper.includes(' NO')) return 'kr';  // Norway - Norwegian Krone
  if (upper.includes(' TT')) return 'NT$';  // Taiwan - New Taiwan Dollar
  
  // Default to USD for US stocks or unknown
  return '$';
};

// Format price with currency symbol and thousands separators
const formatPriceWithCurrency = (price, ticker) => {
  if (price === null || price === undefined || isNaN(price)) return '-';
  const symbol = getCurrencySymbol(ticker);
  
  // Format with 2 decimal places and thousands separators
  const formattedPrice = parseFloat(price).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  // Some currencies go after the number
  if (symbol === 'kr' || symbol === 'CHF') {
    return `${formattedPrice} ${symbol}`;
  }
  return `${symbol}${formattedPrice}`;
};

// Quote service for TwelveData integration
const QuoteService = {
  // Helper function to convert Swiss prices (divide by 100)
  convertSwissPrice(price, originalSymbol) {
    if (originalSymbol && originalSymbol.includes(' SW') && price) {
      return price / 100;
    }
    return price;
  },

  // Bloomberg to TwelveData suffix mapping (TwelveData uses different format)
  bloombergToTwelveDataMap: {
    'LN': ':LSE',      // London Stock Exchange
    'GR': ':XETR',     // Germany Xetra
    'GY': ':XETR',     // Germany Xetra (alternative)
    'CN': ':TSX',      // Canada Toronto Stock Exchange
    'CT': ':TSX',     // Canada Toronto Venture Exchange
    'JP': ':JPX',      // Japan Tokyo Stock Exchange
    'JT': ':JPX',      // Japan Tokyo Stock Exchange (alternative)
    'DC': ':XCSE',     // Denmark Copenhagen Stock Exchange
    'HK': ':HKG',      // Hong Kong Stock Exchange
    'AU': ':ASX',      // Australia ASX
    'FP': ':EURONEXT',      // France Euronext Paris
    'IM': ':MTA',      // Italy Borsa Italiana (main market)
    'HM': ':MTA',      // Italy HI-MTF (alternative Italian platform)
    'TE': ':MTA',      // Italy EuroTLX (Italian platform)
    'SM': ':MCE',      // Spain Madrid Stock Exchange
    'SW': ':SIX',      // Switzerland SIX Swiss Exchange
    'SS': ':SHH',      // China Shanghai Stock Exchange
    'SZ': ':SHZ',      // China Shenzhen Stock Exchange
    'IN': ':BSE',      // India Bombay Stock Exchange
    'KS': ':KRX',      // South Korea Seoul Stock Exchange
    'TB': ':BKK',      // Thailand Bangkok Stock Exchange
    'MK': ':KLS',      // Malaysia Kuala Lumpur Stock Exchange
    'SP': ':SGX',      // Singapore Stock Exchange
    'TT': ':TWO',      // Taiwan Stock Exchange
    'NA': ':Euronext', // Netherlands/Amsterdam Euronext
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

  // Check if symbol should use FMP (Japan, Hong Kong, Italy, UK, Denmark)
  isFMPSymbol(symbol) {
    if (!symbol) return false;
    const upperSymbol = symbol.toUpperCase();
    const fmpSuffixes = [' JP', ' JT', ' HK', ' IM', ' HM', ' TE', ' LN', ' DC'];
    return fmpSuffixes.some(suffix => upperSymbol.includes(suffix));
  },

  // Get the FMP exchange format for a symbol
  getFMPFormat(symbol) {
    if (!symbol) return null;
    const upperSymbol = symbol.toUpperCase();
    const tickerCode = symbol.split(' ')[0];
    
    // Map Bloomberg suffix to FMP format
    if (upperSymbol.includes(' JP') || upperSymbol.includes(' JT')) {
      return [`${tickerCode}.T`, `${tickerCode}.TYO`, tickerCode]; // Japan
    } else if (upperSymbol.includes(' HK')) {
      return [`${tickerCode}.HK`, tickerCode]; // Hong Kong
    } else if (upperSymbol.includes(' IM') || upperSymbol.includes(' HM') || upperSymbol.includes(' TE')) {
      return [`${tickerCode}.MI`, tickerCode]; // Italy Milan
    } else if (upperSymbol.includes(' LN')) {
      return [`${tickerCode}.L`, `${tickerCode}.LSE`, tickerCode]; // UK London
    } else if (upperSymbol.includes(' DC')) {
      return [`${tickerCode}.CO`, tickerCode]; // Denmark Copenhagen
    }
    return [tickerCode];
  },

  // Get quote for FMP-handled stocks (Japan, Hong Kong, Italy, UK, Denmark)
  async getFMPQuote(symbol) {
    if (!FMP_API_KEY || FMP_API_KEY === 'YOUR_FMP_API_KEY_HERE') {
      throw new Error('FMP API key not configured');
    }

    // Get the FMP format options for this symbol
    const formats = this.getFMPFormat(symbol);

    for (const fmpSymbol of formats) {
      try {
        const url = `${FMP_BASE_URL}/quote/${fmpSymbol}?apikey=${FMP_API_KEY}`;
        console.log(`🌍 Fetching FMP quote for ${fmpSymbol} (original: ${symbol})...`);
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (Array.isArray(data) && data.length > 0 && data[0].price) {
          const quote = data[0];
          console.log(`✅ FMP quote found for ${fmpSymbol}:`, quote.price);
          return {
            symbol: fmpSymbol,
            originalSymbol: symbol,
            price: parseFloat(quote.price),
            change: quote.change ? parseFloat(quote.change) : null,
            changePercent: quote.changesPercentage ? parseFloat(quote.changesPercentage) : null,
            volume: quote.volume ? parseInt(quote.volume) : null,
            previousClose: quote.previousClose ? parseFloat(quote.previousClose) : null,
            high: quote.dayHigh ? parseFloat(quote.dayHigh) : null,
            low: quote.dayLow ? parseFloat(quote.dayLow) : null,
            open: quote.open ? parseFloat(quote.open) : null,
            lastUpdated: new Date().toISOString(),
            source: 'fmp',
            isIntraday: true
          };
        }
      } catch (error) {
        console.log(`FMP format ${fmpSymbol} failed, trying next...`);
      }
    }
    
    throw new Error(`FMP quote not available for ${symbol}`);
  },

  // Legacy alias for Japanese quotes
  async getJapaneseQuote(symbol) {
    return this.getFMPQuote(symbol);
  },

  async getQuote(symbol) {
    // Route FMP-handled exchanges (Japan, Hong Kong, Italy, UK, Denmark) to FMP
    if (this.isFMPSymbol(symbol)) {
      return this.getFMPQuote(symbol);
    }

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
          price: this.convertSwissPrice(parseFloat(data['close']), symbol),
          change: data['change'] ? this.convertSwissPrice(parseFloat(data['change']), symbol) : null,
          changePercent: data['percent_change'] ? parseFloat(data['percent_change']) : null,
          volume: data['volume'] ? parseInt(data['volume']) : null,
          previousClose: data['previous_close'] ? this.convertSwissPrice(parseFloat(data['previous_close']), symbol) : null,
          high: data['high'] ? this.convertSwissPrice(parseFloat(data['high']), symbol) : null,
          low: data['low'] ? this.convertSwissPrice(parseFloat(data['low']), symbol) : null,
          open: data['open'] ? this.convertSwissPrice(parseFloat(data['open']), symbol) : null,
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
          price: this.convertSwissPrice(parseFloat(data['price']), symbol),
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
          price: this.convertSwissPrice(parseFloat(data['close']), symbol),
          change: data['change'] ? this.convertSwissPrice(parseFloat(data['change']), symbol) : null,
          changePercent: data['percent_change'] ? parseFloat(data['percent_change']) : null,
          volume: data['volume'] ? parseInt(data['volume']) : null,
          previousClose: data['previous_close'] ? this.convertSwissPrice(parseFloat(data['previous_close']), symbol) : null,
          high: data['high'] ? this.convertSwissPrice(parseFloat(data['high']), symbol) : null,
          low: data['low'] ? this.convertSwissPrice(parseFloat(data['low']), symbol) : null,
          open: data['open'] ? this.convertSwissPrice(parseFloat(data['open']), symbol) : null,
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

  // Batch daily volume data for multiple symbols
  async getBatchDailyVolumeData(symbols, days = 90) {
    const volumesMap = {};
    const errors = {};

    if (!TWELVE_DATA_API_KEY || TWELVE_DATA_API_KEY === 'YOUR_API_KEY_HERE') {
      for (const s of symbols) {
        try {
          const v = await this.getDailyVolumeData(s, days);
          const key = v.originalSymbol || s;
          volumesMap[key] = v;
        } catch (e) {
          errors[s] = e.message;
        }
      }
      return { volumes: volumesMap, errors };
    }

    const originalToConverted = {};
    const convertedList = symbols.map(s => {
      const conv = this.convertBloombergToTwelveData(s);
      originalToConverted[s] = conv;
      return conv;
    });

    const chunkSize = 25;
    for (let i = 0; i < convertedList.length; i += chunkSize) {
      const chunk = convertedList.slice(i, i + chunkSize);
      try {
        const url = `${TWELVE_DATA_BASE_URL}/time_series?symbol=${encodeURIComponent(chunk.join(','))}&interval=1day&outputsize=${days}&apikey=${TWELVE_DATA_API_KEY}`;
        console.log('Fetching batch daily volume from:', url);
        const resp = await fetch(url);
        const data = await resp.json();

        if (data && (data.error || data.code || data.status === 'error')) {
          const msg = data.message || data.error || 'Unknown error';
          chunk.forEach(conv => {
            const original = Object.keys(originalToConverted).find(k => originalToConverted[k] === conv) || conv;
            errors[original] = String(msg);
          });
          continue;
        }

        let entries = [];
        if (Array.isArray(data?.data)) entries = data.data;
        else if (Array.isArray(data)) entries = data;
        else if (data && data.values) entries = [data];
        else if (data && typeof data === 'object') entries = Object.values(data);

        for (const item of entries) {
          const convSym = item.symbol || item?.meta?.symbol || null;
          if (!convSym) continue;
          const original = Object.keys(originalToConverted).find(k => originalToConverted[k] === convSym) || convSym;
          const timeSeries = item.values || item.data || item['values'];
          if (!Array.isArray(timeSeries)) {
            volumesMap[original] = { symbol: convSym, originalSymbol: original, averageDailyVolume: null };
            continue;
          }
          const vols = timeSeries.slice(0, days).map(x => parseFloat(x.volume)).filter(v => v > 0);
          const avg = vols.length ? Math.round(vols.reduce((a, b) => a + b, 0) / vols.length) : null;
          volumesMap[original] = { symbol: convSym, originalSymbol: original, averageDailyVolume: avg, daysCalculated: vols.length, periodRequested: days };
        }

        const returned = new Set(Object.keys(volumesMap));
        for (const conv of chunk) {
          const original = Object.keys(originalToConverted).find(k => originalToConverted[k] === conv) || conv;
          if (!returned.has(original)) {
            try {
              const v = await this.getDailyVolumeData(original, days);
              const key = v.originalSymbol || original;
              volumesMap[key] = v;
            } catch (e) {
              errors[original] = e.message;
            }
          }
        }
      } catch (e) {
        console.warn('Batch daily volume fetch failed, falling back sequentially:', e);
        for (const conv of chunk) {
          const original = Object.keys(originalToConverted).find(k => originalToConverted[k] === conv) || conv;
          try {
            const v = await this.getDailyVolumeData(original, days);
            const key = v.originalSymbol || original;
            volumesMap[key] = v;
          } catch (err) {
            errors[original] = err.message;
          }
        }
      }
    }

    return { volumes: volumesMap, errors };
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

  // Get ALL earnings from Financial Modeling Prep
  async getAllUpcomingEarningsFromFMP(symbol) {
    if (!FMP_API_KEY || FMP_API_KEY === 'YOUR_FMP_API_KEY_HERE') {
      console.warn('Financial Modeling Prep API key not configured, skipping FMP');
      return null;
    }

    // Clean symbol - remove Bloomberg suffixes for FMP (FMP uses standard US symbols)
    const cleanSymbol = symbol.replace(/ US$/, '').trim().toUpperCase();

    try {
      // FMP earnings endpoint for specific symbol
      const url = `https://financialmodelingprep.com/stable/earnings?symbol=${cleanSymbol}&apikey=${FMP_API_KEY}`;
                    console.log(`Fetching recent earnings data for ${cleanSymbol} (original: ${symbol}) from FMP (last 12 months + future):`, url);
      
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
      
      // Get date 12 months ago
      const twelveMonthsAgo = new Date(today);
      twelveMonthsAgo.setFullYear(today.getFullYear() - 1);
      
      // Find earnings from last 12 months + future earnings
      const relevantEarnings = data.filter(earning => {
        if (!earning.date) return false;
        
        // Parse date string as local date, not UTC to avoid timezone issues
        const dateParts = earning.date.split('-');
        const earningDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        earningDate.setHours(0, 0, 0, 0); // Normalize earnings date to start of day
        
        // Include if it's within the last 12 months OR in the future
        return earningDate >= twelveMonthsAgo;
      });

      if (relevantEarnings.length === 0) {
        console.warn(`No recent earnings found for ${cleanSymbol} in FMP (last 12 months + future)`);
        return null;
      }
      
      // Sort by date and return relevant earnings dates (last 12 months + future)
      const sortedEarnings = relevantEarnings.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Find the next future earnings for backward compatibility
      const futureEarnings = sortedEarnings.filter(earning => {
        const dateParts = earning.date.split('-');
        const earningDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        earningDate.setHours(0, 0, 0, 0);
        return earningDate >= today;
      });
      
      return {
        symbol: cleanSymbol,
        originalSymbol: symbol,
        allEarningsDates: sortedEarnings.map(earning => ({
          date: earning.date,
          estimatedEPS: earning.eps ? parseFloat(earning.eps) : null,
          estimatedEPSHigh: earning.epsEstimatedHigh ? parseFloat(earning.epsEstimatedHigh) : null,
          estimatedEPSLow: earning.epsEstimatedLow ? parseFloat(earning.epsEstimatedLow) : null,
          estimatedRevenue: earning.revenueEstimated ? parseFloat(earning.revenueEstimated) : null,
          numberOfEstimates: earning.numberOfEstimates ? parseInt(earning.numberOfEstimates) : null,
          time: earning.time || null,
          updatedFromDate: earning.updatedFromDate || null,
          fiscalDateEnding: earning.fiscalDateEnding || null
        })),
        nextEarningsDate: futureEarnings.length > 0 ? futureEarnings[0].date : null, // Keep for backward compatibility
        currency: 'USD', // FMP primarily covers US stocks
        source: 'FMP',
        isActual: true // This is from the actual earnings data
      };
      
    } catch (error) {
      console.error(`Error fetching FMP earnings data for ${cleanSymbol} (original: ${symbol}):`, error);
      return null;
    }
  },

  // Get earnings from Financial Modeling Prep (backward compatibility)
  async getUpcomingEarningsFromFMP(symbol) {
    const allEarnings = await this.getAllUpcomingEarningsFromFMP(symbol);
    if (!allEarnings || !allEarnings.allEarningsDates || allEarnings.allEarningsDates.length === 0) {
      return null;
    }
    
    // Return just the next earnings for backward compatibility
    const nextEarning = allEarnings.allEarningsDates[0];
    const earningsDate = new Date(nextEarning.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return {
      symbol: allEarnings.symbol,
      originalSymbol: allEarnings.originalSymbol,
      nextEarningsDate: nextEarning.date,
      estimatedEPS: nextEarning.estimatedEPS,
      estimatedEPSHigh: nextEarning.estimatedEPSHigh,
      estimatedEPSLow: nextEarning.estimatedEPSLow,
      estimatedRevenue: nextEarning.estimatedRevenue,
      numberOfEstimates: nextEarning.numberOfEstimates,
      time: nextEarning.time,
      updatedFromDate: nextEarning.updatedFromDate,
      fiscalDateEnding: nextEarning.fiscalDateEnding,
      currency: allEarnings.currency,
      source: allEarnings.source,
      isActual: allEarnings.isActual,
      daysUntilEarnings: Math.ceil((earningsDate - today) / (1000 * 60 * 60 * 24))
    };
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

    if (!TWELVE_DATA_API_KEY || TWELVE_DATA_API_KEY === 'YOUR_API_KEY_HERE') {
      // Fall back to sequential with clear error if no key
      for (const symbol of symbols) {
        try {
          const q = await this.getQuote(symbol);
          const keySymbol = q.originalSymbol || symbol;
          quotes[keySymbol] = q;
        } catch (e) {
          errors[symbol] = e.message;
        }
      }
      return { quotes, errors };
    }

    // Build mapping original -> converted and list of converted symbols
    const originalToConverted = {};
    const convertedList = [];
    symbols.forEach((s) => {
      const conv = this.convertBloombergToTwelveData(s);
      originalToConverted[s] = conv;
      convertedList.push(conv);
    });

    // Chunk to respect URL length and rate limits
    const chunkSize = 30; // safe chunk size
    for (let i = 0; i < convertedList.length; i += chunkSize) {
      const chunk = convertedList.slice(i, i + chunkSize);
      try {
        const url = `${TWELVE_DATA_BASE_URL}/quote?symbol=${encodeURIComponent(chunk.join(','))}&apikey=${TWELVE_DATA_API_KEY}`;
        console.log('Fetching batch quotes from:', url);
        const resp = await fetch(url);
        const data = await resp.json();
        console.log('Batch quote payload:', data);

        // Handle error envelope
        if (data && (data.error || data.code || data.status === 'error')) {
          const msg = data.message || data.error || 'Unknown error';
          // Mark each symbol in this chunk as failed
          chunk.forEach((conv) => {
            const original = Object.keys(originalToConverted).find((k) => originalToConverted[k] === conv) || conv;
            errors[original] = String(msg);
          });
          continue;
        }

        // Normalize into array of entries
        let entries = [];
        if (Array.isArray(data?.data)) {
          entries = data.data;
        } else if (Array.isArray(data)) {
          entries = data;
        } else if (data && data.symbol && (data.close || data.price)) {
          entries = [data];
        } else if (data && typeof data === 'object') {
          // Some APIs return an object keyed by symbol
          entries = Object.values(data);
        }

        // Map each entry back to original symbol and store
        for (const item of entries) {
          const convSym = item.symbol || item.ticker || null;
          if (!convSym) continue;
          // Find original
          const original = Object.keys(originalToConverted).find((k) => originalToConverted[k] === convSym) || convSym;
          // Determine price fields
          const priceVal = item.close ?? item.price ?? item.last ?? null;
          if (priceVal == null) {
            errors[original] = 'No price in batch item';
            continue;
          }
          quotes[original] = {
            symbol: convSym,
            originalSymbol: original,
            price: this.convertSwissPrice(parseFloat(priceVal), original),
            change: item.change != null ? this.convertSwissPrice(parseFloat(item.change), original) : null,
            changePercent: item.percent_change != null ? parseFloat(item.percent_change) : null,
            volume: item.volume != null ? parseInt(item.volume) : null,
            previousClose: item.previous_close != null ? this.convertSwissPrice(parseFloat(item.previous_close), original) : null,
            high: item.high != null ? this.convertSwissPrice(parseFloat(item.high), original) : null,
            low: item.low != null ? this.convertSwissPrice(parseFloat(item.low), original) : null,
            open: item.open != null ? this.convertSwissPrice(parseFloat(item.open), original) : null,
            lastUpdated: item.datetime || new Date().toISOString(),
            source: 'batch-quote',
            isIntraday: true
          };
        }

        // For any symbols in the chunk not returned, fall back to price-only
        const returnedOriginals = new Set(Object.keys(quotes));
        for (const conv of chunk) {
          const original = Object.keys(originalToConverted).find((k) => originalToConverted[k] === conv) || conv;
          if (!returnedOriginals.has(original)) {
            try {
              const q = await this.getPriceOnly(original);
              const keySymbol = q.originalSymbol || original;
              quotes[keySymbol] = q;
            } catch (e) {
              errors[original] = e.message;
            }
          }
        }
      } catch (e) {
        // On batch error, fall back sequential for this chunk
        console.warn('Batch quote fetch failed, falling back sequentially:', e);
        for (const conv of chunk) {
          const original = Object.keys(originalToConverted).find((k) => originalToConverted[k] === conv) || conv;
          try {
            const q = await this.getQuote(original);
            const keySymbol = q.originalSymbol || original;
            quotes[keySymbol] = q;
          } catch (err) {
            errors[original] = err.message;
          }
        }
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
        // Try to get ALL earnings first (from FMP)
        const allEarningsData = await this.getAllUpcomingEarningsFromFMP(symbol);
        if (allEarningsData) {
          // Use the original symbol as the key
          const keySymbol = allEarningsData.originalSymbol || symbol;
          earnings[keySymbol] = allEarningsData;
        } else {
          // Fallback to single earnings date (Twelve Data)
          const earningsData = await this.getUpcomingEarningsDate(symbol);
          if (earningsData) {
            // Use the original symbol as the key
            const keySymbol = earningsData.originalSymbol || symbol;
            earnings[keySymbol] = earningsData;
          }
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
  },

  // Get company overview from AlphaVantage for CIK and fiscal year-end data
  async getCompanyOverviewFromAlphaVantage(symbol) {
    if (!ALPHA_VANTAGE_API_KEY || ALPHA_VANTAGE_API_KEY === 'YOUR_ALPHA_VANTAGE_API_KEY_HERE') {
      throw new Error('AlphaVantage API key not configured');
    }

    // Clean symbol for AlphaVantage (primarily US market focused)
    // Only remove US market suffixes - keep international suffixes intact
    let cleanSymbol = symbol.trim().toUpperCase();
    
    // Only remove US market suffixes - AlphaVantage uses clean US symbols for US stocks
    const usMarketSuffixes = [' US', ' UN', ' UR', ' UV', ' UW', ' UQ', ' UP'];
    for (const suffix of usMarketSuffixes) {
      if (cleanSymbol.endsWith(suffix)) {
        cleanSymbol = cleanSymbol.replace(suffix, '').trim();
        break;
      }
    }
    
    // Check if this is an international ticker that won't work with AlphaVantage
    const isInternational = symbol.includes(' ') && !usMarketSuffixes.some(suffix => symbol.includes(suffix));
    
    // For international tickers, skip AlphaVantage API call and provide fallback data immediately
    if (isInternational) {
      console.warn(`⚠️ International ticker detected: ${symbol}. Providing fallback data as AlphaVantage doesn't support international stocks.`);
      
      // Determine country and exchange based on market suffix
      let country = 'Unknown';
      let exchange = null;
      let currency = null;
      
      if (symbol.includes(' SW')) {
        country = 'Switzerland';
        exchange = 'SIX Swiss Exchange';
        currency = 'CHF';
      } else if (symbol.includes(' LN')) {
        country = 'United Kingdom';
        exchange = 'London Stock Exchange';
        currency = 'GBP';
      } else if (symbol.includes(' GR')) {
        country = 'Germany';
        exchange = 'Xetra';
        currency = 'EUR';
      } else if (symbol.includes(' FP')) {
        country = 'France';
        exchange = 'Euronext Paris';
        currency = 'EUR';
      } else if (symbol.includes(' HK')) {
        country = 'Hong Kong';
        exchange = 'Hong Kong Stock Exchange';
        currency = 'HKD';
      } else if (symbol.includes(' JP')) {
        country = 'Japan';
        exchange = 'Tokyo Stock Exchange';
        currency = 'JPY';
      } else if (symbol.includes(' AU')) {
        country = 'Australia';
        exchange = 'ASX';
        currency = 'AUD';
      } else if (symbol.includes(' IM')) {
        country = 'Italy';
        exchange = 'Borsa Italiana';
        currency = 'EUR';
      } else if (symbol.includes(' SM')) {
        country = 'Spain';
        exchange = 'Madrid Stock Exchange';
        currency = 'EUR';
      }
      
      return {
        symbol: symbol, // Keep the original international symbol with suffix
        originalSymbol: symbol,
        cik: null,
        fiscalYearEnd: '12/31', // Default fiscal year end
        cyq1Date: '03/31',      // Standard quarterly dates
        cyq2Date: '06/30',
        cyq3Date: '09/30',
        cyq4Date: '12/31',
        name: null,
        description: `International stock (${country}) - AlphaVantage not supported`,
        exchange: exchange,
        currency: currency,
        country: country,
        sector: null,
        industry: null,
        marketCapitalization: null,
        source: 'International-Fallback',
        isInternational: true,
        note: `International ticker from ${country} - CIK not available`
      };
    }

    try {
      const url = `${ALPHA_VANTAGE_BASE_URL}?function=OVERVIEW&symbol=${cleanSymbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
      console.log(`Getting company overview for ${cleanSymbol} from AlphaVantage:`, url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log(`AlphaVantage overview response for ${cleanSymbol}:`, data);
      
      // Check for API errors
      if (data['Error Message']) {
        throw new Error(`AlphaVantage error: ${data['Error Message']}`);
      }

      if (data['Note']) {
        throw new Error('AlphaVantage API call frequency limit reached. Please try again later.');
      }

      // Check if we have a valid response with Symbol field
      if (!data.Symbol) {
        // For international tickers, provide fallback data instead of failing
        if (isInternational) {
          console.warn(`No AlphaVantage data for international ticker ${symbol}, providing fallback data`);
          
          // Determine country and exchange based on market suffix
          let country = 'Unknown';
          let exchange = null;
          let currency = null;
          
          if (symbol.includes(' SW')) {
            country = 'Switzerland';
            exchange = 'SIX Swiss Exchange';
            currency = 'CHF';
          } else if (symbol.includes(' LN')) {
            country = 'United Kingdom';
            exchange = 'London Stock Exchange';
            currency = 'GBP';
          } else if (symbol.includes(' GR')) {
            country = 'Germany';
            exchange = 'Xetra';
            currency = 'EUR';
          } else if (symbol.includes(' FP')) {
            country = 'France';
            exchange = 'Euronext Paris';
            currency = 'EUR';
          } else if (symbol.includes(' HK')) {
            country = 'Hong Kong';
            exchange = 'Hong Kong Stock Exchange';
            currency = 'HKD';
          } else if (symbol.includes(' JP')) {
            country = 'Japan';
            exchange = 'Tokyo Stock Exchange';
            currency = 'JPY';
          } else if (symbol.includes(' AU')) {
            country = 'Australia';
            exchange = 'ASX';
            currency = 'AUD';
          }
          
          return {
            symbol: cleanSymbol,
            originalSymbol: symbol,
            cik: null,
            fiscalYearEnd: '12/31', // Default fiscal year end
            cyq1Date: '03/31',      // Standard quarterly dates
            cyq2Date: '06/30',
            cyq3Date: '09/30',
            cyq4Date: '12/31',
            name: null,
            description: `International stock (${country}) - AlphaVantage data not available`,
            exchange: exchange,
            currency: currency,
            country: country,
            sector: null,
            industry: null,
            marketCapitalization: null,
            source: 'AlphaVantage-Fallback',
            isInternational: true,
            note: `Fallback data provided for ${country} ticker - CIK not available`
          };
        }
        throw new Error(`No company overview data available for ${cleanSymbol}`);
      }

      // Helper function to format fiscal year-end
      const formatFiscalYearEnd = (fiscalYearEnd) => {
        if (!fiscalYearEnd) return null;
        
        // FiscalYearEnd comes as month name (e.g., "December", "March")
        const monthMap = {
          'January': '01', 'February': '02', 'March': '03',
          'April': '04', 'May': '05', 'June': '06',
          'July': '07', 'August': '08', 'September': '09',
          'October': '10', 'November': '11', 'December': '12'
        };

        const monthNumber = monthMap[fiscalYearEnd];
        if (!monthNumber) return null;

        // Get the last day of the month
        const year = new Date().getFullYear(); // Use current year for calculation
        const lastDay = new Date(year, parseInt(monthNumber), 0).getDate();
        
        return `${monthNumber}/${lastDay.toString().padStart(2, '0')}`;
      };

      // Helper function to calculate CYQ dates based on fiscal year-end
      const calculateCYQDates = (fiscalYearEndFormatted) => {
        if (!fiscalYearEndFormatted) return { cyq1Date: null, cyq2Date: null, cyq3Date: null, cyq4Date: null };
        
        // Parse the fiscal year-end MM/DD format
        const [fiscalMonth, fiscalDay] = fiscalYearEndFormatted.split('/');
        const fiscalMonthNum = parseInt(fiscalMonth);
        
        // Calculate all 4 quarter end months (add 3, 6, 9, 12 months)
        const quarterMonths = [
          ((fiscalMonthNum - 1 + 3) % 12) + 1,   // Q1 end
          ((fiscalMonthNum - 1 + 6) % 12) + 1,   // Q2 end  
          ((fiscalMonthNum - 1 + 9) % 12) + 1,   // Q3 end
          fiscalMonthNum                          // Q4 end (fiscal year-end)
        ];
        
        // Helper to get last day of month and format as MM/DD
        const formatQuarterEnd = (month) => {
          const year = new Date().getFullYear();
          const lastDay = new Date(year, month, 0).getDate();
          return `${month.toString().padStart(2, '0')}/${lastDay.toString().padStart(2, '0')}`;
        };
        
        // Create array of quarter dates with their formatted strings
        const quarterDates = quarterMonths.map(month => ({
          month: month,
          formatted: formatQuarterEnd(month)
        }));
        
        // Sort by month number to get chronological order
        quarterDates.sort((a, b) => a.month - b.month);
        
        return {
          cyq1Date: quarterDates[0].formatted,
          cyq2Date: quarterDates[1].formatted,
          cyq3Date: quarterDates[2].formatted,
          cyq4Date: quarterDates[3].formatted
        };
      };
      
      const fiscalYearEndFormatted = formatFiscalYearEnd(data.FiscalYearEnd);
      const cyqDates = calculateCYQDates(fiscalYearEndFormatted);
      
      return {
        symbol: cleanSymbol,
        originalSymbol: symbol,
        cik: data.CIK || null,
        fiscalYearEnd: fiscalYearEndFormatted,
        cyq1Date: cyqDates.cyq1Date,
        cyq2Date: cyqDates.cyq2Date,
        cyq3Date: cyqDates.cyq3Date,
        cyq4Date: cyqDates.cyq4Date,
        name: data.Name || null,
        description: data.Description || null,
        exchange: data.Exchange || null,
        currency: data.Currency || null,
        country: data.Country || null,
        sector: data.Sector || null,
        industry: data.Industry || null,
        marketCapitalization: data.MarketCapitalization ? parseFloat(data.MarketCapitalization) : null,
        source: 'AlphaVantage'
      };
      
    } catch (error) {
      console.error(`Error fetching AlphaVantage overview for ${cleanSymbol}:`, error);
      
      // For international tickers, provide fallback data instead of throwing
      if (isInternational) {
        console.warn(`AlphaVantage failed for international ticker ${symbol}, providing fallback data`);
        
        // Determine country and exchange based on market suffix
        let country = 'Unknown';
        let exchange = null;
        let currency = null;
        
        if (symbol.includes(' SW')) {
          country = 'Switzerland';
          exchange = 'SIX Swiss Exchange';
          currency = 'CHF';
        } else if (symbol.includes(' LN')) {
          country = 'United Kingdom';
          exchange = 'London Stock Exchange';
          currency = 'GBP';
        } else if (symbol.includes(' GR')) {
          country = 'Germany';
          exchange = 'Xetra';
          currency = 'EUR';
        } else if (symbol.includes(' FP')) {
          country = 'France';
          exchange = 'Euronext Paris';
          currency = 'EUR';
        } else if (symbol.includes(' HK')) {
          country = 'Hong Kong';
          exchange = 'Hong Kong Stock Exchange';
          currency = 'HKD';
        } else if (symbol.includes(' JP')) {
          country = 'Japan';
          exchange = 'Tokyo Stock Exchange';
          currency = 'JPY';
        } else if (symbol.includes(' AU')) {
          country = 'Australia';
          exchange = 'ASX';
          currency = 'AUD';
        }
        
        return {
          symbol: cleanSymbol,
          originalSymbol: symbol,
          cik: null,
          fiscalYearEnd: '12/31', // Default fiscal year end
          cyq1Date: '03/31',      // Standard quarterly dates
          cyq2Date: '06/30',
          cyq3Date: '09/30',
          cyq4Date: '12/31',
          name: null,
          description: `International stock (${country}) - AlphaVantage API failed`,
          exchange: exchange,
          currency: currency,
          country: country,
          sector: null,
          industry: null,
          marketCapitalization: null,
          source: 'AlphaVantage-Error-Fallback',
          isInternational: true,
          note: `Fallback data provided for ${country} ticker due to API error: ${error.message}`
        };
      }
      
      throw error;
    }
  }
};
// Helper function to get value from localStorage with fallback
const getStoredValue = (key, defaultValue) => {
  try {
    const item = window.localStorage.getItem(`clearlineflow_${key}`);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.warn(`Failed to load ${key} from localStorage:`, error);
    return defaultValue;
  }
};

// Helper function to store value in localStorage
const setStoredValue = (key, value) => {
  try {
    window.localStorage.setItem(`clearlineflow_${key}`, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to save ${key} to localStorage:`, error);
  }
};

const ClearlineFlow = () => {
  // Reference to prevent re-initialization on tab focus
  const isInitializedRef = useRef(false);
  
  // Log component mount only once
  const hasMountedRef = useRef(false);
  if (!hasMountedRef.current) {
    console.log('🚀 ClearlineFlow component mounted');
    hasMountedRef.current = true;
  }
  // Reference to prevent infinite auth refresh loops
  const isRefreshingRef = useRef(false);
  
  // Authentication state - using Supabase Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(''); // 'readwrite' or 'readonly'
  const [userDivision, setUserDivision] = useState(''); // 'Investment', 'Ops', 'Admin', 'Marketing', 'Super'
  
  // Persistent state - these will restore from localStorage
  const [activeTab, _setActiveTab] = useState(() => getStoredValue('activeTab', 'input'));
  const [selectedTickerForDetail, setSelectedTickerForDetail] = useState(null);
  const [previousTab, _setPreviousTab] = useState(() => getStoredValue('previousTab', 'input'));
  const [navigationSource, setNavigationSource] = useState('dropdown'); // 'dropdown' or 'hyperlink'
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  // Data state
  const [tickers, setTickers] = useState([]);
  const [analysts, setAnalysts] = useState(['LT', 'GA', 'DP', 'MS', 'DO', 'MM']);
  const [analystEmails, setAnalystEmails] = useState([]);
  const [selectedAnalyst, _setSelectedAnalyst] = useState(() => getStoredValue('selectedAnalyst', 'LT'));
  const [prefilledFormData, setPrefilledFormData] = useState(null);
  
  // Persistent state setters that also save to localStorage
  const setActiveTab = useCallback((value) => {
    _setActiveTab(value);
    setStoredValue('activeTab', value);
  }, []);
  
  const setPreviousTab = useCallback((value) => {
    _setPreviousTab(value);
    setStoredValue('previousTab', value);
  }, []);
  
  const setSelectedAnalyst = useCallback((value) => {
    _setSelectedAnalyst(value);
    setStoredValue('selectedAnalyst', value);
  }, []);
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  
  // Quote state
  const [quotes, setQuotes] = useState({});
  const [quoteErrors, setQuoteErrors] = useState({});
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [lastQuoteUpdate, setLastQuoteUpdate] = useState(null);
  
  // WebSocket state for real-time quotes
  const [wsConnected, setWsConnected] = useState(false);
  const [wsLastUpdate, setWsLastUpdate] = useState(null);
  const [wsFailedSymbols, setWsFailedSymbols] = useState([]);
  const [wsSuccessCount, setWsSuccessCount] = useState(0);
  const wsInitializedRef = useRef(false);
  
  // Earnings tracking state
  const [earningsData, setEarningsData] = useState([]);
  const [selectedEarningsAnalyst, _setSelectedEarningsAnalyst] = useState(() => getStoredValue('selectedEarningsAnalyst', ''));
  
  // Todo state
  const [todos, setTodos] = useState([]);
  const [deletedTodos, setDeletedTodos] = useState([]);
  const [selectedTodoAnalyst, _setSelectedTodoAnalyst] = useState(() => getStoredValue('selectedTodoAnalyst', ''));
  const [activeTodoDivision, _setActiveTodoDivision] = useState(() => getStoredValue('activeTodoDivision', 'Investment'));
  
  // More persistent state setters
  const setSelectedEarningsAnalyst = useCallback((value) => {
    _setSelectedEarningsAnalyst(value);
    setStoredValue('selectedEarningsAnalyst', value);
  }, []);
  
  const setSelectedTodoAnalyst = useCallback((value) => {
    _setSelectedTodoAnalyst(value);
    setStoredValue('selectedTodoAnalyst', value);
  }, []);
  
  const setActiveTodoDivision = useCallback((value) => {
    _setActiveTodoDivision(value);
    setStoredValue('activeTodoDivision', value);
  }, []);
  
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

  // Format trade level with commas and 2 decimal places
  const formatTradeLevel = (value) => {
    if (!value || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Format date as mm/dd/yy
  const formatCompactDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const raw = typeof dateString === 'string' ? dateString : '';
      const ymd = raw.split('T')[0];
      
      // Check if the date is 01/01/2000 (our N/A indicator)
      if (ymd === '2000-01-01') return 'N/A';
      
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
      if (match) {
        const [, y, m, d] = match;
        return `${m}/${d}/${y.slice(-2)}`;
      }
      // Fallback: return as-is if it is not a plain YYYY-MM-DD string
      return raw || dateString;
    } catch {
      return dateString;
    }
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
          
          // Kick off non-blocking refresh of user data; proceed even if it hangs
          console.log('🔄 Refreshing user data from database (non-blocking)...');
          const refreshedUser = await Promise.race([
            AuthService.refreshUserData(user),
            new Promise(resolve => setTimeout(() => resolve(user), 1500))
          ]);
          console.log('✅ User data resolved:', refreshedUser);
          
          const role = AuthService.getUserRole(refreshedUser);
          const division = await AuthService.getUserDivision(refreshedUser);
          const analystCode = AuthService.getUserAnalystCode(refreshedUser);
          console.log('👤 User role determined:', role);
          console.log('👤 User division:', division);
          console.log('👤 User analyst code:', analystCode);
          console.log('📋 User metadata:', refreshedUser?.user_metadata);
          
          // Temporary fix for existing users without division
          if (!division && (analystCode || role === 'admin' || role === 'readwrite')) {
            console.log('🔧 Applying temporary fix: setting division to Investment for existing user');
            AuthService.addDivisionToUser('Investment').then(() => {
              console.log('✅ Division added to user metadata. Please refresh the page.');
            }).catch(error => {
              console.error('❌ Failed to add division:', error);
            });
          }
          setCurrentUser(refreshedUser);
          setUserRole(role);
          setUserDivision(division);
          setIsAuthenticated(true);
          
          // Only set defaults if not already persisted in localStorage and not already initialized
          const hasPersistedTab = getStoredValue('activeTab', null);
          const hasPersistedAnalyst = getStoredValue('selectedAnalyst', null);
          
          if (!hasPersistedTab && !isInitializedRef.current) {
            console.log('🏗️ Setting default tab based on division (first time initialization)');
            if (division === 'Investment' || division === 'Super') {
              setActiveTab('input');
            } else if (division === '') {
              console.warn('⚠️ User has no division set. Defaulting to todos tab.');
              setActiveTab('todos');
            } else {
              setActiveTab('todos'); // Ops, Admin, Marketing default to Todo List
            }
          } else if (hasPersistedTab) {
            console.log('🔄 Restored tab from localStorage:', hasPersistedTab);
          }
          
          // Set default analyst selections based on user's analyst_code - only if not persisted
          if (analystCode && analysts.includes(analystCode) && !hasPersistedAnalyst && !isInitializedRef.current) {
            console.log('🏗️ Setting default analyst selections (first time initialization)');
            setSelectedAnalyst(analystCode);
            setSelectedTodoAnalyst(analystCode);
            // For earnings tracking, set to 'All Analysts' if user is MM, otherwise use their analyst code
            if (analystCode === 'MM') {
              setSelectedEarningsAnalyst('All Analysts');
            } else {
              setSelectedEarningsAnalyst(analystCode);
            }
          } else if (hasPersistedAnalyst) {
            console.log('🔄 Restored analyst from localStorage:', hasPersistedAnalyst);
          }
          
          isInitializedRef.current = true;
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

    // Add visibility API to detect tab switches
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 Tab became visible - preserving state');
      } else {
        console.log('🔄 Tab became hidden - state preserved in localStorage');
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Listen for auth state changes
    const { data: { subscription } } = AuthService.onAuthStateChange(async (event, session) => {
      // Ignore token refresh events to preserve app state during tab switching
      if (event === 'TOKEN_REFRESHED') {
        console.log('🔄 Token refreshed - preserving app state');
        return;
      }
      
      // If user is already authenticated and this is the same user signing in again, ignore
      if (event === 'SIGNED_IN' && session && currentUser && currentUser.id === session.user.id && isAuthenticated && isInitializedRef.current) {
        console.log('🔄 Duplicate sign-in event for current user - preserving app state');
        return;
      }
      
      // Prevent infinite loops during refresh operations
      if (isRefreshingRef.current) {
        console.log('🔄 Already refreshing user data - ignoring duplicate auth event');
        return;
      }
      
      console.log('🔄 Auth state changed:', event, session);
      
      if (event === 'SIGNED_IN' && session) {
        const user = session.user;
        console.log('✅ User signed in:', user);
        
        // Set refresh flag to prevent infinite loops
        isRefreshingRef.current = true;
        
        // Refresh user data (non-blocking with timeout) to avoid auth flow stalls
        console.log('🔄 Refreshing user data from database (non-blocking)...');
        const refreshedUser = await Promise.race([
          AuthService.refreshUserData(user),
          new Promise(resolve => setTimeout(() => resolve(user), 1500))
        ]);
        console.log('✅ User data resolved:', refreshedUser);
        
          const role = AuthService.getUserRole(refreshedUser);
          // On INITIAL_SESSION/auth restoration, allow DB lookup for division
          const division = await AuthService.getUserDivision(refreshedUser);
        const analystCode = AuthService.getUserAnalystCode(refreshedUser);
        console.log('👤 User role determined:', role);
        console.log('👤 User division:', division);
        console.log('👤 User analyst code:', analystCode);
        console.log('📋 User metadata:', refreshedUser?.user_metadata);
        
        // Temporary fix for existing users without division
        if (!division && (analystCode || role === 'admin' || role === 'readwrite')) {
          console.log('🔧 Applying temporary fix: setting division to Investment for existing user');
          AuthService.addDivisionToUser('Investment').then(() => {
            console.log('✅ Division added to user metadata. Please refresh the page.');
          }).catch(error => {
            console.error('❌ Failed to add division:', error);
          });
        }
        setCurrentUser(refreshedUser);
        setUserRole(role);
        setUserDivision(division);
        setIsAuthenticated(true);
        setAuthError('');
        
        // Only set defaults if this is truly a new sign-in (not a tab focus/remount)
        // Check if we don't have persisted state AND haven't initialized yet
        const hasPersistedTab = getStoredValue('activeTab', null);
        const hasPersistedAnalyst = getStoredValue('selectedAnalyst', null);
        
        if (!currentUser && !isInitializedRef.current) {
          console.log('🏗️ New sign-in detected - setting defaults if not persisted');
          
          if (!hasPersistedTab) {
            if (division === 'Investment' || division === 'Super') {
              setActiveTab('input');
            } else if (division === '') {
              console.warn('⚠️ User has no division set. Defaulting to todos tab.');
              setActiveTab('todos');
            } else {
              setActiveTab('todos'); // Ops, Admin, Marketing default to Todo List
            }
          }
          
          // Set default analyst selections based on user's analyst_code - only if not persisted
          if (analystCode && analysts.includes(analystCode) && !hasPersistedAnalyst) {
            setSelectedAnalyst(analystCode);
            setSelectedTodoAnalyst(analystCode);
            // For earnings tracking, set to 'All Analysts' if user is MM, otherwise use their analyst code
            if (analystCode === 'MM') {
              setSelectedEarningsAnalyst('All Analysts');
            } else {
              setSelectedEarningsAnalyst(analystCode);
            }
          }
          
          isInitializedRef.current = true;
        } else {
          console.log('🔄 Tab refocus or remount detected - preserving existing state');
        }
        
        // Reset refresh flag at the end of SIGNED_IN processing
        isRefreshingRef.current = false;
      } else if (event === 'SIGNED_OUT') {
        console.log('🚪 User signed out');
        setCurrentUser(null);
        setUserRole('');
        setUserDivision('');
        setIsAuthenticated(false);
        setActiveTab('input');
        setAuthError('');
        // Reset initialization flag and clear localStorage
        isInitializedRef.current = false;
        isRefreshingRef.current = false;
        // Clear persisted state on logout
        window.localStorage.removeItem('clearlineflow_activeTab');
        window.localStorage.removeItem('clearlineflow_selectedAnalyst');
        window.localStorage.removeItem('clearlineflow_selectedEarningsAnalyst');
        window.localStorage.removeItem('clearlineflow_selectedTodoAnalyst');
        window.localStorage.removeItem('clearlineflow_previousTab');
        // Reset to default values
        setSelectedAnalyst('LT');
        setSelectedTodoAnalyst('');
        setSelectedEarningsAnalyst('');
      }
    });

    // Cleanup subscription and event listener on unmount
    return () => {
      subscription?.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
          
          // Also load deleted todos
          const deletedTodosData = await DatabaseService.getDeletedTodos();
          console.log('✅ Successfully loaded deleted todos from Supabase:', deletedTodosData);
          setDeletedTodos(deletedTodosData);
        } catch (todosError) {
          console.warn('⚠️ Could not load todos data (table may not exist yet):', todosError);
          setTodos([]);
          setDeletedTodos([]);
        }
        
        // Load analysts from user_profiles (Investment/Super division only)
        try {
          console.log('📡 Calling DatabaseService.getAnalysts()...');
          const analystsData = await DatabaseService.getAnalysts();
          console.log('✅ Successfully loaded analysts from Supabase:', analystsData);
          setAnalysts(analystsData);
          
          // Also load analyst emails for division filtering
          const emailsData = await DatabaseService.getAnalystEmails();
          setAnalystEmails(emailsData);
        } catch (analystsError) {
          console.warn('⚠️ Could not load analysts data:', analystsError);
          // Keep default hardcoded list as fallback
        }
        
        // Fetch initial quotes via REST API in background (for when market is closed)
        // WebSocket will overwrite with live data when market is open
        // Don't await - let it run in background so UI loads immediately
        // Include ALL tickers (even Old status) for initial quote - but WebSocket only subscribes to active
        if (tickersData && tickersData.length > 0) {
          const allSymbols = tickersData
            .filter(t => t.ticker)
            .map(t => t.ticker.replace(' US', ''));
          
          if (allSymbols.length > 0) {
            // Run in background - don't block UI
            fetchQuotesInBackground(allSymbols);
          }
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
          
          // Fetch quotes in background for localStorage tickers too (including Old status)
          if (localTickers.length > 0) {
            const allSymbols = localTickers
              .filter(t => t.ticker)
              .map(t => t.ticker.replace(' US', ''));
            
            if (allSymbols.length > 0) {
              fetchQuotesInBackground(allSymbols);
            }
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

  // Initialize WebSocket for real-time price streaming
  useEffect(() => {
    if (!isAuthenticated || wsInitializedRef.current) return;
    
    // Handler for price updates from WebSocket
    const handlePriceUpdate = (priceData) => {
      // Find the original symbol (with Bloomberg suffix) from the converted symbol
      setTickers(prev => {
        let hasChanges = false;
        const updated = prev.map(ticker => {
          const tickerSymbol = ticker.ticker.replace(' US', '');
          const convertedSymbol = twelveDataWS.convertBloombergToTwelveData(tickerSymbol);
          
          if (convertedSymbol === priceData.symbol || tickerSymbol === priceData.symbol) {
            // Only update if price actually changed
            if (ticker.currentPrice !== priceData.price) {
              hasChanges = true;
              return {
                ...ticker,
                currentPrice: priceData.price,
                lastQuoteUpdate: new Date().toISOString()
              };
            }
          }
          return ticker;
        });
        // Only return new array if something actually changed
        return hasChanges ? updated : prev;
      });
      
      // Also update quotes state for components that use it
      setQuotes(prev => {
        // Find original symbol
        const originalSymbol = Object.keys(prev).find(key => {
          const converted = twelveDataWS.convertBloombergToTwelveData(key);
          return converted === priceData.symbol;
        }) || priceData.symbol;
        
        return {
          ...prev,
          [originalSymbol]: {
            ...prev[originalSymbol],
            price: priceData.price,
            volume: priceData.dayVolume,
            lastUpdated: new Date().toISOString(),
            source: 'websocket'
          }
        };
      });
      
      setWsLastUpdate(new Date());
    };
    
    // Track last connection status to avoid duplicate state updates
    let lastConnectedStatus = null;
    
    // Handler for connection status changes - only update if status changed
    const handleConnectionChange = (connected) => {
      if (lastConnectedStatus === connected) {
        return; // Skip duplicate status updates
      }
      lastConnectedStatus = connected;
      console.log(`🔌 WebSocket connection status: ${connected ? 'Connected' : 'Disconnected'}`);
      setWsConnected(connected);
      if (!connected) {
        // Reset subscription status when disconnected
        setWsFailedSymbols([]);
        setWsSuccessCount(0);
      }
    };
    
    // Handler for subscription status - accumulate across all chunks
    const handleSubscriptionStatus = (status) => {
      const successCount = status.success?.length || 0;
      const failCount = status.fails?.length || 0;
      
      if (successCount > 0) {
        // Accumulate success count across chunks
        setWsSuccessCount(prev => prev + successCount);
      }
      if (failCount > 0) {
        // Accumulate failed symbols across chunks (avoid duplicates)
        setWsFailedSymbols(prev => {
          const existingSymbols = new Set(prev.map(f => typeof f === 'string' ? f : f?.symbol));
          const newFails = status.fails.filter(f => {
            const sym = typeof f === 'string' ? f : f?.symbol;
            return !existingSymbols.has(sym);
          });
          return [...prev, ...newFails];
        });
      }
    };
    
    // Initialize WebSocket service
    twelveDataWS.init(TWELVE_DATA_API_KEY, handlePriceUpdate, handleConnectionChange, handleSubscriptionStatus);
    twelveDataWS.connect();
    wsInitializedRef.current = true;
    
    // Cleanup on unmount
    return () => {
      twelveDataWS.disconnect();
      wsInitializedRef.current = false;
    };
  }, [isAuthenticated]);

  // Track subscribed symbols to avoid unnecessary resubscription
  const subscribedSymbolsRef = useRef(new Set());
  const lastWsConnectedRef = useRef(false);
  
  // Subscribe to tickers when they change or WebSocket reconnects
  useEffect(() => {
    if (!isAuthenticated || !wsInitializedRef.current || tickers.length === 0) return;
    
    // Check if this is a reconnection (was disconnected, now connected)
    const isReconnect = wsConnected && !lastWsConnectedRef.current;
    lastWsConnectedRef.current = wsConnected;
    
    // If not connected, don't try to subscribe
    if (!wsConnected) return;
    
    // Helper to check if ticker uses FMP (Japan, Hong Kong, Italy, UK, Denmark)
    const isFMPTicker = (ticker) => {
      const upper = ticker?.toUpperCase() || '';
      const fmpSuffixes = [' JP', ' JT', ' HK', ' IM', ' HM', ' TE', ' LN', ' DC'];
      return fmpSuffixes.some(suffix => upper.includes(suffix));
    };
    
    // Get unique symbols to subscribe to (exclude FMP-handled exchanges only)
    // Now that we have a shared backend WebSocket, include all tickers including Old status
    const symbols = tickers
      .filter(t => t.ticker && !isFMPTicker(t.ticker)) // Only exclude FMP exchanges
      .map(t => t.ticker.replace(' US', ''));
    
    // Check if the symbols list has actually changed
    const currentSymbolsSet = new Set(symbols);
    const previousSymbols = subscribedSymbolsRef.current;
    
    // Only update if symbols have changed OR this is a reconnection
    const hasChanged = isReconnect || 
      currentSymbolsSet.size !== previousSymbols.size ||
      symbols.some(s => !previousSymbols.has(s));
    
    if (hasChanged && symbols.length > 0) {
      // Clear previous subscriptions on reconnect
      if (isReconnect) {
        subscribedSymbolsRef.current = new Set();
      }
      console.log(`📊 Subscribing to ${symbols.length} ticker symbols via WebSocket${isReconnect ? ' (reconnect)' : ''}`);
      twelveDataWS.updateSubscriptions(symbols);
      subscribedSymbolsRef.current = currentSymbolsSet;
    }
  }, [isAuthenticated, tickers, wsConnected]);

  // Poll FMP tickers via REST API (Japan, Hong Kong, Italy, UK, Denmark - not supported by TwelveData WebSocket)
  useEffect(() => {
    if (!isAuthenticated || tickers.length === 0) return;
    
    // Helper to check if ticker uses FMP
    const isFMPTicker = (ticker) => {
      const upper = ticker?.toUpperCase() || '';
      const fmpSuffixes = [' JP', ' JT', ' HK', ' IM', ' HM', ' TE', ' LN', ' DC'];
      return fmpSuffixes.some(suffix => upper.includes(suffix));
    };
    
    // Get FMP tickers (Japan, Hong Kong, Italy, UK, Denmark)
    const fmpTickers = tickers.filter(t => t.ticker && t.status !== 'Old' && isFMPTicker(t.ticker));
    
    if (fmpTickers.length === 0) return;
    
    console.log(`🌍 Setting up FMP polling for ${fmpTickers.length} international tickers (JP, HK, IT, UK, DK)`);
    
    // Function to fetch FMP quotes
    const fetchFMPQuotes = async () => {
      console.log(`🌍 Polling ${fmpTickers.length} tickers via FMP...`);
      
      for (const ticker of fmpTickers) {
        try {
          const quote = await QuoteService.getFMPQuote(ticker.ticker);
          if (quote && quote.price) {
            // Update ticker with new price
            setTickers(prev => prev.map(t => {
              if (t.id === ticker.id) {
                return {
                  ...t,
                  currentPrice: quote.price,
                  lastQuoteUpdate: new Date().toISOString()
                };
              }
              return t;
            }));
            
            // Update quotes state
            setQuotes(prev => ({
              ...prev,
              [ticker.ticker]: quote
            }));
          }
        } catch (error) {
          console.warn(`🌍 Failed to fetch FMP quote for ${ticker.ticker}:`, error.message);
        }
        
        // Small delay between requests to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    };
    
    // Fetch immediately
    fetchFMPQuotes();
    
    // Then poll every 60 seconds
    const pollInterval = setInterval(fetchFMPQuotes, 60000);
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [isAuthenticated, tickers.length]); // Only re-run when ticker count changes

  // Handle successful authentication
  const handleAuthSuccess = async (user, session) => {
    console.log('🔑 Authentication successful:', user);
    
    // Refresh user data (non-blocking with timeout) to avoid auth flow stalls
    console.log('🔄 Refreshing user data from database (non-blocking)...');
    const refreshedUser = await Promise.race([
      AuthService.refreshUserData(user),
      new Promise(resolve => setTimeout(() => resolve(user), 1500))
    ]);
    console.log('✅ User data resolved:', refreshedUser);
    
    const role = AuthService.getUserRole(refreshedUser);
    // On direct login handler, also skip DB for division; the INITIAL_SESSION pass will refresh it
    const division = await AuthService.getUserDivision(refreshedUser, true);
    const analystCode = AuthService.getUserAnalystCode(refreshedUser);
    console.log('👤 User role determined:', role);
    console.log('👤 User division:', division);
    console.log('👤 User analyst code:', analystCode);
    console.log('📋 User metadata:', refreshedUser?.user_metadata);
    
    // Temporary fix for existing users without division
    if (!division && (analystCode || role === 'admin' || role === 'readwrite')) {
      console.log('🔧 Applying temporary fix: setting division to Investment for existing user');
      AuthService.addDivisionToUser('Investment').then(() => {
        console.log('✅ Division added to user metadata. Please refresh the page.');
      }).catch(error => {
        console.error('❌ Failed to add division:', error);
      });
    }
    setCurrentUser(refreshedUser);
    setUserRole(role);
    setUserDivision(division);
    setIsAuthenticated(true);
    setAuthError('');
    
    // Set default tab based on division
    if (division === 'Investment' || division === 'Super') {
      setActiveTab('input');
    } else if (division === '') {
      // No division set - might be existing user, default to todos but show message
      console.warn('⚠️ User has no division set. Defaulting to todos tab.');
      setActiveTab('todos');
    } else {
      setActiveTab('todos'); // Ops, Admin, Marketing default to Todo List
    }
    
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
    
    // WebSocket handles real-time quote streaming after login
    // No need for batch quote fetch - WebSocket will connect and subscribe automatically
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

  // Refresh earnings data specifically from database
  const refreshEarningsData = async () => {
    if (!isAuthenticated) return;
    
    try {
      // Refresh earnings data from database
      const earningsDataFromDB = await DatabaseService.getEarningsData();
      setEarningsData(earningsDataFromDB);
      
      // Validate Portfolio status filtering
      const portfolioTickers = tickers.filter(ticker => ticker.status === 'Portfolio');
      const portfolioTickerSymbols = new Set(portfolioTickers.map(t => t.ticker));
      
      // Check if any earnings data exists for non-Portfolio tickers
      const nonPortfolioEarnings = earningsDataFromDB.filter(earning => 
        earning.ticker && !portfolioTickerSymbols.has(earning.ticker)
      );
      
      let message = `✅ Earnings data refreshed successfully (${earningsDataFromDB.length} records)`;
      
      if (nonPortfolioEarnings.length > 0) {
        console.warn('Found earnings data for non-Portfolio tickers:', nonPortfolioEarnings.map(e => e.ticker));
        message += `. ⚠️ Note: ${nonPortfolioEarnings.length} earnings records exist for non-Portfolio tickers`;
      } else {
        message += `. ✅ All earnings data is for Portfolio tickers only`;
      }
      
      console.log(`Portfolio validation: ${portfolioTickers.length} Portfolio tickers, ${earningsDataFromDB.length} earnings records, ${nonPortfolioEarnings.length} non-Portfolio earnings`);
      
      return { success: true, message };
    } catch (error) {
      console.error('Error refreshing earnings data from database:', error);
      return { success: false, message: 'Failed to refresh earnings data' };
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
      
      // Update currentPrice on tickers from batch results
      setTickers(prev => prev.map(t => {
        const original = t.ticker.replace(' US', '');
        const q = newQuotes[original];
        if (q && q.price != null) {
          return { ...t, currentPrice: q.price, lastQuoteUpdate: new Date().toISOString() };
        }
        return t;
      }));

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

  // Fetch quotes in background in small batches, updating UI progressively
  const fetchQuotesInBackground = useCallback(async (symbols) => {
    if (!symbols || symbols.length === 0) return;
    
    console.log(`📊 Starting background quote fetch for ${symbols.length} symbols...`);
    setIsLoadingQuotes(true);
    
    // Process in batches of 20 symbols at a time
    const batchSize = 20;
    let totalSuccess = 0;
    let totalErrors = 0;
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(symbols.length / batchSize);
      
      console.log(`📊 Processing batch ${batchNum}/${totalBatches} (${batch.length} symbols)...`);
      
      try {
        // Fetch this batch
        const batchQuotes = {};
        const batchErrors = {};
        
        // Process batch in parallel (up to 5 at a time to respect rate limits)
        const parallelLimit = 5;
        for (let j = 0; j < batch.length; j += parallelLimit) {
          const parallelBatch = batch.slice(j, j + parallelLimit);
          
          await Promise.all(parallelBatch.map(async (symbol) => {
            try {
              const quote = await QuoteService.getQuote(symbol);
              if (quote && quote.price != null) {
                batchQuotes[symbol] = quote;
              }
            } catch (error) {
              batchErrors[symbol] = error.message;
            }
          }));
          
          // Small delay between parallel batches to respect rate limits
          if (j + parallelLimit < batch.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        // Update UI immediately with this batch's results
        if (Object.keys(batchQuotes).length > 0) {
          setQuotes(prev => ({ ...prev, ...batchQuotes }));
          
          setTickers(prev => prev.map(ticker => {
            const cleanSymbol = ticker.ticker?.replace(' US', '');
            const quoteData = batchQuotes[cleanSymbol];
            if (quoteData && quoteData.price != null) {
              return {
                ...ticker,
                currentPrice: quoteData.price,
                lastQuoteUpdate: new Date().toISOString()
              };
            }
            return ticker;
          }));
        }
        
        totalSuccess += Object.keys(batchQuotes).length;
        totalErrors += Object.keys(batchErrors).length;
        
        console.log(`✅ Batch ${batchNum} complete: ${Object.keys(batchQuotes).length} quotes loaded`);
        
        // Small delay between batches
        if (i + batchSize < symbols.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (error) {
        console.warn(`⚠️ Error in batch ${batchNum}:`, error);
      }
    }
    
    console.log(`✅ Background quote fetch complete: ${totalSuccess} successful, ${totalErrors} errors`);
    setIsLoadingQuotes(false);
  }, []);

  // WebSocket handles real-time quote streaming - no need for polling interval
  // The updateQuotes function is kept for manual refresh fallback only

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

      // Check if ticker already exists
      const existingTicker = tickers.find(t => t.ticker === capitalizedTickerData.ticker);
      if (existingTicker) {
        throw new Error(`Ticker ${capitalizedTickerData.ticker} already exists in the database`);
      }
      
      const stockData = await fetchStockData(capitalizedTickerData.ticker);
      
      // Get the analyst code of the user adding this ticker
      const analystSource = currentUser ? AuthService.getUserAnalystCode(currentUser) : null;
      
      const newTicker = {
        ...capitalizedTickerData,
        dateIn: new Date().toLocaleDateString('en-US', { 
          year: '2-digit', 
          month: '2-digit', 
          day: '2-digit' 
        }),
        pokeDate: new Date().toISOString().split('T')[0],
        name: capitalizedTickerData.name || stockData.name, // Use form data name if available, fallback to API
        inputPrice: stockData.price,
        currentPrice: stockData.price,
        marketCap: stockData.marketCap,
        adv3Month: stockData.adv3Month,
        analystSource: analystSource, // Record who entered this ticker
        created_at: new Date().toISOString()
      };
      
      // Save to Supabase
      const savedTicker = await DatabaseService.addTicker(newTicker);
      
      // Try to fetch and save extra info from AlphaVantage
      try {
        console.log(`🏛️ Fetching extra info for ${capitalizedTickerData.ticker} from AlphaVantage...`);
        const alphaVantageData = await QuoteService.getCompanyOverviewFromAlphaVantage(capitalizedTickerData.ticker);
        
        if (alphaVantageData) {
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
          
          if (alphaVantageData.source === 'AlphaVantage') {
            console.log(`✅ Saved AlphaVantage extra info for ${capitalizedTickerData.ticker}: CIK=${alphaVantageData.cik}, FiscalYearEnd=${alphaVantageData.fiscalYearEnd}`);
          } else {
            console.log(`✅ Saved fallback extra info for international ticker ${capitalizedTickerData.ticker}: ${alphaVantageData.note || 'No CIK available'}`);
          }
        } else {
          console.warn(`⚠️ No extra info data returned for ${capitalizedTickerData.ticker}`);
        }
      } catch (error) {
        console.error(`❌ Failed to fetch/save extra info for ${capitalizedTickerData.ticker}:`, error.message);
        // Don't throw - extra info is not critical for ticker creation
      }
      
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
        pokeDate: new Date().toISOString().split('T')[0],
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
    
    
    const result = earningsData.find(item => item.ticker === ticker && item.cyq === cyq) || {};
    
   
    
    return result;
  };

  // Helper function to determine CYQ from earnings date
  const determineCYQFromDate = (dateString) => {
    if (!dateString) return null;
    
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // getMonth() returns 0-11, we need 1-12
    
    let quarter;
    if (month >= 1 && month <= 3) {
      quarter = 'Q1';
    } else if (month >= 4 && month <= 6) {
      quarter = 'Q2';
    } else if (month >= 7 && month <= 9) {
      quarter = 'Q3';
    } else if (month >= 10 && month <= 12) {
      quarter = 'Q4';
    }
    
    return `${year}${quarter}`;
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
      const batchSize = 200;
      for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);

        // Prepare symbols for batch quote/volume fetch
        const symbols = batch.map(t => t.ticker.replace(' US', ''));
        let batchQuotes = {};
        let batchVolumes = {};
        try {
          const [{ quotes: qmap }, { volumes: vmap }] = await Promise.all([
            QuoteService.getBatchQuotes(symbols),
            QuoteService.getBatchDailyVolumeData(symbols)
          ]);
          batchQuotes = qmap || {};
          batchVolumes = vmap || {};
        } catch (e) {
          console.warn('Batch fetch failed inside refreshMarketData:', e?.message || e);
          batchQuotes = {};
          batchVolumes = {};
        }
        
        await Promise.all(batch.map(async (ticker) => {
          const cleanSymbol = ticker.ticker.replace(' US', '');
          
          try {
            console.log(`🔄 Fetching market data for ${cleanSymbol}...`);
            
            const marketCapData = await QuoteService.getCompanyMarketcap(cleanSymbol).catch(error => {
              console.warn(`Could not fetch market cap for ${cleanSymbol}:`, error.message);
              return null;
            });
            
            const quoteData = batchQuotes[cleanSymbol] || null;
            const volumeData = batchVolumes[cleanSymbol] || null;
            
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
          await new Promise(resolve => setTimeout(resolve, 1200));
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
      const batchSize = 100; // Small batch size to be respectful to the API
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
      // Determine division based on creator's division and current tab for Super users
      let todoDivision;
      if (userDivision === 'Super') {
        // For Super users, use the active todo division tab
        todoDivision = activeTodoDivision;
      } else if (userDivision === 'Ops') {
        todoDivision = 'Ops';
      } else {
        // Investment, Admin, Marketing default to Investment
        todoDivision = 'Investment';
      }
      
      const newTodo = {
        ...todoData,
        division: todoDivision,
        dateEntered: new Date().toISOString(),
        isOpen: todoData.isOpen !== undefined ? todoData.isOpen : true
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

  const refreshTodos = useCallback(async () => {
    try {
      // Determine which division todos to fetch based on user division and active tab
      let divisionToFetch;
      if (userDivision === 'Super') {
        // For Super users, fetch based on active todo division tab
        divisionToFetch = activeTodoDivision;
      } else if (userDivision === 'Ops') {
        divisionToFetch = 'Ops';
      } else {
        // Investment, Admin, Marketing see Investment todos
        divisionToFetch = 'Investment';
      }
      
      const todosData = await DatabaseService.getTodos(divisionToFetch);
      setTodos(todosData);
      
      // Also refresh deleted todos
      const deletedTodosData = await DatabaseService.getDeletedTodos(divisionToFetch);
      setDeletedTodos(deletedTodosData);
    } catch (error) {
      console.error('❌ Error refreshing todos:', error);
      throw error;
    }
  }, [userDivision, activeTodoDivision]);

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
      // Soft delete from Supabase
      await DatabaseService.deleteTodo(id);
      
      // Find the todo being deleted and move it to deletedTodos
      const todoToDelete = todos.find(todo => todo.id === id);
      if (todoToDelete) {
        const deletedTodo = { 
          ...todoToDelete, 
          isDeleted: true, 
          deletedAt: new Date().toISOString() 
        };
        setDeletedTodos(prev => [deletedTodo, ...prev]);
      }
      
      // Update local state - remove from active todos
      setTodos(prev => prev.filter(todo => todo.id !== id));
    } catch (error) {
      console.error('Error deleting todo:', error);
      throw error;
    }
  };

  const restoreTodo = async (id) => {
    try {
      // Restore from Supabase
      const restoredTodo = await DatabaseService.restoreTodo(id);
      
      // Add back to active todos
      setTodos(prev => [restoredTodo, ...prev]);
      
      // Remove from deleted todos
      setDeletedTodos(prev => prev.filter(todo => todo.id !== id));
    } catch (error) {
      console.error('Error restoring todo:', error);
      throw error;
    }
  };

  const permanentlyDeleteTodo = async (id) => {
    try {
      // Permanently delete from Supabase
      await DatabaseService.permanentlyDeleteTodo(id);
      
      // Remove from deleted todos
      setDeletedTodos(prev => prev.filter(todo => todo.id !== id));
    } catch (error) {
      console.error('Error permanently deleting todo:', error);
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

      // Also refresh analyst emails for division filtering
      const emailsData = await DatabaseService.getAnalystEmails();
      setAnalystEmails(emailsData);
    } catch (error) {
      console.error('❌ Error refreshing analysts data:', error);
    }
  };

  // Global auto-refresh every 15 minutes - refreshes all data regardless of active tab
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const AUTO_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes
    
    const autoRefreshAllData = async () => {
      console.log('⏰ Auto-refresh triggered (15 minute interval)...');
      
      try {
        // Refresh tickers and earnings
        const tickersData = await DatabaseService.getTickers();
        console.log('✅ Auto-refreshed tickers:', tickersData.length, 'items');
        setTickers(tickersData);
        
        // Refresh earnings data
        try {
          const earningsDataFromDB = await DatabaseService.getEarningsData();
          setEarningsData(earningsDataFromDB);
        } catch (earningsError) {
          console.warn('⚠️ Could not auto-refresh earnings data:', earningsError);
        }
        
        // Refresh todos
        try {
          // Determine which division todos to fetch based on user division
          let divisionToFetch;
          if (userDivision === 'Super') {
            divisionToFetch = activeTodoDivision;
          } else if (userDivision === 'Ops') {
            divisionToFetch = 'Ops';
          } else {
            divisionToFetch = 'Investment';
          }
          
          const todosData = await DatabaseService.getTodos(divisionToFetch);
          setTodos(todosData);
          
          // Also refresh deleted todos
          const deletedTodosData = await DatabaseService.getDeletedTodos(divisionToFetch);
          setDeletedTodos(deletedTodosData);
        } catch (todosError) {
          console.warn('⚠️ Could not auto-refresh todos:', todosError);
        }
        
        // Refresh analysts
        try {
          const analystsData = await DatabaseService.getAnalysts();
          setAnalysts(analystsData);
          const emailsData = await DatabaseService.getAnalystEmails();
          setAnalystEmails(emailsData);
        } catch (analystsError) {
          console.warn('⚠️ Could not auto-refresh analysts:', analystsError);
        }
        
        console.log('✅ Auto-refresh completed successfully');
        
      } catch (error) {
        console.error('❌ Error during auto-refresh:', error);
      }
    };
    
    const interval = setInterval(autoRefreshAllData, AUTO_REFRESH_INTERVAL);
    
    return () => clearInterval(interval);
  }, [isAuthenticated, userDivision, activeTodoDivision]);

  // Backfill tickers_extra_info for existing tickers that don't have entries
  const backfillTickersExtraInfo = async () => {
    // Check authentication using AuthService directly since this might be called from console
    const currentSession = await AuthService.getCurrentSession();
    if (!currentSession) {
      console.error('Must be authenticated to backfill ticker extra info');
      return;
    }

    console.log('🔄 Starting backfill of tickers_extra_info...');
    
    try {
      // Get all tickers
      const allTickers = await DatabaseService.getTickers();
      console.log(`📊 Found ${allTickers.length} total tickers`);

      // Check which tickers already have extra info
      const tickersNeedingExtraInfo = [];
      
      for (const ticker of allTickers) {
        try {
          const existingExtraInfo = await DatabaseService.getTickerExtraInfo(ticker.id);
          if (!existingExtraInfo) {
            tickersNeedingExtraInfo.push(ticker);
          }
        } catch (error) {
          // If error getting extra info, assume it doesn't exist
          tickersNeedingExtraInfo.push(ticker);
        }
      }

      console.log(`🎯 Found ${tickersNeedingExtraInfo.length} tickers needing extra info:`);
      tickersNeedingExtraInfo.forEach(ticker => console.log(`   - ${ticker.ticker}`));

      if (tickersNeedingExtraInfo.length === 0) {
        console.log('✅ All tickers already have extra info - no backfill needed');
        return { processed: 0, successful: 0, failed: 0 };
      }

      // Process tickers with rate limiting (AlphaVantage has limits)
      let successful = 0;
      let failed = 0;
      const errors = {};
      const delayBetweenCalls = 1000; // 1 second delay between API calls

      for (let i = 0; i < tickersNeedingExtraInfo.length; i++) {
        const ticker = tickersNeedingExtraInfo[i];
        console.log(`🏛️ Processing ${i + 1}/${tickersNeedingExtraInfo.length}: ${ticker.ticker}`);

        try {
          // Fetch company overview from AlphaVantage
          const alphaVantageData = await QuoteService.getCompanyOverviewFromAlphaVantage(ticker.ticker);
          
          if (alphaVantageData) {
            const extraInfo = {
              tickerId: ticker.id,
              ticker: ticker.ticker,
              cik: alphaVantageData.cik,
              fiscalYearEnd: alphaVantageData.fiscalYearEnd,
              cyq1Date: alphaVantageData.cyq1Date,
              cyq2Date: alphaVantageData.cyq2Date,
              cyq3Date: alphaVantageData.cyq3Date,
              cyq4Date: alphaVantageData.cyq4Date
            };
            
            await DatabaseService.addTickerExtraInfo(extraInfo);
            successful++;
            
            if (alphaVantageData.source === 'AlphaVantage') {
              console.log(`✅ ${ticker.ticker}: CIK=${alphaVantageData.cik}, FiscalYearEnd=${alphaVantageData.fiscalYearEnd}`);
            } else {
              console.log(`✅ ${ticker.ticker}: Fallback data (${alphaVantageData.source}) - ${alphaVantageData.note || 'International ticker'}`);
            }
          } else {
            console.warn(`⚠️ ${ticker.ticker}: No data returned from AlphaVantage`);
            failed++;
            errors[ticker.ticker] = 'No data returned from AlphaVantage';
          }
        } catch (error) {
          console.error(`❌ ${ticker.ticker}: ${error.message}`);
          failed++;
          errors[ticker.ticker] = error.message;
        }

        // Rate limiting: wait between API calls (except for the last one)
        if (i < tickersNeedingExtraInfo.length - 1) {
          console.log(`⏳ Waiting ${delayBetweenCalls}ms before next API call...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
        }
      }

      const results = {
        processed: tickersNeedingExtraInfo.length,
        successful: successful,
        failed: failed,
        errors: errors
      };

      console.log(`🎉 Backfill complete!`);
      console.log(`📊 Results: ${successful} successful, ${failed} failed out of ${tickersNeedingExtraInfo.length} processed`);
      
      if (failed > 0) {
        console.log('❌ Failed tickers:');
        Object.entries(errors).forEach(([ticker, error]) => {
          console.log(`   - ${ticker}: ${error}`);
        });
      }

      return results;

    } catch (error) {
      console.error('💥 Error during backfill process:', error);
      throw error;
    }
  };

  // Make backfill function available globally for manual console access
  React.useEffect(() => {
    window.backfillTickersExtraInfo = backfillTickersExtraInfo;
    return () => {
      delete window.backfillTickersExtraInfo;
    };
  }, [backfillTickersExtraInfo]);

  const handleTabSwitch = async (tab) => {
    setPreviousTab(activeTab);
    setActiveTab(tab);
    
    // If manually navigating to idea-detail tab, set navigation source to dropdown
    if (tab === 'idea-detail') {
      setNavigationSource('dropdown');
    }
    
    // Set default analyst filter based on the tab and current user
    if (tab === 'todos') {
      try {
        const userAnalystCode = await DatabaseService.getCurrentUserAnalystCode();
        // Check if user's analyst code exists in the dropdown, otherwise default to "All Analysts"
        if (userAnalystCode && analysts.includes(userAnalystCode)) {
          setSelectedTodoAnalyst(userAnalystCode);
        } else {
          setSelectedTodoAnalyst(''); // "All Analysts"
        }
      } catch (error) {
        console.error('Error getting user analyst code:', error);
        setSelectedTodoAnalyst(''); // Default to "All Analysts" on error
      }
    } else {
      setSelectedTodoAnalyst(null);
    }
    
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
        case 'input':
          // Refresh analysts to ensure dropdown has latest analyst codes
          await refreshAnalysts();
          break;
        case 'todos':
          // Only refresh analysts, let TodoList component handle its own refresh
          await refreshAnalysts();
          break;
        case 'analysts':
          await refreshAnalysts();
          break;
        case 'settings':
          await refreshAnalysts();
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

  // Navigate to idea detail while remembering previous tab (from hyperlinks)
  const navigateToIdeaDetail = (ticker) => {
    setPreviousTab(activeTab);
    setNavigationSource('hyperlink');
    setSelectedTickerForDetail(ticker);
    setActiveTab('idea-detail');
  };

  // Navigate to idea detail from dropdown (internal navigation)
  const navigateToIdeaDetailFromDropdown = (ticker) => {
    // Don't change previousTab - we're staying on idea-detail tab
    setNavigationSource('dropdown');
    setSelectedTickerForDetail(ticker);
    // Already on idea-detail tab, no need to change activeTab
  };

  // Helper function to get Investment/Super analysts only
  const getInvestmentSuperAnalysts = useCallback(() => {
    if (!analystEmails || analystEmails.length === 0) {
      return analysts; // Fallback to basic analyst codes
    }
    
    // Check if analyst emails have division data
    const firstEmail = analystEmails[0];
    if (!firstEmail.hasOwnProperty('division')) {
      return analysts;
    }
    
    // Filter to include only Investment and Super divisions
    const filtered = analystEmails
      .filter(email => ['Investment', 'Super'].includes(email.division))
      .map(email => email.analyst_code)
      .filter(code => code && code.trim() !== ''); // Filter out empty codes
    
    // If no filtered results, fall back to all analysts
    if (filtered.length === 0) {
      return analysts;
    }
    
    return filtered;
  }, [analystEmails, analysts]);

  // Navigate back based on how user got to idea detail
  const navigateBack = () => {
    if (navigationSource === 'hyperlink') {
      // User came from another tab via hyperlink - go back to that tab
      setSelectedTickerForDetail(null);
      setActiveTab(previousTab);
    } else {
      // User came from dropdown - go back to dropdown selection
      setSelectedTickerForDetail(null);
      // Stay on idea-detail tab to show dropdown
    }
  };

  // Navigate to Input Page with pre-filled ticker and analyst data
  const navigateToInputWithData = (ticker, analyst) => {
    setPreviousTab(activeTab);
    setPrefilledFormData({
      ticker: ticker || '',
      analyst: analyst || ''
    });
    setActiveTab('input');
  };

  // Show loading while checking auth state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center">
        <div className="flex justify-center mb-4">
          <img 
            src="/clearline-logo.jpg" 
            alt="ClearLine Logo" 
            className="h-12 w-auto"
          />
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
              <img 
                src="/clearline-logo.jpg" 
                alt="ClearLine Logo" 
                className="h-8 w-auto mr-3"
              />
              <h1 className="text-2xl font-bold text-gray-900">Clearline Flow</h1>
              {isTabSwitching && (
                <div className="ml-4 text-sm text-blue-600 animate-pulse">
                  Refreshing data...
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4">
              {/* WebSocket Connection Status */}
              <div className="flex items-center space-x-1" title={wsConnected ? 'Real-time quotes connected' : 'Real-time quotes disconnected'}>
                {wsConnected ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-gray-400" />
                )}
                <span className={`text-xs ${wsConnected ? 'text-green-600' : 'text-gray-400'}`}>
                  {wsConnected ? 'Live' : 'Offline'}
                </span>
              </div>
              
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

      {/* WebSocket Failed Symbols Banner */}
      {wsFailedSymbols.length > 0 && (
        <div className="bg-orange-50 border-l-4 border-orange-400 p-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-orange-700">
                  <strong>WebSocket Issues:</strong> {wsFailedSymbols.length} symbol(s) failed to subscribe
                  {wsSuccessCount > 0 && <span className="ml-2 text-green-600">({wsSuccessCount} subscribed)</span>}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-orange-600">Show failed symbols</summary>
                  <div className="mt-1 text-xs text-orange-600 max-h-32 overflow-y-auto">
                    {wsFailedSymbols.map((item, idx) => {
                      // Format as symbol:exchange
                      let symbolText;
                      if (typeof item === 'string') {
                        symbolText = item;
                      } else if (item?.symbol && item?.exchange) {
                        symbolText = `${item.symbol}:${item.exchange}`;
                      } else if (item?.symbol) {
                        symbolText = item.symbol;
                      } else {
                        symbolText = JSON.stringify(item);
                      }
                      return (
                        <span key={idx} className="inline-block mr-2 mb-1 bg-orange-100 px-1 rounded">{symbolText}</span>
                      );
                    })}
                  </div>
                </details>
                <button 
                  onClick={() => setWsFailedSymbols([])} 
                  className="mt-2 text-xs text-orange-600 hover:text-orange-800 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {/* Show all tabs for Investment/Super division or users without division (backward compatibility) */}
            {(userDivision === 'Investment' || userDivision === 'Super' || userDivision === '') && (
              <>
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
                  onClick={() => handleTabSwitch('idea-screening')}
                  disabled={isTabSwitching}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'idea-screening'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  } ${isTabSwitching ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <CheckSquare className="inline h-4 w-4 mr-1" />
                  Idea Screening
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
                  onClick={() => handleTabSwitch('idea-detail')}
                  disabled={isTabSwitching}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'idea-detail'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  } ${isTabSwitching ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <FileText className="inline h-4 w-4 mr-1" />
                  Idea Detail
                </button>
              </>
            )}
            
            {/* Update Portfolio tab for Super and Ops divisions */}
            {(userDivision === 'Super' || userDivision === 'Ops') && (
              <button
                onClick={() => handleTabSwitch('update-portfolio')}
                disabled={isTabSwitching}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'update-portfolio'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                } ${isTabSwitching ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <Upload className="inline h-4 w-4 mr-1" />
                Update Portfolio
              </button>
            )}
            
            {/* Always show Todo List tab for all divisions */}
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
        {activeTab === 'input' && (userDivision === 'Investment' || userDivision === 'Super' || userDivision === '') && (userRole === 'readwrite' || userRole === 'admin') && (
          <InputPage 
            onAddTicker={addTicker} 
            analysts={analysts} 
            currentUser={currentUser} 
            prefilledData={prefilledFormData}
            onPrefilledDataUsed={() => setPrefilledFormData(null)}
          />
        )}
        {activeTab === 'input' && (userDivision === 'Investment' || userDivision === 'Super' || userDivision === '') && userRole === 'readonly' && (
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <div className="px-4 py-6 sm:px-0">
              <div className="text-center">
                <div className="text-gray-500 text-lg">Input functionality requires Read/Write access</div>
                <div className="text-gray-400 text-sm mt-2">Contact your administrator for access</div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'input' && userDivision !== 'Investment' && userDivision !== 'Super' && userDivision !== '' && (
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <div className="px-4 py-6 sm:px-0">
              <div className="text-center">
                <div className="text-gray-500 text-lg">Access Restricted</div>
                <div className="text-gray-400 text-sm mt-2">This feature is only available to Investment and Super division users</div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'database' && (userDivision === 'Investment' || userDivision === 'Super' || userDivision === '') && (
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
            onNavigateToIdeaDetail={navigateToIdeaDetail}
          />
        )}
        {activeTab === 'database-detailed' && (userDivision === 'Investment' || userDivision === 'Super' || userDivision === '') && (
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
            onNavigateToIdeaDetail={navigateToIdeaDetail}
          />
        )}
        {activeTab === 'idea-screening' && (userDivision === 'Investment' || userDivision === 'Super' || userDivision === '') && (
          <IdeaScreeningPage 
            tickers={tickers}
            quotes={quotes}
            onNavigateToIdeaDetail={navigateToIdeaDetail}
          />
        )}
        {activeTab === 'pm-detail' && (userDivision === 'Investment' || userDivision === 'Super' || userDivision === '') && (
          <PMDetailPage 
            tickers={tickers}
            quotes={quotes}
            onUpdateQuote={updateSingleQuote}
            isLoadingQuotes={isLoadingQuotes}
            quoteErrors={quoteErrors}
            onNavigateToIdeaDetail={navigateToIdeaDetail}
          />
        )}
        {activeTab === 'analyst-detail' && (userDivision === 'Investment' || userDivision === 'Super' || userDivision === '') && (
          <AnalystDetailPage 
            tickers={tickers} 
            analysts={getInvestmentSuperAnalysts()}
            selectedAnalyst={selectedAnalyst}
            onSelectAnalyst={setSelectedAnalyst}
            quotes={quotes}
            onUpdateQuote={updateSingleQuote}
            isLoadingQuotes={isLoadingQuotes}
            quoteErrors={quoteErrors}
            onNavigateToIdeaDetail={navigateToIdeaDetail}
          />
        )}
        {activeTab === 'team' && (userDivision === 'Investment' || userDivision === 'Super' || userDivision === '') && (
          <TeamOutputPage 
            tickers={tickers} 
            analysts={getInvestmentSuperAnalysts()}
            onNavigateToIdeaDetail={navigateToIdeaDetail}
          />
        )}
        {activeTab === 'earnings' && (userDivision === 'Investment' || userDivision === 'Super' || userDivision === '') && (
          <EarningsTrackingPage 
            tickers={tickers}
            selectedEarningsAnalyst={selectedEarningsAnalyst}
            onSelectEarningsAnalyst={setSelectedEarningsAnalyst}
            earningsData={earningsData}
            onUpdateEarnings={updateEarningsData}
            onUpdateTicker={updateTicker}
            getEarningsData={getEarningsData}
            onRefreshEarningsData={refreshEarningsData}
            analysts={getInvestmentSuperAnalysts()}
            quotes={quotes}
            onUpdateQuote={updateSingleQuote}
            isLoadingQuotes={isLoadingQuotes}
            quoteErrors={quoteErrors}
            formatTradeLevel={formatTradeLevel}
            formatCompactDate={formatCompactDate}
            currentUser={currentUser}
            onNavigateToIdeaDetail={navigateToIdeaDetail}
          />
        )}
        {activeTab === 'update-portfolio' && (userDivision === 'Super' || userDivision === 'Ops') && (
          <UpdatePortfolioPage 
            tickers={tickers}
            onUpdateTickers={setTickers}
            currentUser={currentUser}
            userRole={userRole}
          />
        )}
        {activeTab === 'todos' && (
          <TodoListPage 
            todos={todos}
            deletedTodos={deletedTodos}
            selectedTodoAnalyst={selectedTodoAnalyst}
            onSelectTodoAnalyst={setSelectedTodoAnalyst}
            onAddTodo={addTodo}
            onUpdateTodo={updateTodo}
            onDeleteTodo={deleteTodo}
            onRestoreTodo={restoreTodo}
            onPermanentlyDeleteTodo={permanentlyDeleteTodo}
            analysts={analysts}
            userRole={userRole}
            onRefreshTodos={refreshTodos}
            currentUser={currentUser}
            tickers={tickers}
            onNavigateToIdeaDetail={navigateToIdeaDetail}
            onNavigateToInputWithData={navigateToInputWithData}
            userDivision={userDivision}
            activeTodoDivision={activeTodoDivision}
            onSetActiveTodoDivision={setActiveTodoDivision}
          />
        )}
        {activeTab === 'idea-detail' && (userDivision === 'Investment' || userDivision === 'Super' || userDivision === '') && (
          <IdeaDetailPage 
            tickers={tickers}
            selectedTicker={selectedTickerForDetail}
            onSelectTicker={navigateToIdeaDetailFromDropdown}
            onUpdateSelectedTicker={setSelectedTickerForDetail}
            onUpdate={(userRole === 'readwrite' || userRole === 'admin') ? updateTicker : null}
            analysts={analysts}
            quotes={quotes}
            onUpdateQuote={updateSingleQuote}
            isLoadingQuotes={isLoadingQuotes}
            quoteErrors={quoteErrors}
            formatMarketCap={formatMarketCap}
            formatVolumeDollars={formatVolumeDollars}
            currentUser={currentUser}
            onNavigateBack={navigateBack}
          />
        )}
      </main>
    </div>
  );
};
  
// Input Page Component
const InputPage = ({ onAddTicker, analysts, currentUser, prefilledData, onPrefilledDataUsed }) => {
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
    // Catalysts
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
    selfHelp: false,
    productCycle: false,
    regulation: false,
    // Characteristics
    fraudRisk: false,
    regulatoryRisk: false,
    cyclical: false,
    nonCyclical: false,
    highBeta: false,
    momo: false,
    rateExposure: false,
    strongDollar: false,
    extremeValuation: false,
    crapco: false,
    // Theme
    aiWinner: false,
    aiLoser: false,
    tariffWinner: false,
    tariffLoser: false,
    trumpWinner: false,
    trumpLoser: false
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

  // Handle pre-filled data from navigation (e.g., from Todo list "Add" button)
  useEffect(() => {
    if (prefilledData) {
      setFormData(prev => ({
        ...prev,
        ticker: prefilledData.ticker || prev.ticker,
        analyst: prefilledData.analyst || prev.analyst
      }));
      
      // Trigger company lookup if ticker is provided
      if (prefilledData.ticker) {
        lookupCompanyName(prefilledData.ticker);
      }
      
      // Clear the pre-filled data
      if (onPrefilledDataUsed) {
        onPrefilledDataUsed();
      }
    }
  }, [prefilledData, onPrefilledDataUsed]);

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
        extremeValuation: false,
        crapco: false,
        aiWinner: false,
        aiLoser: false,
        tariffWinner: false,
        tariffLoser: false,
        trumpWinner: false,
        trumpLoser: false
      };
      
      setFormData(resetData);
      
      setTimeout(() => {
        setSubmitMessage('');
      }, 3000);
      
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      if (error.message.includes('already exists')) {
        setSubmitMessage(`Error: ${error.message}. Please use a different ticker symbol.`);
      } else {
        setSubmitMessage('Error adding investment idea: ' + error.message);
      }
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
              <h5 className="text-lg font-semibold text-gray-800 mb-4">Investment Characteristics</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Catalysts */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h6 className="text-base font-semibold text-blue-800 mb-3 border-b border-blue-300 pb-2">Catalysts</h6>
                  <div className="grid grid-cols-1 gap-3">
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
                      { key: 'selfHelp', label: 'Self-Help' },
                      { key: 'productCycle', label: 'Product Cycle' },
                      { key: 'regulation', label: 'Regulation' }
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

                                 {/* Characteristics */}
                 <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                   <h6 className="text-base font-semibold text-green-800 mb-3 border-b border-green-300 pb-2">Characteristics</h6>
                   <div className="grid grid-cols-1 gap-3">
                    {[
                      { key: 'fraudRisk', label: 'Fraud Risk' },
                      { key: 'regulatoryRisk', label: 'Regulatory Risk' },
                      { key: 'cyclical', label: 'Cyclical' },
                      { key: 'nonCyclical', label: 'Non-Cyclical' },
                      { key: 'highBeta', label: 'High Beta' },
                      { key: 'momo', label: 'Momentum' },
                      { key: 'rateExposure', label: 'Rate Exposure' },
                      { key: 'strongDollar', label: 'Strong Dollar Beneficiary' },
                      { key: 'extremeValuation', label: 'Extreme Valuation' },
                      { key: 'crapco', label: 'Crapco' }
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

                                 {/* Theme */}
                 <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                   <h6 className="text-base font-semibold text-purple-800 mb-3 border-b border-purple-300 pb-2">Theme</h6>
                   <div className="grid grid-cols-1 gap-3">
                    {[
                      { key: 'aiWinner', label: 'AI Winner' },
                      { key: 'aiLoser', label: 'AI Loser' },
                      { key: 'tariffWinner', label: 'Tariff Winner' },
                      { key: 'tariffLoser', label: 'Tariff Loser' },
                      { key: 'trumpWinner', label: 'Trump Winner' },
                      { key: 'trumpLoser', label: 'Trump Loser' }
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
      </div>
    </div>
  );
};

// Enhanced Database Page Component with quotes
const DatabasePage = ({ tickers, onSort, sortField, sortDirection, onUpdate, analysts, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors, onRefreshMarketData, isRefreshingMarketData, onRefreshData, isRefreshingData, onRefreshCompanyNames, isRefreshingCompanyNames, formatMarketCap, formatVolumeDollars, onNavigateToIdeaDetail }) => {
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
                  onNavigateToIdeaDetail={onNavigateToIdeaDetail}
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
const EnhancedTickerRow = ({ ticker, onUpdate, analysts, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors, formatMarketCap, formatVolumeDollars, onNavigateToIdeaDetail }) => {
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
          {ticker.inputPrice ? formatPriceWithCurrency(ticker.inputPrice, ticker.ticker) : '-'}
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
        {onNavigateToIdeaDetail ? (
          <button
            onClick={() => onNavigateToIdeaDetail(ticker)}
            className="text-blue-600 hover:text-blue-800 underline hover:no-underline font-medium"
            title="Click to view in Idea Detail"
          >
            {ticker.ticker}
          </button>
        ) : (
          <span>{ticker.ticker}</span>
        )}
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
        {ticker.inputPrice ? formatPriceWithCurrency(ticker.inputPrice, ticker.ticker) : '-'}
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
const DatabaseDetailedPage = ({ tickers, onSort, sortField, sortDirection, onUpdate, analysts, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors, onRefreshMarketData, isRefreshingMarketData, onRefreshData, isRefreshingData, formatMarketCap, formatVolumeDollars, onNavigateToIdeaDetail }) => {
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
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '240px', minWidth: '240px' }}>
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
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Self-Help</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Cycle</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Regulation</th>
                
                {/* Risk Factors */}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fraud Risk</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Regulatory Risk</th>
                
                {/* Market Characteristics */}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cyclical</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Non-Cyclical</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">High Beta</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Momentum</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate Exposure</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Strong Dollar</th>
                                 <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Extreme Val</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Crapco</th>
                 
                 {/* Theme */}
                 <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AI Winner</th>
                 <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AI Loser</th>
                 <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tariff Winner</th>
                 <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tariff Loser</th>
                 <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trump Winner</th>
                 <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trump Loser</th>
                 
                 {/* Thesis */}
                 <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '450px', minWidth: '450px' }}>Thesis</th>
                
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
                  onNavigateToIdeaDetail={onNavigateToIdeaDetail}
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
const DetailedTickerRow = ({ ticker, onUpdate, analysts, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors, formatMarketCap, formatVolumeDollars, onNavigateToIdeaDetail }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(ticker);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

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

  const handleDoubleClick = (field, currentValue) => {
    if (!onUpdate) return; // Only allow editing if onUpdate is provided
    
    // Handle boolean fields - toggle directly
    if (typeof currentValue === 'boolean') {
      handleToggleBoolean(field, currentValue);
      return;
    }
    
    setEditingField(field);
    setEditValue(currentValue);
  };

  const handleToggleBoolean = async (field, currentValue) => {
    try {
      await onUpdate(ticker.id, { [field]: !currentValue });
    } catch (error) {
      console.error('Error toggling boolean field:', error);
    }
  };

  const handleSaveEdit = async () => {
    if (editingField && editValue !== ticker[editingField]) {
      try {
        await onUpdate(ticker.id, { [editingField]: editValue });
      } catch (error) {
        console.error('Error updating ticker:', error);
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

  const formatBoolean = (value) => value ? '✓' : '☐';
  
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
        <td className="px-3 py-4" style={{ width: '240px', maxWidth: '240px' }}>
          <input
            type="text"
            value={editData.source || ''}
            onChange={(e) => setEditData({...editData, source: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-60"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
          {ticker.inputPrice ? formatPriceWithCurrency(ticker.inputPrice, ticker.ticker) : '-'}
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
          <select
            value={editData.valueOrGrowth || ''}
            onChange={(e) => setEditData({...editData, valueOrGrowth: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-20"
          >
            <option value="">-</option>
            <option value="Value">Value</option>
            <option value="Growth">Growth</option>
          </select>
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

        {/* Self-Help */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.selfHelp || false}
            onChange={(e) => setEditData({...editData, selfHelp: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Product Cycle */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.productCycle || false}
            onChange={(e) => setEditData({...editData, productCycle: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Regulation */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.regulation || false}
            onChange={(e) => setEditData({...editData, regulation: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Fraud Risk */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.fraudRisk || false}
            onChange={(e) => setEditData({...editData, fraudRisk: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Regulatory Risk */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.regulatoryRisk || false}
            onChange={(e) => setEditData({...editData, regulatoryRisk: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Cyclical */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.cyclical || false}
            onChange={(e) => setEditData({...editData, cyclical: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Non-Cyclical */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.nonCyclical || false}
            onChange={(e) => setEditData({...editData, nonCyclical: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* High Beta */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.highBeta || false}
            onChange={(e) => setEditData({...editData, highBeta: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Momentum */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.momo || false}
            onChange={(e) => setEditData({...editData, momo: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Rate Exposure */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.rateExposure || false}
            onChange={(e) => setEditData({...editData, rateExposure: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Strong Dollar */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.strongDollar || false}
            onChange={(e) => setEditData({...editData, strongDollar: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Extreme Valuation */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.extremeValuation || false}
            onChange={(e) => setEditData({...editData, extremeValuation: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Crapco */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.crapco || false}
            onChange={(e) => setEditData({...editData, crapco: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* AI Winner */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.aiWinner || false}
            onChange={(e) => setEditData({...editData, aiWinner: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* AI Loser */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.aiLoser || false}
            onChange={(e) => setEditData({...editData, aiLoser: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Tariff Winner */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.tariffWinner || false}
            onChange={(e) => setEditData({...editData, tariffWinner: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Tariff Loser */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.tariffLoser || false}
            onChange={(e) => setEditData({...editData, tariffLoser: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Trump Winner */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.trumpWinner || false}
            onChange={(e) => setEditData({...editData, trumpWinner: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        {/* Trump Loser */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.trumpLoser || false}
            onChange={(e) => setEditData({...editData, trumpLoser: e.target.checked})}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap" style={{ width: '450px', minWidth: '450px', maxWidth: '450px' }}>
          <textarea
            value={editData.thesis || ''}
            onChange={(e) => setEditData({...editData, thesis: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-full h-20"
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
        {onNavigateToIdeaDetail ? (
          <button
            onClick={() => onNavigateToIdeaDetail(ticker)}
            className="text-blue-600 hover:text-blue-800 underline hover:no-underline font-medium"
            title="Click to view in Idea Detail"
          >
            {ticker.ticker}
          </button>
        ) : (
          <span>{ticker.ticker}</span>
        )}
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
        {editingField === 'lsPosition' ? (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyPress}
            autoFocus
            className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Long">Long</option>
            <option value="Short">Short</option>
          </select>
        ) : (
          <span 
            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full cursor-pointer ${onUpdate ? 'hover:ring-2 hover:ring-blue-300' : ''} ${
              ticker.lsPosition === 'Long' 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}
            title={onUpdate ? 'Double-click to edit' : ''}
            onDoubleClick={() => handleDoubleClick('lsPosition', ticker.lsPosition || 'Long')}
          >
            {ticker.lsPosition}
          </span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap w-12">
        {editingField === 'priority' ? (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyPress}
            autoFocus
            className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="F">F</option>
          </select>
        ) : (
          <span 
            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full cursor-pointer ${onUpdate ? 'hover:ring-2 hover:ring-blue-300' : ''} ${
              ticker.priority === 'A' ? 'bg-red-100 text-red-800' :
              ticker.priority === 'B' ? 'bg-yellow-100 text-yellow-800' :
              ticker.priority === 'C' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800'
            }`}
            title={onUpdate ? 'Double-click to edit' : ''}
            onDoubleClick={() => handleDoubleClick('priority', ticker.priority || 'A')}
          >
            {ticker.priority}
          </span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {editingField === 'status' ? (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyPress}
            autoFocus
            className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="New">New</option>
            <option value="Portfolio">Portfolio</option>
            <option value="Current">Current</option>
            <option value="On-Deck">On-Deck</option>
            <option value="Old">Old</option>
          </select>
        ) : (
          <span 
            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full cursor-pointer ${onUpdate ? 'hover:ring-2 hover:ring-blue-300' : ''} ${
              ticker.status === 'Portfolio' ? 'bg-green-100 text-green-800' :
              ticker.status === 'Current' ? 'bg-blue-100 text-blue-800' :
              ticker.status === 'New' ? 'bg-purple-100 text-purple-800' :
              ticker.status === 'On-Deck' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}
            title={onUpdate ? 'Double-click to edit' : ''}
            onDoubleClick={() => handleDoubleClick('status', ticker.status || 'New')}
          >
            {ticker.status}
          </span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {editingField === 'analyst' ? (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyPress}
            autoFocus
            className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-</option>
            {analysts.map(analyst => (
              <option key={analyst} value={analyst}>{analyst}</option>
            ))}
          </select>
        ) : (
          <div 
            className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
            title={onUpdate ? 'Double-click to edit' : ''}
            onDoubleClick={() => handleDoubleClick('analyst', ticker.analyst || '')}
          >
            {ticker.analyst}
          </div>
        )}
      </td>
      <td className="px-6 py-4 text-sm text-gray-500 truncate" style={{ width: '240px', minWidth: '240px', maxWidth: '240px' }}>
        {editingField === 'source' ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyPress}
            autoFocus
            className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <div 
            className={`cursor-pointer hover:bg-gray-50 p-1 rounded truncate ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
            title={onUpdate ? `${ticker.source || '-'} (Double-click to edit)` : ticker.source || ''}
            onDoubleClick={() => handleDoubleClick('source', ticker.source || '')}
          >
            {ticker.source || '-'}
          </div>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
        {ticker.inputPrice ? formatPriceWithCurrency(ticker.inputPrice, ticker.ticker) : '-'}
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
        {editingField === 'ptBear' ? (
          <input
            type="number"
            step="0.01"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyPress}
            autoFocus
            className="w-16 border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <div 
            className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
            title={onUpdate ? 'Double-click to edit' : ''}
            onDoubleClick={() => handleDoubleClick('ptBear', ticker.ptBear || '')}
          >
            {ticker.ptBear ? formatPriceTarget(ticker.ptBear) : '-'}
          </div>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {editingField === 'ptBase' ? (
          <input
            type="number"
            step="0.01"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyPress}
            autoFocus
            className="w-16 border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <div 
            className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
            title={onUpdate ? 'Double-click to edit' : ''}
            onDoubleClick={() => handleDoubleClick('ptBase', ticker.ptBase || '')}
          >
            {ticker.ptBase ? formatPriceTarget(ticker.ptBase) : '-'}
          </div>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {editingField === 'ptBull' ? (
          <input
            type="number"
            step="0.01"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyPress}
            autoFocus
            className="w-16 border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <div 
            className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
            title={onUpdate ? 'Double-click to edit' : ''}
            onDoubleClick={() => handleDoubleClick('ptBull', ticker.ptBull || '')}
          >
            {ticker.ptBull ? formatPriceTarget(ticker.ptBull) : '-'}
          </div>
        )}
      </td>
      {/* Additional Info */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {editingField === 'catalystDate' ? (
          <input
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyPress}
            autoFocus
            className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <div 
            className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
            title={onUpdate ? 'Double-click to edit' : ''}
            onDoubleClick={() => handleDoubleClick('catalystDate', ticker.catalystDate || '')}
          >
            {formatDate(ticker.catalystDate)}
          </div>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {editingField === 'valueOrGrowth' ? (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyPress}
            autoFocus
            className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-</option>
            <option value="Value">Value</option>
            <option value="Growth">Growth</option>
          </select>
        ) : (
          <div 
            className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
            title={onUpdate ? 'Double-click to edit' : ''}
            onDoubleClick={() => handleDoubleClick('valueOrGrowth', ticker.valueOrGrowth || '')}
          >
            {ticker.valueOrGrowth || '-'}
          </div>
        )}
      </td>
      {/* M&A Characteristics */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('maTargetBuyer', ticker.maTargetBuyer)}
        >
          {formatBoolean(ticker.maTargetBuyer)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('maTargetValuation', ticker.maTargetValuation)}
        >
          {formatBoolean(ticker.maTargetValuation)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('maTargetSeller', ticker.maTargetSeller)}
        >
          {formatBoolean(ticker.maTargetSeller)}
        </div>
      </td>
      {/* Other Investment Characteristics */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('bigMoveRevert', ticker.bigMoveRevert)}
        >
          {formatBoolean(ticker.bigMoveRevert)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('activist', ticker.activist)}
        >
          {formatBoolean(ticker.activist)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('activistPotential', ticker.activistPotential)}
        >
          {formatBoolean(ticker.activistPotential)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('insiderTradeSignal', ticker.insiderTradeSignal)}
        >
          {formatBoolean(ticker.insiderTradeSignal)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('newMgmt', ticker.newMgmt)}
        >
          {formatBoolean(ticker.newMgmt)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('spin', ticker.spin)}
        >
          {formatBoolean(ticker.spin)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('bigAcq', ticker.bigAcq)}
        >
          {formatBoolean(ticker.bigAcq)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('selfHelp', ticker.selfHelp)}
        >
          {formatBoolean(ticker.selfHelp)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('productCycle', ticker.productCycle)}
        >
          {formatBoolean(ticker.productCycle)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('regulation', ticker.regulation)}
        >
          {formatBoolean(ticker.regulation)}
        </div>
      </td>
      {/* Risk Factors */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('fraudRisk', ticker.fraudRisk)}
        >
          {formatBoolean(ticker.fraudRisk)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('regulatoryRisk', ticker.regulatoryRisk)}
        >
          {formatBoolean(ticker.regulatoryRisk)}
        </div>
      </td>
      {/* Market Characteristics */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('cyclical', ticker.cyclical)}
        >
          {formatBoolean(ticker.cyclical)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('nonCyclical', ticker.nonCyclical)}
        >
          {formatBoolean(ticker.nonCyclical)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('highBeta', ticker.highBeta)}
        >
          {formatBoolean(ticker.highBeta)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('momo', ticker.momo)}
        >
          {formatBoolean(ticker.momo)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('rateExposure', ticker.rateExposure)}
        >
          {formatBoolean(ticker.rateExposure)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('strongDollar', ticker.strongDollar)}
        >
          {formatBoolean(ticker.strongDollar)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('extremeValuation', ticker.extremeValuation)}
        >
          {formatBoolean(ticker.extremeValuation)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
        <div 
          className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
          title={onUpdate ? 'Double-click to toggle' : ''}
          onDoubleClick={() => handleDoubleClick('crapco', ticker.crapco)}
        >
          {formatBoolean(ticker.crapco)}
        </div>
      </td>
       {/* Theme */}
       <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
         <div 
           className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
           title={onUpdate ? 'Double-click to toggle' : ''}
           onDoubleClick={() => handleDoubleClick('aiWinner', ticker.aiWinner)}
         >
           {formatBoolean(ticker.aiWinner)}
         </div>
       </td>
       <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
         <div 
           className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
           title={onUpdate ? 'Double-click to toggle' : ''}
           onDoubleClick={() => handleDoubleClick('aiLoser', ticker.aiLoser)}
         >
           {formatBoolean(ticker.aiLoser)}
         </div>
       </td>
       <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
         <div 
           className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
           title={onUpdate ? 'Double-click to toggle' : ''}
           onDoubleClick={() => handleDoubleClick('tariffWinner', ticker.tariffWinner)}
         >
           {formatBoolean(ticker.tariffWinner)}
         </div>
       </td>
       <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
         <div 
           className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
           title={onUpdate ? 'Double-click to toggle' : ''}
           onDoubleClick={() => handleDoubleClick('tariffLoser', ticker.tariffLoser)}
         >
           {formatBoolean(ticker.tariffLoser)}
         </div>
       </td>
       <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
         <div 
           className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
           title={onUpdate ? 'Double-click to toggle' : ''}
           onDoubleClick={() => handleDoubleClick('trumpWinner', ticker.trumpWinner)}
         >
           {formatBoolean(ticker.trumpWinner)}
         </div>
       </td>
       <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
         <div 
           className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
           title={onUpdate ? 'Double-click to toggle' : ''}
           onDoubleClick={() => handleDoubleClick('trumpLoser', ticker.trumpLoser)}
         >
           {formatBoolean(ticker.trumpLoser)}
         </div>
       </td>
       {/* Thesis */}
       <td className="px-6 py-4 text-sm text-gray-500" style={{ width: '450px', minWidth: '450px', maxWidth: '450px' }}>
         {editingField === 'thesis' ? (
           <textarea
             value={editValue}
             onChange={(e) => setEditValue(e.target.value)}
             onBlur={handleSaveEdit}
             onKeyDown={handleKeyPress}
             autoFocus
             className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
             rows="3"
           />
         ) : (
           <div 
             className={`cursor-pointer hover:bg-gray-50 p-1 rounded break-words whitespace-normal ${onUpdate ? 'hover:ring-1 hover:ring-blue-300' : ''}`}
             title={onUpdate ? `${ticker.thesis || '-'} (Double-click to edit)` : ticker.thesis || ''}
             onDoubleClick={() => handleDoubleClick('thesis', ticker.thesis || '')}
           >
             {ticker.thesis || '-'}
           </div>
         )}
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
const AnalystDetailPage = ({ tickers, analysts, selectedAnalyst, onSelectAnalyst, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors, onNavigateToIdeaDetail }) => {
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
               field === 'thesis' ? '300px' : '45px' 
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

  // Filter tickers to only show those assigned to Investment/Super analysts
  const filteredTickers = tickers.filter(ticker => 
    !ticker.analyst || ticker.analyst === '' || analysts.includes(ticker.analyst)
  );
  const analystTickers = filteredTickers.filter(ticker => ticker.analyst === selectedAnalyst);
  
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
          tableData.push([`${status} (${sortedTickers.length})`, '', '', '', '', '', '', '', '', '', '', '', '']);
          
          // Add ticker data rows
          sortedTickers.forEach(ticker => {
            const cleanSymbol = ticker.ticker.replace(' US', '');
            const quote = quotes[cleanSymbol];
            const currentPrice = quote ? quote.price : ticker.currentPrice;
            
            const row = [
              ticker.ticker || '-',
              ticker.lsPosition || '-',
              ticker.priority || '-',
              ticker.rank ? ticker.rank.toString() : '-',
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
        head: [['Ticker', 'L/S', 'Pri', 'Rank', 'Price', 'Bear', 'Bear %', 'Base', 'Base %', 'Bull', 'Bull %', 'Thesis']],
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
          3: { cellWidth: 12 }, // Rank
          4: { cellWidth: 18 }, // Price
          5: { cellWidth: 18 }, // PT Bear
          6: { cellWidth: 15 }, // Bear %
          7: { cellWidth: 18 }, // PT Base
          8: { cellWidth: 15 }, // Base %
          9: { cellWidth: 18 }, // PT Bull
          10: { cellWidth: 15 }, // Bull %
          11: { cellWidth: 280 }  // Thesis (wider since no analyst column)
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
                <SortableHeader field="rank" style={{ width: '35px' }}>Rank</SortableHeader>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '75px' }}>Price</th>
                <SortableHeader field="ptBear" style={{ width: '60px' }}>Bear</SortableHeader>
                <SortableHeader field="bearPercent" style={{ width: '45px' }}>%</SortableHeader>
                <SortableHeader field="ptBase" style={{ width: '60px' }}>Base</SortableHeader>
                <SortableHeader field="basePercent" style={{ width: '45px' }}>%</SortableHeader>
                <SortableHeader field="ptBull" style={{ width: '60px' }}>Bull</SortableHeader>
                <SortableHeader field="bullPercent" style={{ width: '45px' }}>%</SortableHeader>
                <SortableHeader field="thesis" style={{ width: '300px' }}>Thesis</SortableHeader>
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
                  
                  // Check if row should be highlighted (Long position with negative base % or Short position with positive base %)
                  
                  return (
                    <tr key={ticker.id} className={((ticker.lsPosition === 'Long' && basePercent && basePercent.startsWith('-')) || (ticker.lsPosition === 'Short' && basePercent && basePercent.startsWith('+'))) ? 'bg-red-50' : ''}>
                      <td className="px-2 py-2 whitespace-nowrap text-sm font-medium text-gray-900" style={{ width: '85px' }}>
                        <div className="truncate" title={ticker.ticker}>
                          <button
                            onClick={() => onNavigateToIdeaDetail && onNavigateToIdeaDetail(ticker)}
                            className="text-blue-600 hover:text-blue-800 underline hover:no-underline font-medium"
                            title="Click to view in Idea Detail"
                          >
                            {ticker.ticker}
                          </button>
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
                      <td className="px-1 py-2 whitespace-nowrap text-center" style={{ width: '35px' }}>
                        {ticker.rank ? (
                          <span className={`inline-flex w-6 h-6 items-center justify-center text-xs font-bold rounded-full ${
                            ticker.rank === 1 ? 'bg-purple-100 text-purple-800' :
                            ticker.rank === 2 ? 'bg-indigo-100 text-indigo-800' :
                            ticker.rank === 3 ? 'bg-cyan-100 text-cyan-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {ticker.rank}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
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
                        {ticker.ptBear ? formatPriceWithCurrency(ticker.ptBear, ticker.ticker) : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '45px' }}>
                        <span className={getPercentColor(bearPercent)}>
                          {bearPercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '60px' }}>
                        {ticker.ptBase ? formatPriceWithCurrency(ticker.ptBase, ticker.ticker) : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '45px' }}>
                        <span className={getPercentColor(basePercent)}>
                          {basePercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '60px' }}>
                        {ticker.ptBull ? formatPriceWithCurrency(ticker.ptBull, ticker.ticker) : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '45px' }}>
                        <span className={getPercentColor(bullPercent)}>
                          {bullPercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-sm text-gray-900" style={{ width: '300px' }}>
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
const TeamOutputPage = ({ tickers, analysts, onNavigateToIdeaDetail }) => {
 // Filter tickers to only include those assigned to Investment/Super analysts
 const filteredTickers = tickers.filter(ticker => 
   !ticker.analyst || ticker.analyst === '' || analysts.includes(ticker.analyst)
 );

 const getTickersForCell = (analyst, status, lsPosition) => {
   return filteredTickers.filter(ticker => 
     ticker.analyst === analyst && 
     ticker.status === status && 
     ticker.lsPosition === lsPosition
   );
 };

 const getUnassignedTickersForCell = (status, lsPosition) => {
   return filteredTickers.filter(ticker => 
     (!ticker.analyst || ticker.analyst === '') && 
     ticker.status === status && 
     ticker.lsPosition === lsPosition &&
     ['Current', 'On-Deck', 'Portfolio'].includes(ticker.status)
   );
 };

 // Helper function to render clickable ticker
 // Bolded if priority is "A" (especially visible in To Assign row)
 // Displays rank suffix (e.g., MDLN-1) if ticker has a rank
 // Border if ticker has a rank
 const renderTickerButton = (ticker, bgColorClass, textColorClass) => {
   const handleTickerClick = () => {
     if (onNavigateToIdeaDetail) {
       onNavigateToIdeaDetail(ticker);
     }
   };

   const isPriorityA = ticker.priority === 'A';
   const hasRank = ticker.rank != null;
   const displayText = hasRank ? `${ticker.ticker}-${ticker.rank}` : ticker.ticker;
   const rankInfo = hasRank ? ` (Rank ${ticker.rank})` : '';
   const borderClass = hasRank ? 'border-2 border-gray-800' : '';

   return (
     <button
       key={ticker.id}
       onClick={handleTickerClick}
       className={`text-xs ${bgColorClass} ${textColorClass} px-2 py-1 rounded hover:opacity-80 cursor-pointer transition-opacity ${isPriorityA ? 'font-bold' : ''} ${borderClass}`}
       title={`Click to view in Idea Detail${isPriorityA ? ' (Priority A)' : ''}${rankInfo}`}
     >
       {displayText}
     </button>
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
     
     // Build ticker lookup for formatting
     const tickerLookup = {};
     
     // Helper to build cell data
     const buildCellData = (tickers) => {
       if (!tickers || tickers.length === 0) return '-';
       return tickers.map(t => {
         let txt = t.ticker;
         if (t.rank) txt += `-${t.rank}`;
         tickerLookup[txt] = { bold: t.priority === 'A', underline: !!t.rank };
         return txt;
       }).join(', ');
     };
     
     // Build display data for autoTable
     const displayTableData = [];
     
     analysts.forEach(analyst => {
       displayTableData.push([
         analyst,
         buildCellData(getTickersForCell(analyst, 'Current', 'Long')),
         buildCellData(getTickersForCell(analyst, 'Current', 'Short')),
         buildCellData(getTickersForCell(analyst, 'On-Deck', 'Long')),
         buildCellData(getTickersForCell(analyst, 'On-Deck', 'Short')),
         buildCellData(getTickersForCell(analyst, 'Portfolio', 'Long')),
         buildCellData(getTickersForCell(analyst, 'Portfolio', 'Short'))
       ]);
     });
     
     // Add "To Assign" row
     displayTableData.push([
       'To Assign',
       buildCellData(getUnassignedTickersForCell('Current', 'Long')),
       buildCellData(getUnassignedTickersForCell('Current', 'Short')),
       buildCellData(getUnassignedTickersForCell('On-Deck', 'Long')),
       buildCellData(getUnassignedTickersForCell('On-Deck', 'Short')),
       buildCellData(getUnassignedTickersForCell('Portfolio', 'Long')),
       buildCellData(getUnassignedTickersForCell('Portfolio', 'Short'))
     ]);
     
     // Create the PDF table - let autoTable handle all layout
     autoTable(doc, {
       head: [['Analyst', 'Cur-Long', 'Cur-Short', 'Deck-Long', 'Deck-Short', 'Port-Long', 'Port-Short']],
       body: displayTableData,
       startY: 40,
       styles: {
         fontSize: 8,
         cellPadding: 3
       },
       headStyles: {
         fillColor: [75, 85, 99],
         textColor: 255,
         fontStyle: 'bold'
       },
       alternateRowStyles: {
         fillColor: [248, 250, 252]
       },
       columnStyles: {
         0: { cellWidth: 30 },
         1: { cellWidth: 40 },
         2: { cellWidth: 40 },
         3: { cellWidth: 40 },
         4: { cellWidth: 40 },
         5: { cellWidth: 40 },
         6: { cellWidth: 40 }
       },
       didParseCell: function(data) {
         if (data.row.index === analysts.length) {
           data.cell.styles.fillColor = [254, 226, 226];
         }
       },
       willDrawCell: function(data) {
         // Hide autoTable's text for ticker cells - we'll draw it ourselves with formatting
         if (data.section === 'body' && data.column.index > 0) {
           const cellText = data.cell.text;
           if (cellText && cellText.length > 0 && !(cellText.length === 1 && cellText[0] === '-')) {
             // Check if any ticker needs formatting
             let needsFormatting = false;
             cellText.forEach(line => {
               if (line && line !== '-') {
                 line.split(/,\s*/).forEach(t => {
                   const trimmed = t.trim();
                   if (tickerLookup[trimmed]) needsFormatting = true;
                 });
               }
             });
             if (needsFormatting) {
               // Store text and hide it
               data.cell.customLines = [...cellText];
               data.cell.text = [];
             }
           }
         }
       },
       didDrawCell: function(data) {
         // Draw formatted text for ticker cells
         if (data.section !== 'body' || data.column.index === 0) return;
         if (!data.cell.customLines || data.cell.customLines.length === 0) return;
         
         // Get non-empty lines only
         const lines = data.cell.customLines.filter(line => line && line.trim() !== '');
         if (lines.length === 0) return;
         
         const { x, y, width, height } = data.cell;
         const fontSize = data.cell.styles.fontSize || 8;
         const padding = data.cell.styles.cellPadding || 3;
         const paddingVal = typeof padding === 'number' ? padding : (padding.left || 3);
         
         // Use tight line spacing for wrapped lines
         const lineHeight = fontSize * 0.42;
         // Always start from top of cell
         let startX = x + paddingVal;
         let startY = y + paddingVal + fontSize * 0.35;  // Top-aligned, closer to top
         
         doc.setFontSize(fontSize);
         doc.setTextColor(0, 0, 0);
         
         let currentY = startY;
         
         lines.forEach((line, lineIdx) => {
           
           if (line === '-') {
             doc.setFont('helvetica', 'normal');
             doc.text('-', startX, currentY);
             currentY += lineHeight;
             return;
           }
           
           let currentX = startX;
           const parts = line.split(/(,\s*)/);
           
           parts.forEach(part => {
             if (!part) return;
             
             const trimmed = part.trim();
             const style = tickerLookup[trimmed];
             const isBold = style && style.bold;
             const isUnderline = style && style.underline;
             
             doc.setFont('helvetica', isBold ? 'bold' : 'normal');
             doc.text(part, currentX, currentY);
             
             const partWidth = doc.getTextWidth(part);
             
             if (isUnderline) {
               doc.setDrawColor(0, 0, 0);
               doc.setLineWidth(0.3);
               doc.line(currentX, currentY + 1, currentX + partWidth, currentY + 1);
             }
             
             currentX += partWidth;
           });
           
           currentY += lineHeight;
         });
         
         doc.setFont('helvetica', 'normal');
       }
     });

     const fileName = `team-output-matrix-${new Date().toISOString().split('T')[0]}.pdf`;
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
                   <div className="flex flex-wrap gap-2 justify-center">
                     {getTickersForCell(analyst, 'Current', 'Long').map(ticker => 
                       renderTickerButton(ticker, 'bg-green-100', 'text-green-800')
                     )}
                   </div>
                 </td>
                 <td className="px-6 py-4 text-center">
                   <div className="flex flex-wrap gap-2 justify-center">
                     {getTickersForCell(analyst, 'Current', 'Short').map(ticker => 
                       renderTickerButton(ticker, 'bg-red-100', 'text-red-800')
                     )}
                   </div>
                 </td>
                 <td className="px-6 py-4 text-center">
                   <div className="flex flex-wrap gap-2 justify-center">
                     {getTickersForCell(analyst, 'On-Deck', 'Long').map(ticker => 
                       renderTickerButton(ticker, 'bg-green-100', 'text-green-800')
                     )}
                   </div>
                 </td>
                 <td className="px-6 py-4 text-center">
                   <div className="flex flex-wrap gap-2 justify-center">
                     {getTickersForCell(analyst, 'On-Deck', 'Short').map(ticker => 
                       renderTickerButton(ticker, 'bg-red-100', 'text-red-800')
                     )}
                   </div>
                 </td>
                 <td className="px-6 py-4 text-center">
                   <div className="flex flex-wrap gap-2 justify-center">
                     {getTickersForCell(analyst, 'Portfolio', 'Long').map(ticker => 
                       renderTickerButton(ticker, 'bg-green-100', 'text-green-800')
                     )}
                   </div>
                 </td>
                 <td className="px-6 py-4 text-center">
                   <div className="flex flex-wrap gap-2 justify-center">
                     {getTickersForCell(analyst, 'Portfolio', 'Short').map(ticker => 
                       renderTickerButton(ticker, 'bg-red-100', 'text-red-800')
                     )}
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
                   {getUnassignedTickersForCell('Current', 'Long').map(ticker => 
                     renderTickerButton(ticker, 'bg-orange-100', 'text-orange-800')
                   )}
                 </div>
               </td>
               <td className="px-6 py-4 text-center">
                 <div className="space-y-1">
                   {getUnassignedTickersForCell('Current', 'Short').map(ticker => 
                     renderTickerButton(ticker, 'bg-orange-100', 'text-orange-800')
                   )}
                 </div>
               </td>
               <td className="px-6 py-4 text-center">
                 <div className="space-y-1">
                   {getUnassignedTickersForCell('On-Deck', 'Long').map(ticker => 
                     renderTickerButton(ticker, 'bg-orange-100', 'text-orange-800')
                   )}
                 </div>
               </td>
               <td className="px-6 py-4 text-center">
                 <div className="space-y-1">
                   {getUnassignedTickersForCell('On-Deck', 'Short').map(ticker => 
                     renderTickerButton(ticker, 'bg-orange-100', 'text-orange-800')
                   )}
                 </div>
               </td>
               <td className="px-6 py-4 text-center">
                 <div className="space-y-1">
                   {getUnassignedTickersForCell('Portfolio', 'Long').map(ticker => 
                     renderTickerButton(ticker, 'bg-orange-100', 'text-orange-800')
                   )}
                 </div>
               </td>
               <td className="px-6 py-4 text-center">
                 <div className="space-y-1">
                   {getUnassignedTickersForCell('Portfolio', 'Short').map(ticker => 
                     renderTickerButton(ticker, 'bg-orange-100', 'text-orange-800')
                   )}
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
const EarningsTrackingPage = ({ tickers, selectedEarningsAnalyst, onSelectEarningsAnalyst, earningsData, onUpdateEarnings, onUpdateTicker, getEarningsData, onRefreshEarningsData, analysts, quotes = {}, onUpdateQuote, isLoadingQuotes = false, quoteErrors = {}, formatTradeLevel, formatCompactDate, currentUser, onNavigateToIdeaDetail }) => {
  // State for sorting and filtering
  const [sortField, setSortField] = useState('days');
  const [sortDirection, setSortDirection] = useState('asc');
  const [daysRange, setDaysRange] = useState({ min: -10, max: 105 });
  const [hideOldEarnings, setHideOldEarnings] = useState(false);
  const [hidePastEarnings, setHidePastEarnings] = useState(false);

  // Filter tickers to only show Portfolio status and Investment/Super analysts
  let portfolioTickers = tickers.filter(ticker => 
    ticker.status === 'Portfolio' && 
    (!ticker.analyst || ticker.analyst === '' || analysts.includes(ticker.analyst))
  );
  
  // Apply analyst filter if selected and not "All Analysts"
  if (selectedEarningsAnalyst && selectedEarningsAnalyst !== 'All Analysts') {
    portfolioTickers = portfolioTickers.filter(ticker => ticker.analyst === selectedEarningsAnalyst);
  }

  // Calculate days until earnings
  const calculateDaysUntilEarnings = (earningsDate) => {
    if (!earningsDate) return 999999; // Put items without dates at the bottom

    // Helper to get NY midnight epoch days
    const getTodayEpochDaysNY = () => {
      const nowNY = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      return Math.floor(Date.UTC(
        nowNY.getFullYear(),
        nowNY.getMonth(),
        nowNY.getDate()
      ) / 86400000);
    };

    // Parse YYYY-MM-DD as a date-only target
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(earningsDate));
    let targetDays;
    if (m) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      const d = parseInt(m[3], 10);
      targetDays = Math.floor(Date.UTC(y, mo - 1, d) / 86400000);
    } else {
      // Fallback: normalize arbitrary date to date-only
      const dt = new Date(earningsDate);
      targetDays = Math.floor(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) / 86400000);
    }

    const todayDays = getTodayEpochDaysNY();
    return targetDays - todayDays;
  };

  // Format days for display
  const formatDaysUntilEarnings = (earningsDate) => {
    if (!earningsDate) return '-';
    const days = calculateDaysUntilEarnings(earningsDate);
    if (days === 999999) return '-';
    return days;
  };

  // Process tickers to get all earnings within range
  const allTickerEarnings = [];
  
  portfolioTickers.forEach(ticker => {
    let allEarningsData = [];
    const currentYear = new Date().getFullYear();
    
    // Collect all earnings data for this ticker across multiple years
    for (let year of [currentYear - 1, currentYear, currentYear + 1]) {
      for (let quarter of ['Q1', 'Q2', 'Q3', 'Q4']) {
        const cyq = `${year}${quarter}`;
        const earningsData = getEarningsData(ticker.ticker, cyq);
        if (earningsData.earningsDate) {
          const days = calculateDaysUntilEarnings(earningsData.earningsDate);
          if (days !== 999999) {
            // Calculate QP Days for this entry
            let qpDays = null;
            if (earningsData.quarterEndDate) {
              const quarterEndDate = new Date(earningsData.quarterEndDate);
              const qpDrift = ticker.qpDrift !== undefined ? ticker.qpDrift : 
                            ticker.QP_Drift !== undefined ? ticker.QP_Drift : -14;
              const qpStartDate = new Date(quarterEndDate);
              qpStartDate.setDate(quarterEndDate.getDate() + qpDrift);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              qpStartDate.setHours(0, 0, 0, 0);
              const diffTime = qpStartDate.getTime() - today.getTime();
              qpDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            }
            
            allEarningsData.push({ ...earningsData, cyq, days, qpDays });
          }
        }
      }
    }
    
    // If hideOldEarnings is enabled, filter by QP Days >= -7
    if (hideOldEarnings) {
      allEarningsData = allEarningsData.filter(data => data.qpDays !== null && data.qpDays >= -7);
    }
    
    // If hidePastEarnings is enabled, filter out past earnings (negative days)
    if (hidePastEarnings) {
      allEarningsData = allEarningsData.filter(data => data.days >= 0);
    }
    
    // Filter by days range
    const earningsInRange = allEarningsData.filter(data => 
      data.days >= daysRange.min && data.days <= daysRange.max
    );
    
    // Sort based on active filters
    if (hideOldEarnings) {
      // Sort by QP Days (smallest to largest)
      earningsInRange.sort((a, b) => {
        const aQpDays = a.qpDays !== null ? a.qpDays : 999999;
        const bQpDays = b.qpDays !== null ? b.qpDays : 999999;
        return aQpDays - bQpDays;
      });
    } else if (hidePastEarnings) {
      // Sort by Ern Days (smallest to largest)
      earningsInRange.sort((a, b) => a.days - b.days);
    } else {
      // Default sort by days
      earningsInRange.sort((a, b) => a.days - b.days);
    }
    
    // Create a separate entry for each earnings date within range
    earningsInRange.forEach(earningsData => {
      allTickerEarnings.push({
        ...ticker,
        bestEarnings: earningsData,
        earningsData: earningsData
      });
    });
  });

  // Use all ticker earnings as the filtered tickers
  const filteredTickers = allTickerEarnings;

  // Sort tickers based on selected field and direction
  const sortedTickers = [...filteredTickers].sort((a, b) => {
    const aEarningsData = a.bestEarnings;
    const bEarningsData = b.bestEarnings;
    
    let aValue, bValue;
    
    switch (sortField) {
      case 'days':
        aValue = aEarningsData.days !== undefined ? aEarningsData.days : 999999;
        bValue = bEarningsData.days !== undefined ? bEarningsData.days : 999999;
        break;
      case 'qpDays':
        // Calculate QP Days for sorting
        if (aEarningsData.quarterEndDate) {
          const quarterEndDateA = new Date(aEarningsData.quarterEndDate);
          const qpDriftA = a.qpDrift !== undefined ? a.qpDrift : 
                          a.QP_Drift !== undefined ? a.QP_Drift : -14;
          const qpStartDateA = new Date(quarterEndDateA);
          qpStartDateA.setDate(quarterEndDateA.getDate() + qpDriftA);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          qpStartDateA.setHours(0, 0, 0, 0);
          const diffTimeA = qpStartDateA.getTime() - today.getTime();
          aValue = Math.round(diffTimeA / (1000 * 60 * 60 * 24));
        } else {
          aValue = 999999;
        }
        
        if (bEarningsData.quarterEndDate) {
          const quarterEndDateB = new Date(bEarningsData.quarterEndDate);
          const qpDriftB = b.qpDrift !== undefined ? b.qpDrift : 
                          b.QP_Drift !== undefined ? b.QP_Drift : -14;
          const qpStartDateB = new Date(quarterEndDateB);
          qpStartDateB.setDate(quarterEndDateB.getDate() + qpDriftB);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          qpStartDateB.setHours(0, 0, 0, 0);
          const diffTimeB = qpStartDateB.getTime() - today.getTime();
          bValue = Math.round(diffTimeB / (1000 * 60 * 60 * 24));
        } else {
          bValue = 999999;
        }
        break;
      case 'earningsDate':
        aValue = aEarningsData.earningsDate ? new Date(aEarningsData.earningsDate).getTime() : 0;
        bValue = bEarningsData.earningsDate ? new Date(bEarningsData.earningsDate).getTime() : 0;
        break;
      case 'ticker':
        aValue = a.ticker;
        bValue = b.ticker;
        break;
      default:
        aValue = aEarningsData.days !== undefined ? aEarningsData.days : 999999;
        bValue = bEarningsData.days !== undefined ? bEarningsData.days : 999999;
    }
    
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Handle sorting
  const handleSort = (field) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sortable header component
  const SortableHeader = ({ field, children, style, className = '' }) => (
    <th 
      className={`px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 ${className}`}
      style={style}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {sortField === field && (
          <span className="text-gray-400">
            {sortDirection === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );

  // Refresh earnings state
  const [refreshMessage, setRefreshMessage] = useState('');
  const [isRefreshingData, setIsRefreshingData] = useState(false);

  // Handle refresh earnings data from database
  const handleRefreshEarningsData = async () => {
    if (!onRefreshEarningsData) return;

    setIsRefreshingData(true);
    setRefreshMessage('Refreshing earnings data from database...');

    try {
      const result = await onRefreshEarningsData();
      
      if (result.success) {
        setRefreshMessage(result.message);
      } else {
        setRefreshMessage(result.message);
      }

      // Clear message after 3 seconds
      setTimeout(() => {
        setRefreshMessage('');
      }, 3000);

    } catch (error) {
      console.error('Error refreshing earnings data:', error);
      setRefreshMessage(`❌ Error: ${error.message}`);
      
      setTimeout(() => {
        setRefreshMessage('');
      }, 3000);
    } finally {
      setIsRefreshingData(false);
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
        ? `Clearline Flow - Earnings Tracking: ${selectedEarningsAnalyst} (${daysRange.min} to ${daysRange.max} days)`
        : `Clearline Flow - Earnings Tracking: All Analysts (${daysRange.min} to ${daysRange.max} days)`;
      doc.text(title, 14, 22);
      
      // Add timestamp
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
      
      // Prepare data for the PDF table
      const tableData = [];
      
      sortedTickers.forEach(ticker => {
        const currentEarningsData = ticker.bestEarnings;
        
        // Calculate QP Start date
        const calculateQPStart = () => {
          if (currentEarningsData.quarterEndDate) {
            const quarterEndDate = new Date(currentEarningsData.quarterEndDate);
            const qpDrift = ticker.qpDrift !== undefined ? ticker.qpDrift : 
                           ticker.QP_Drift !== undefined ? ticker.QP_Drift : -14;
            const qpStartDate = new Date(quarterEndDate);
            qpStartDate.setDate(quarterEndDate.getDate() + qpDrift);
            return qpStartDate.toISOString().split('T')[0];
          }
          return '-';
        };
        
        // Calculate QP Days
        const calculateQPDays = () => {
          if (currentEarningsData.quarterEndDate) {
            const quarterEndDate = new Date(currentEarningsData.quarterEndDate);
            const qpDrift = ticker.qpDrift !== undefined ? ticker.qpDrift : 
                           ticker.QP_Drift !== undefined ? ticker.QP_Drift : -14;
            const qpStartDate = new Date(quarterEndDate);
            qpStartDate.setDate(quarterEndDate.getDate() + qpDrift);
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            qpStartDate.setHours(0, 0, 0, 0);
            
            const diffTime = qpStartDate.getTime() - today.getTime();
            return Math.round(diffTime / (1000 * 60 * 60 * 24)).toString();
          }
          return '-';
        };
        
        const row = [
          ticker.ticker || '-',
          ticker.analyst || '-',
          currentEarningsData.cyq || '-',
          calculateQPStart(),
          calculateQPDays(),
          currentEarningsData.quarterEndDate || '-',
          currentEarningsData.earningsDate || '-',
          currentEarningsData.days !== 999999 ? currentEarningsData.days.toString() : '-',
          currentEarningsData.tradeRec || '-',
          formatTradeLevel ? formatTradeLevel(currentEarningsData.tradeLevel) || '-' : currentEarningsData.tradeLevel || '-',
          currentEarningsData.qpCallDate || '-',
          currentEarningsData.previewDate || '-',
          currentEarningsData.callbackDate || '-'
        ];
        tableData.push(row);
      });
      
      console.log('Earnings Tracking table data:', tableData);
      
      // Create the PDF table
      autoTable(doc, {
        head: [['Ticker', 'Who', 'CYQ', 'QP Start', 'QP Days', 'QTR END', 'Earnings', 'Ern Days', 'Trade Rec', 'Trade Level', 'QP Call', 'Preview', 'Callback']],
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
          0: { cellWidth: 22 }, // Ticker
          1: { cellWidth: 18 }, // Who
          2: { cellWidth: 15 }, // CYQ
          3: { cellWidth: 20 }, // QP Start
          4: { cellWidth: 15 }, // QP Days
          5: { cellWidth: 20 }, // QTR END
          6: { cellWidth: 20 }, // Earnings
          7: { cellWidth: 15 }, // Ern Days
          8: { cellWidth: 18 }, // Trade Rec
          9: { cellWidth: 22 }, // Trade Level
          10: { cellWidth: 20 }, // QP Call
          11: { cellWidth: 20 }, // Preview
          12: { cellWidth: 20 }  // Callback
        }
      });
      
      // Save the PDF
      const analystSuffix = selectedEarningsAnalyst ? `-${selectedEarningsAnalyst.replace(/\s+/g, '-').toLowerCase()}` : '-all-analysts';
      const fileName = `earnings-tracking${analystSuffix}-${daysRange.min}to${daysRange.max}days-${new Date().toISOString().split('T')[0]}.pdf`;
      console.log('Saving Earnings Tracking PDF as:', fileName);
      doc.save(fileName);
      console.log('Earnings Tracking PDF export completed successfully');
    } catch (error) {
      console.error('Error exporting Earnings Tracking PDF:', error);
      alert(`Error exporting PDF: ${error.message}`);
    }
  };

  // Calculate earnings counts for header
  const earningsIn7Days = sortedTickers.filter(ticker => {
    const daysUntilEarnings = formatDaysUntilEarnings(ticker.bestEarnings.earningsDate);
    return daysUntilEarnings !== '-' && daysUntilEarnings >= 0 && daysUntilEarnings <= 7;
  }).length;

  const earningsIn14Days = sortedTickers.filter(ticker => {
    const daysUntilEarnings = formatDaysUntilEarnings(ticker.bestEarnings.earningsDate);
    return daysUntilEarnings !== '-' && daysUntilEarnings >= 0 && daysUntilEarnings <= 14;
  }).length;

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="text-lg leading-6 font-medium text-gray-900">
            <div>{earningsIn7Days} Earnings in next 7 days</div>
            <div>{earningsIn14Days} Earnings in next 14 days</div>
          </div>
          <div className="flex items-center space-x-4">
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
              <label className="text-sm font-medium text-gray-700">Days:</label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  value={daysRange.min}
                  onChange={(e) => setDaysRange(prev => ({ ...prev, min: parseInt(e.target.value) || -10 }))}
                  className="border border-gray-300 rounded-md px-2 py-1 w-16 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="-10"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="number"
                  value={daysRange.max}
                  onChange={(e) => setDaysRange(prev => ({ ...prev, max: parseInt(e.target.value) || 90 }))}
                  className="border border-gray-300 rounded-md px-2 py-1 w-16 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="90"
                />
              </div>
            </div>
            <div className="flex flex-col space-y-1">
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={hideOldEarnings}
                  onChange={(e) => setHideOldEarnings(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span>Hide &gt;1 week QP</span>
              </label>
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={hidePastEarnings}
                  onChange={(e) => setHidePastEarnings(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span>Hide past earnings</span>
              </label>
            </div>
            <button
              onClick={handleRefreshEarningsData}
              disabled={isRefreshingData}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isRefreshingData
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-purple-100 text-purple-700 hover:bg-purple-200 focus:ring-purple-500'
              }`}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshingData ? 'animate-spin' : ''}`} />
              <span>Refresh Data</span>
            </button>
            <button
              onClick={exportToPDF}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <Download className="h-4 w-4" />
              <span>Export to PDF</span>
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
        
        <div className="overflow-x-auto" style={{ maxHeight: '70vh' }}>
          <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <SortableHeader field="ticker" style={{ width: '60px' }} className="sticky left-0 bg-gray-50 z-20">Ticker</SortableHeader>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '45px' }}>Who</th>
                <SortableHeader field="qpStart" style={{ width: '70px' }}>QP Start</SortableHeader>
                <SortableHeader field="qpDays" style={{ width: '45px' }}>
                  <div className="leading-tight">QP<br />Days</div>
                </SortableHeader>
                <SortableHeader field="quarterEndDate" style={{ width: '70px' }}>QTR END</SortableHeader>
                <SortableHeader field="earningsDate" style={{ width: '70px' }}>Earnings</SortableHeader>
                <SortableHeader field="days" style={{ width: '45px' }}>
                  <div className="leading-tight">Ern<br />Days</div>
                </SortableHeader>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '60px' }}>Trade Rec</th>
                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '70px' }}>Trade Level</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '70px' }}>QP Call</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '70px' }}>Preview</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '70px' }}>Callback</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '140px' }}>Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedTickers.map((ticker) => (
                <EarningsTrackingRow 
                  key={`${ticker.ticker}-${ticker.bestEarnings.cyq || 'no-cyq'}-${ticker.bestEarnings.earningsDate || 'no-date'}`}
                  ticker={ticker}
                  earningsData={ticker.bestEarnings}
                  onUpdateEarnings={onUpdateEarnings}
                  onUpdateTicker={onUpdateTicker}
                  formatDaysUntilEarnings={formatDaysUntilEarnings}
                  formatTradeLevel={formatTradeLevel}
                  formatCompactDate={formatCompactDate}
                  quotes={quotes}
                  onUpdateQuote={onUpdateQuote}
                  isLoadingQuotes={isLoadingQuotes}
                  quoteErrors={quoteErrors}
                  currentUser={currentUser}
                  allTickers={tickers}
                  onNavigateToIdeaDetail={onNavigateToIdeaDetail}
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
const EarningsTrackingRow = ({ ticker, earningsData, onUpdateEarnings, onUpdateTicker, formatDaysUntilEarnings, formatTradeLevel, formatCompactDate, quotes = {}, onUpdateQuote, isLoadingQuotes = false, quoteErrors = {}, currentUser, allTickers, onNavigateToIdeaDetail }) => {
 const [isEditing, setIsEditing] = useState(false);
 const [showIRPopup, setShowIRPopup] = useState(false);
 const [pendingEmailType, setPendingEmailType] = useState(null); // 'qp' or 'callback'
 const [irData, setIrData] = useState({
   irName: ticker.irName || '',
   irEmail: ticker.irEmail || '',
   irName2: ticker.irName2 || '',
   irEmail2: ticker.irEmail2 || '',
   irName3: ticker.irName3 || '',
   irEmail3: ticker.irEmail3 || '',
   irName4: ticker.irName4 || '',
   irEmail4: ticker.irEmail4 || ''
 });
 const [contactCount, setContactCount] = useState(() => {
   // Initialize with the number of existing contacts
   let count = 1;
   if (ticker.irName2 || ticker.irEmail2) count = 2;
   if (ticker.irName3 || ticker.irEmail3) count = 3;
   if (ticker.irName4 || ticker.irEmail4) count = 4;
   return count;
 });
 const [editData, setEditData] = useState({
   earningsDate: earningsData.earningsDate || '',
   quarterEndDate: earningsData.quarterEndDate || '',
   qpStartDate: (() => {
     // Calculate initial QP Start date from quarter end + QP_Drift
     if (earningsData.quarterEndDate) {
       const quarterEndDate = new Date(earningsData.quarterEndDate);
       const qpDrift = ticker.qpDrift !== undefined ? ticker.qpDrift : 
                      ticker.QP_Drift !== undefined ? ticker.QP_Drift : -14;
       const qpStartDate = new Date(quarterEndDate);
       qpStartDate.setDate(quarterEndDate.getDate() + qpDrift);
       return qpStartDate.toISOString().split('T')[0];
     }
     return '';
   })(),
   qpCallDate: earningsData.qpCallDate === '2000-01-01' ? 'N/A' : (earningsData.qpCallDate || ''),
   previewDate: earningsData.previewDate || '',
   callbackDate: earningsData.callbackDate || '',
   tradeRec: earningsData.tradeRec || '',
   tradeLevel: earningsData.tradeLevel || ''
 });

 const handleSave = async () => {
   try {
     const cyq = earningsData.cyq || '';
     
     // Calculate QP_Drift if QP Start date was changed
     let qpDriftUpdate = null;
     if (editData.qpStartDate && editData.quarterEndDate) {
       const qpStartDate = new Date(editData.qpStartDate);
       const quarterEndDate = new Date(editData.quarterEndDate);
       const diffTime = qpStartDate.getTime() - quarterEndDate.getTime();
       const qpDrift = Math.round(diffTime / (1000 * 60 * 60 * 24));
       
       // Only update if it's different from current value
       const currentQpDrift = ticker.qpDrift !== undefined ? ticker.qpDrift : 
                             ticker.QP_Drift !== undefined ? ticker.QP_Drift : -14;
       if (qpDrift !== currentQpDrift) {
         qpDriftUpdate = qpDrift;
       }
     }
     
     console.log('Saving earnings data:', { ticker: ticker.ticker, cyq, editData, qpDriftUpdate });
     
     // Save earnings data (excluding qpStartDate as it's calculated)
     const { qpStartDate, ...earningsDataToSave } = editData;
     
     // Convert N/A to 2000-01-01 for database storage
     if (earningsDataToSave.qpCallDate === 'N/A') {
       earningsDataToSave.qpCallDate = '2000-01-01';
     }
     
     await onUpdateEarnings(ticker.ticker, cyq, earningsDataToSave);
     
     // Update QP_Drift in tickers table if changed
     if (qpDriftUpdate !== null) {
       console.log(`Updating QP_Drift for ${ticker.ticker} to ${qpDriftUpdate}`);
       // You'll need to add this function to update ticker QP_Drift
       await updateTickerQPDrift(ticker.id, qpDriftUpdate);
     }
     
     setIsEditing(false);
   } catch (error) {
     console.error('Error updating earnings data:', error);
     console.error('Error details:', { 
       message: error.message, 
       name: error.name,
       stack: error.stack,
       ticker: ticker.ticker,
       cyq: earningsData.cyq,
       editData 
     });
     alert(`Error updating earnings data: ${error.message || 'Unknown error occurred'}`);
   }
 };

 // Helper function to update ticker QP_Drift
 const updateTickerQPDrift = async (tickerId, qpDrift) => {
   try {
     console.log(`Updating ticker ${tickerId} QP_Drift to ${qpDrift}`);
     if (onUpdateTicker) {
       await onUpdateTicker(tickerId, { qpDrift: qpDrift });
       console.log(`Successfully updated QP_Drift to ${qpDrift}`);
     } else {
       console.warn('onUpdateTicker not available');
     }
   } catch (error) {
     console.error('Error updating QP_Drift:', error);
     throw error;
   }
 };

 const handleCancel = () => {
   setEditData({
     earningsDate: earningsData.earningsDate || '',
     quarterEndDate: earningsData.quarterEndDate || '',
     qpStartDate: (() => {
       // Calculate initial QP Start date from quarter end + QP_Drift
       if (earningsData.quarterEndDate) {
         const quarterEndDate = new Date(earningsData.quarterEndDate);
         const qpDrift = ticker.qpDrift !== undefined ? ticker.qpDrift : 
                        ticker.QP_Drift !== undefined ? ticker.QP_Drift : -14;
         const qpStartDate = new Date(quarterEndDate);
         qpStartDate.setDate(quarterEndDate.getDate() + qpDrift);
         return qpStartDate.toISOString().split('T')[0];
       }
       return '';
     })(),
     qpCallDate: earningsData.qpCallDate === '2000-01-01' ? 'N/A' : (earningsData.qpCallDate || ''),
     previewDate: earningsData.previewDate || '',
     callbackDate: earningsData.callbackDate || '',
     tradeRec: earningsData.tradeRec || '',
     tradeLevel: earningsData.tradeLevel || ''
   });
   setIsEditing(false);
 };

 // Email functions
 const composeQPCallEmail = () => {
   setPendingEmailType('qp');
   setShowIRPopup(true);
 };

 const composeCallbackEmail = () => {
   setPendingEmailType('callback');
   setShowIRPopup(true);
 };

 // Handle saving IR data and proceeding with email
 const handleSaveIRData = async () => {
   // Validate that at least the first contact has both name and email
   if (!irData.irName || !irData.irEmail) {
     alert('Please fill in both IR Name and IR Email fields for the first contact.');
     return;
   }

   // Validate that if any contact field is filled, both name and email are filled for that contact
   for (let i = 2; i <= contactCount; i++) {
     const nameField = `irName${i}`;
     const emailField = `irEmail${i}`;
     const name = irData[nameField];
     const email = irData[emailField];
     
     if ((name && !email) || (!name && email)) {
       alert(`Please fill in both name and email for contact ${i}, or leave both empty.`);
       return;
     }
   }

   try {
     // Prepare update data with all IR contacts
     const updateData = {
       irName: irData.irName,
       irEmail: irData.irEmail
     };

     // Add additional contacts if they exist
     for (let i = 2; i <= 4; i++) {
       const nameField = `irName${i}`;
       const emailField = `irEmail${i}`;
       if (irData[nameField] && irData[emailField]) {
         updateData[nameField] = irData[nameField];
         updateData[emailField] = irData[emailField];
       } else {
         // Clear fields if empty
         updateData[nameField] = null;
         updateData[emailField] = null;
       }
     }

     // Update ticker with IR data
     await DatabaseService.updateTicker(ticker.id, updateData);

     // Update local ticker object
     Object.assign(ticker, updateData);

     // Close popup
     setShowIRPopup(false);

     // Compose email based on pending type
     const userFirstName = currentUser?.user_metadata?.full_name?.split(' ')[0] || 'there';
     const userFullName = currentUser?.user_metadata?.full_name || '';
     const userEmail = currentUser?.email || '';
     const irFirstName = irData.irName.split(' ')[0] || 'there';

     let subject, body;

     if (pendingEmailType === 'qp') {
       subject = `Clearline - Quarterly Call Request`;
       body = `Dear ${irFirstName},

Can we please schedule a catch-up call before ${ticker.ticker} enters its quiet period?

Thank you,
${userFirstName}

------------------------------------------------------------------

${userFullName}
Clearline Capital LP
750 Lexington Avenue, 25th Floor
New York, NY 10022
Email: ${userEmail}

------------------------------------------------------------------

This email and any files transmitted with it may contain privileged or confidential information, and any use, disclosure, copying, or distribution by anyone other than an intended recipient is strictly prohibited. If you have received this email in error, please notify the sender by reply email and then immediately delete this email. Information contained herein is provided for informational purposes only and does not constitute an offer or a solicitation to buy, hold, or sell securities or investment advisory services, and is not intended as investment, tax, or legal advice. Any opinions expressed herein are those of the author and do not necessarily reflect the opinions of Clearline Capital LP or its affiliates.`;
     } else if (pendingEmailType === 'callback') {
       subject = `Clearline - Post Earnings Callback Request`;
       body = `Dear ${irFirstName},
Can we schedule a post earnings callback?

Thank you,
${userFirstName}

------------------------------------------------------------------

${userFullName}
Clearline Capital LP
750 Lexington Avenue, 25th Floor
New York, NY 10022
Email: ${userEmail}

------------------------------------------------------------------

This email and any files transmitted with it may contain privileged or confidential information, and any use, disclosure, copying, or distribution by anyone other than an intended recipient is strictly prohibited. If you have received this email in error, please notify the sender by reply email and then immediately delete this email. Information contained herein is provided for informational purposes only and does not constitute an offer or a solicitation to buy, hold, or sell securities or investment advisory services, and is not intended as investment, tax, or legal advice. Any opinions expressed herein are those of the author and do not necessarily reflect the opinions of Clearline Capital LP or its affiliates.`;
     }

     // Collect all valid email addresses
     const allEmails = [];
     if (irData.irEmail) allEmails.push(irData.irEmail);
     if (irData.irEmail2) allEmails.push(irData.irEmail2);
     if (irData.irEmail3) allEmails.push(irData.irEmail3);
     if (irData.irEmail4) allEmails.push(irData.irEmail4);

     // Open email client with all recipients
     if (subject && body && allEmails.length > 0) {
       const mailtoLink = `mailto:${allEmails.join(';')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
       window.open(mailtoLink);
     }

     setPendingEmailType(null);
   } catch (error) {
     console.error('Error saving IR data:', error);
     alert('Error saving IR information. Please try again.');
   }
 };

 const handleCancelIRPopup = () => {
   setShowIRPopup(false);
   setPendingEmailType(null);
   setIrData({
     irName: ticker.irName || '',
     irEmail: ticker.irEmail || '',
     irName2: ticker.irName2 || '',
     irEmail2: ticker.irEmail2 || '',
     irName3: ticker.irName3 || '',
     irEmail3: ticker.irEmail3 || '',
     irName4: ticker.irName4 || '',
     irEmail4: ticker.irEmail4 || ''
   });
   // Reset contact count to existing data
   let count = 1;
   if (ticker.irName2 || ticker.irEmail2) count = 2;
   if (ticker.irName3 || ticker.irEmail3) count = 3;
   if (ticker.irName4 || ticker.irEmail4) count = 4;
   setContactCount(count);
 };

 const daysUntilEarnings = formatDaysUntilEarnings(earningsData.earningsDate);
 
 // Get current price from quotes
 const cleanSymbol = ticker.ticker.replace(' US', '');
 const quote = quotes[cleanSymbol];
 const currentPrice = quote ? quote.price : null;
 
  // Calculate row background color based on conditional formatting
 const getRowBackgroundColor = () => {
   if (!earningsData.tradeRec || !earningsData.tradeLevel || !currentPrice) {
     return '';
   }
   
   const tradeLevel = parseFloat(earningsData.tradeLevel);
   if (isNaN(tradeLevel)) return '';
   
   const tradeRec = earningsData.tradeRec.toUpperCase();
   
   // Green background: BUY/COVER and tradeLevel > currentPrice
   if ((tradeRec === 'BUY' || tradeRec === 'COVER') && tradeLevel > currentPrice) {
     return 'bg-green-100';
   }
   
   // Red background: SELL/SHORT and tradeLevel < currentPrice
   if ((tradeRec === 'SELL' || tradeRec === 'SHORT') && tradeLevel < currentPrice) {
     return 'bg-red-100';
   }
   
   return '';
 };

 // Check if ticker exists in the idea database
 const tickerInDatabase = allTickers ? allTickers.find(t => t.ticker.toUpperCase() === ticker.ticker.toUpperCase()) : null;

 // Handle ticker click
 const handleTickerClick = () => {
   if (tickerInDatabase && onNavigateToIdeaDetail) {
     onNavigateToIdeaDetail(tickerInDatabase);
   }
 };

 if (isEditing) {
   return (
     <tr className="bg-blue-50">
       <td className="px-2 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-blue-50 z-10" style={{ width: '60px' }}>
         {ticker.ticker}
       </td>
       <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500" style={{ width: '45px' }}>
         {ticker.analyst || '-'}
       </td>
       <td className="px-2 py-4 whitespace-nowrap" style={{ width: '70px' }}>
         <input
           type="date"
           value={editData.qpStartDate}
           onChange={(e) => setEditData({...editData, qpStartDate: e.target.value})}
           className="text-xs border border-gray-300 rounded px-1 py-1 w-full max-w-16"
           style={{ fontSize: '10px', padding: '2px 1px' }}
           title="QP Start Date - will update QP_Drift when saved"
         />
       </td>
       <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500" style={{ width: '45px' }}>
         <div className="text-center">-</div>
         <div className="text-xs text-gray-400">Calc</div>
       </td>
       <td className="px-2 py-4 whitespace-nowrap" style={{ width: '70px' }}>
         <input
           type="date"
           value={editData.quarterEndDate || ''}
           onChange={(e) => setEditData({...editData, quarterEndDate: e.target.value})}
           className="text-xs border border-gray-300 rounded px-1 py-1 w-full max-w-16"
           style={{ fontSize: '10px', padding: '2px 1px' }}
           placeholder="Auto-calculated"
         />
       </td>
       <td className="px-2 py-4 whitespace-nowrap" style={{ width: '70px' }}>
         <input
           type="date"
           value={editData.earningsDate}
           onChange={(e) => setEditData({...editData, earningsDate: e.target.value})}
           className="text-xs border border-gray-300 rounded px-1 py-1 w-full max-w-16"
           style={{ fontSize: '10px', padding: '2px 1px' }}
         />
       </td>
       <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500" style={{ width: '45px' }}>
         <div className="text-center">-</div>
         <div className="text-xs text-gray-400">N/A</div>
       </td>
       <td className="px-2 py-4 whitespace-nowrap" style={{ width: '60px' }}>
         <select
           value={editData.tradeRec}
           onChange={(e) => setEditData({...editData, tradeRec: e.target.value})}
           className="text-xs border border-gray-300 rounded px-1 py-1 w-full"
         >
           <option value="">-</option>
           <option value="SELL">SELL</option>
           <option value="HOLD">HOLD</option>
           <option value="BUY">BUY</option>
           <option value="SHORT">SHORT</option>
           <option value="COVER">COVER</option>
         </select>
       </td>
       <td className="px-2 py-4 whitespace-nowrap" style={{ width: '70px' }}>
         <input
           type="number"
           step="0.01"
           value={editData.tradeLevel}
           onChange={(e) => setEditData({...editData, tradeLevel: e.target.value})}
           className="text-xs border border-gray-300 rounded px-1 py-1"
           style={{ width: '65px' }}
           placeholder="1234.56"
         />
       </td>
       <td className="px-2 py-4 whitespace-nowrap" style={{ width: '70px' }}>
         <div className="flex flex-col space-y-1">
           <select
             value={editData.qpCallDate === 'N/A' ? 'N/A' : 'date'}
             onChange={(e) => {
               if (e.target.value === 'N/A') {
                 setEditData({...editData, qpCallDate: 'N/A'});
               } else {
                 setEditData({...editData, qpCallDate: editData.qpCallDate === 'N/A' ? '' : editData.qpCallDate});
               }
             }}
             className="text-xs border border-gray-300 rounded px-1 py-1 w-full"
             style={{ fontSize: '10px', padding: '1px' }}
           >
             <option value="date">Date</option>
             <option value="N/A">N/A</option>
           </select>
           {editData.qpCallDate !== 'N/A' && (
             <input
               type="date"
               value={editData.qpCallDate === 'N/A' ? '' : editData.qpCallDate}
               onChange={(e) => setEditData({...editData, qpCallDate: e.target.value})}
               className="text-xs border border-gray-300 rounded px-1 py-1 w-full"
               style={{ fontSize: '10px', padding: '2px 1px' }}
             />
           )}
         </div>
       </td>
       <td className="px-2 py-4 whitespace-nowrap" style={{ width: '70px' }}>
         <input
           type="date"
           value={editData.previewDate}
           onChange={(e) => setEditData({...editData, previewDate: e.target.value})}
           className="text-xs border border-gray-300 rounded px-1 py-1 w-full max-w-16"
           style={{ fontSize: '10px', padding: '2px 1px' }}
         />
       </td>
       <td className="px-2 py-4 whitespace-nowrap" style={{ width: '70px' }}>
         <input
           type="date"
           value={editData.callbackDate}
           onChange={(e) => setEditData({...editData, callbackDate: e.target.value})}
           className="text-xs border border-gray-300 rounded px-1 py-1 w-full max-w-16"
           style={{ fontSize: '10px', padding: '2px 1px' }}
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
   <>
     {/* IR Information Popup */}
     {showIRPopup && (
       <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
         <div className="relative top-10 mx-auto p-5 border max-w-sm w-full max-h-[90vh] overflow-y-auto shadow-lg rounded-md bg-white" style={{ width: '300px' }}>
           <div className="mt-3">
             <h3 className="text-lg font-medium text-gray-900 mb-4">
               Add IR Contact Information for {ticker.ticker}
             </h3>
             <div className="space-y-4">
               {/* Render contact forms based on contactCount */}
               {Array.from({ length: contactCount }, (_, index) => {
                 const contactNum = index + 1;
                 const nameField = contactNum === 1 ? 'irName' : `irName${contactNum}`;
                 const emailField = contactNum === 1 ? 'irEmail' : `irEmail${contactNum}`;
                 
                 return (
                   <div key={contactNum} className="border-b border-gray-200 pb-4 last:border-b-0">
                     <h4 className="text-sm font-medium text-gray-800 mb-3">
                       {contactNum === 1 ? 'Primary IR Contact' : `IR Contact ${contactNum}`}
                       {contactNum > 1 && (
                         <button
                           onClick={() => {
                             // Clear this contact's data
                             setIrData({
                               ...irData,
                               [nameField]: '',
                               [emailField]: ''
                             });
                             // If this is the last contact, reduce the count
                             if (contactNum === contactCount && contactNum > 1) {
                               setContactCount(contactCount - 1);
                             }
                           }}
                           className="ml-2 text-red-500 hover:text-red-700 text-xs"
                           title="Remove this contact"
                         >
                           ✕
                         </button>
                       )}
                     </h4>
                     <div className="grid grid-cols-1 gap-3">
                       <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">
                           Contact Name {contactNum === 1 && <span className="text-red-500">*</span>}
                         </label>
                         <input
                           type="text"
                           value={irData[nameField] || ''}
                           onChange={(e) => setIrData({...irData, [nameField]: e.target.value})}
                           className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                           placeholder="e.g., John Smith"
                           required={contactNum === 1}
                         />
                       </div>
                       <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">
                           Email Address {contactNum === 1 && <span className="text-red-500">*</span>}
                         </label>
                         <input
                           type="email"
                           value={irData[emailField] || ''}
                           onChange={(e) => setIrData({...irData, [emailField]: e.target.value})}
                           className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                           placeholder="e.g., ir@company.com"
                           required={contactNum === 1}
                         />
                       </div>
                     </div>
                   </div>
                 );
               })}
               
               {/* Add Another Contact Button */}
               {contactCount < 4 && (
                 <div className="flex justify-center pt-2">
                   <button
                     onClick={() => setContactCount(contactCount + 1)}
                     className="px-4 py-2 bg-green-100 text-green-700 rounded-md hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                   >
                     + Add Another Contact
                   </button>
                 </div>
               )}
             </div>
             
             <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200">
               <button
                 onClick={handleCancelIRPopup}
                 className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
               >
                 Cancel
               </button>
               <button
                 onClick={handleSaveIRData}
                 className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
               >
                 Save & Send Email
               </button>
             </div>
           </div>
         </div>
       </div>
     )}

     <tr className={`hover:bg-gray-50 ${getRowBackgroundColor()}`} onDoubleClick={() => setIsEditing(true)}>
     <td className={`px-2 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 z-10 ${getRowBackgroundColor() || 'bg-white'}`} style={{ width: '60px' }}>
       <div className="truncate" title={ticker.ticker}>
         {tickerInDatabase ? (
           <button
             onClick={handleTickerClick}
             className="text-blue-600 hover:text-blue-800 underline hover:no-underline font-medium"
             title="Click to view in Idea Detail"
           >
             {ticker.ticker}
           </button>
         ) : (
           <span className="text-gray-900">{ticker.ticker}</span>
         )}
       </div>
     </td>
     <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500" style={{ width: '45px' }}>
       <div className="truncate" title={ticker.analyst || '-'}>
         {ticker.analyst || '-'}
       </div>
     </td>
     <td className="px-2 py-4 whitespace-nowrap text-xs text-gray-500" style={{ width: '70px' }}>
       {(() => {
         // Calculate QP Start = quarter_end_date + QP_Drift days
         if (earningsData.quarterEndDate) {
           const quarterEndDate = new Date(earningsData.quarterEndDate);
           // Use QP_Drift from ticker, defaulting to -14 if not available
           const qpDrift = ticker.qpDrift !== undefined ? ticker.qpDrift : 
                          ticker.QP_Drift !== undefined ? ticker.QP_Drift : -14;
           const qpStartDate = new Date(quarterEndDate);
           qpStartDate.setDate(quarterEndDate.getDate() + qpDrift);
           return formatCompactDate ? formatCompactDate(qpStartDate.toISOString().split('T')[0]) : qpStartDate.toISOString().split('T')[0];
         }
         return '-';
       })()}
     </td>
     <td className="px-2 py-4 whitespace-nowrap text-sm" style={{ width: '45px' }}>
       {(() => {
         // Calculate QP Days = days from today to QP Start
         if (earningsData.quarterEndDate) {
           const quarterEndDate = new Date(earningsData.quarterEndDate);
           const qpDrift = ticker.qpDrift !== undefined ? ticker.qpDrift : 
                          ticker.QP_Drift !== undefined ? ticker.QP_Drift : -14;
           const qpStartDate = new Date(quarterEndDate);
           qpStartDate.setDate(quarterEndDate.getDate() + qpDrift);
           
           const today = new Date();
           today.setHours(0, 0, 0, 0);
           qpStartDate.setHours(0, 0, 0, 0);
           
           const diffTime = qpStartDate.getTime() - today.getTime();
           const qpDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
           
           return (
             <span className={`${
               qpDays <= 0 ? 'text-red-600 font-medium' :
               qpDays <= 7 ? 'text-orange-600 font-medium' :
               qpDays <= 30 ? 'text-yellow-600 font-medium' :
               'text-gray-900'
             }`}>
               {qpDays}
             </span>
           );
         }
         return '-';
       })()}
     </td>
     <td className="px-2 py-4 whitespace-nowrap text-xs text-gray-500" style={{ width: '70px' }}>
       {formatCompactDate ? formatCompactDate(earningsData.quarterEndDate) : (earningsData.quarterEndDate || '-')}
     </td>
     <td className="px-2 py-4 whitespace-nowrap text-xs text-gray-500" style={{ width: '70px' }}>
       {formatCompactDate ? formatCompactDate(earningsData.earningsDate) : (earningsData.earningsDate || '-')}
     </td>
     <td className="px-2 py-4 whitespace-nowrap text-sm" style={{ width: '45px' }}>
       <span className={`${
         daysUntilEarnings !== '-' && daysUntilEarnings <= 7 ? 'text-red-600 font-medium' :
         daysUntilEarnings !== '-' && daysUntilEarnings <= 30 ? 'text-yellow-600 font-medium' :
         'text-gray-900'
       }`}>
         {daysUntilEarnings}
       </span>
     </td>
     <td className="px-2 py-4 whitespace-nowrap text-sm" style={{ width: '60px' }}>
       {earningsData.tradeRec ? (
         <span className={`inline-flex px-1 py-1 text-xs font-semibold rounded-full ${
           earningsData.tradeRec === 'BUY' ? 'bg-green-100 text-green-800' :
           earningsData.tradeRec === 'SELL' ? 'bg-red-100 text-red-800' :
           earningsData.tradeRec === 'HOLD' ? 'bg-gray-100 text-gray-800' :
           earningsData.tradeRec === 'SHORT' ? 'bg-red-100 text-red-800' :
           earningsData.tradeRec === 'COVER' ? 'bg-green-100 text-green-800' :
           'bg-gray-100 text-gray-800'
         }`}>
           {earningsData.tradeRec}
         </span>
       ) : '-'}
     </td>
     <td className="px-2 py-4 whitespace-nowrap text-xs text-gray-900 text-right" style={{ width: '70px' }}>
       {earningsData.tradeLevel ? (
         <span>${formatTradeLevel ? formatTradeLevel(earningsData.tradeLevel) : earningsData.tradeLevel}</span>
       ) : '-'}
     </td>
     <td className="px-2 py-4 whitespace-nowrap text-xs text-gray-500" style={{ width: '70px' }}>
       {formatCompactDate ? formatCompactDate(earningsData.qpCallDate) : (earningsData.qpCallDate || '-')}
     </td>
     <td className="px-2 py-4 whitespace-nowrap text-xs text-gray-500" style={{ width: '70px' }}>
       {formatCompactDate ? formatCompactDate(earningsData.previewDate) : (earningsData.previewDate || '-')}
     </td>
     <td className="px-2 py-4 whitespace-nowrap text-xs text-gray-500" style={{ width: '70px' }}>
       {formatCompactDate ? formatCompactDate(earningsData.callbackDate) : (earningsData.callbackDate || '-')}
     </td>
     <td className="px-2 py-4 whitespace-nowrap text-sm" style={{ width: '140px' }}>
       <div className="flex space-x-1">
         <button
           onClick={composeQPCallEmail}
           className="text-green-600 hover:text-green-900 text-xs font-bold border border-green-500 px-1 py-1 rounded bg-green-50 hover:bg-green-100"
           title="Schedule QP Call"
         >
           QP
         </button>
         <button
           onClick={composeCallbackEmail}
           className="text-orange-600 hover:text-orange-900 text-xs font-bold border border-orange-500 px-1 py-1 rounded bg-orange-50 hover:bg-orange-100"
           title="Schedule Callback"
         >
           CB
         </button>
       </div>
     </td>
   </tr>
   </>
 );
};

// Todo List Page Component
const TodoListPage = ({ todos, deletedTodos = [], selectedTodoAnalyst, onSelectTodoAnalyst, onAddTodo, onUpdateTodo, onDeleteTodo, onRestoreTodo, onPermanentlyDeleteTodo, analysts, userRole, onRefreshTodos, currentUser, tickers, onNavigateToIdeaDetail, onNavigateToInputWithData, userDivision, activeTodoDivision, onSetActiveTodoDivision }) => {
  const [sortField, setSortField] = useState('dateEntered');
  const [sortDirection, setSortDirection] = useState('desc');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddCompletedForm, setShowAddCompletedForm] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [analystEmails, setAnalystEmails] = useState([]);
  const [newTodo, setNewTodo] = useState({
    ticker: '',
    analyst: '',
    priority: 'medium',
    item: ''
  });
  const [newCompletedTodo, setNewCompletedTodo] = useState({
    ticker: '',
    analyst: '',
    priority: 'medium',
    item: ''
  });
  const [todoTitleError, setTodoTitleError] = useState('');
  const [completedTitleError, setCompletedTitleError] = useState('');
  const isFirstMount = useRef(true);

  // Helper function to reset todo form with current user preselected
  const getInitialTodoState = () => ({
    ticker: '',
    analyst: currentUser ? AuthService.getUserAnalystCode(currentUser) : '',
    priority: 'medium',
    item: ''
  });

  // Update forms when currentUser changes
  useEffect(() => {
    if (currentUser) {
      const analystCode = AuthService.getUserAnalystCode(currentUser);
      if (analystCode) {
        setNewTodo(prev => ({ ...prev, analyst: analystCode }));
        setNewCompletedTodo(prev => ({ ...prev, analyst: analystCode }));
      }
    }
  }, [currentUser]);

  // Load analyst emails for individual todo emails
  useEffect(() => {
    const loadAnalystEmails = async () => {
      try {
        const emails = await DatabaseService.getAnalystEmails();
        setAnalystEmails(emails);
      } catch (error) {
        console.error('Error loading analyst emails for todos:', error);
      }
    };
    
    loadAnalystEmails();
  }, []);

  // Get filtered analysts based on user division - memoized to prevent infinite loops
  const filteredAnalysts = useMemo(() => {
    if (!analystEmails || analystEmails.length === 0) {
      return analysts; // Fallback to basic analyst codes
    }
    
    // Check if analyst emails have division data
    const firstEmail = analystEmails[0];
    if (!firstEmail.hasOwnProperty('division')) {
      return analysts;
    }
    
    let divisionsToInclude = [];
    if (userDivision === 'Super') {
      // Super users see analysts based on the active todo division
      if (activeTodoDivision === 'Ops') {
        divisionsToInclude = ['Ops', 'Super'];
      } else {
        divisionsToInclude = ['Investment', 'Super'];
      }
    } else if (userDivision === 'Ops') {
      // Ops users see Ops and Super analysts
      divisionsToInclude = ['Ops', 'Super'];
    } else {
      // Investment, Admin, Marketing see Investment and Super analysts
      divisionsToInclude = ['Investment', 'Super'];
    }
    
    const filtered = analystEmails
      .filter(email => divisionsToInclude.includes(email.division))
      .map(email => email.analyst_code)
      .filter(code => code && code.trim() !== ''); // Filter out empty codes
    
    // If no filtered results, fall back to all analysts
    if (filtered.length === 0) {
      return analysts;
    }
    
    return filtered;
  }, [analystEmails, userDivision, activeTodoDivision, analysts]);

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

  // Refresh todos when division changes (for Super users)
  useEffect(() => {
    if (!isFirstMount.current && userDivision === 'Super') {
      onRefreshTodos();
    }
  }, [activeTodoDivision, onRefreshTodos, userDivision]);

  // Note: Global auto-refresh (15 minutes) is handled at the app level in ClearlineFlow component
  // This component-level refresh has been removed to avoid duplicate refreshes

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

  // Filter deleted todos by selected analyst (similar to filteredTodos)
  const filteredDeletedTodos = selectedTodoAnalyst 
    ? deletedTodos.filter(todo => todo.analyst === selectedTodoAnalyst)
    : deletedTodos;

  // Drag and drop state
  const [draggedTodoId, setDraggedTodoId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Sort function - when analyst is selected, use sortOrder for custom ranking
  const sortTodos = (todosToSort) => {
    // When an analyst is selected, always sort by sortOrder (custom ranking)
    if (selectedTodoAnalyst) {
      return [...todosToSort].sort((a, b) => {
        const aOrder = a.sortOrder ?? 999999;
        const bOrder = b.sortOrder ?? 999999;
        return aOrder - bOrder;
      });
    }
    
    // When no analyst is selected, use the standard sorting
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

  // Handle drag start
  const handleDragStart = (e, todoId) => {
    if (!selectedTodoAnalyst) return; // Only allow dragging when filtered by analyst
    setDraggedTodoId(todoId);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', todoId);
  };

  // Handle drag over
  const handleDragOver = (e, todoId) => {
    if (!selectedTodoAnalyst || !draggedTodoId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Handle drop - reorder todos
  const handleDrop = async (e, targetTodoId) => {
    e.preventDefault();
    if (!selectedTodoAnalyst || !draggedTodoId || draggedTodoId === targetTodoId) {
      setDraggedTodoId(null);
      setIsDragging(false);
      return;
    }

    // Get the sorted open todos for this analyst
    const sortedTodos = sortTodos(openTodos);
    const draggedIndex = sortedTodos.findIndex(t => t.id === draggedTodoId);
    const targetIndex = sortedTodos.findIndex(t => t.id === targetTodoId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTodoId(null);
      setIsDragging(false);
      return;
    }

    // Create new order
    const reorderedTodos = [...sortedTodos];
    const [draggedTodo] = reorderedTodos.splice(draggedIndex, 1);
    reorderedTodos.splice(targetIndex, 0, draggedTodo);

    // Calculate new sort orders
    const todoUpdates = reorderedTodos.map((todo, index) => ({
      id: todo.id,
      sortOrder: index + 1
    }));

    try {
      // Save to database
      await DatabaseService.updateTodoSortOrders(todoUpdates);
      
      // Refresh todos to get updated data
      if (onRefreshTodos) {
        await onRefreshTodos();
      }
    } catch (error) {
      console.error('Error reordering todos:', error);
      alert('Failed to save todo order');
    }

    setDraggedTodoId(null);
    setIsDragging(false);
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedTodoId(null);
    setIsDragging(false);
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Todo List</h1>
          {/* Division tabs for Super users */}
          {userDivision === 'Super' && (
            <div className="mt-2 flex space-x-1">
              <button
                onClick={() => onSetActiveTodoDivision('Investment')}
                className={`px-3 py-1 text-sm font-medium rounded-md ${
                  activeTodoDivision === 'Investment'
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Investment Todos
              </button>
              <button
                onClick={() => onSetActiveTodoDivision('Ops')}
                className={`px-3 py-1 text-sm font-medium rounded-md ${
                  activeTodoDivision === 'Ops'
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Ops Todos
              </button>
            </div>
          )}
        </div>
        
        {/* Primary Action Buttons - Prominent */}
        {(userRole === 'readwrite' || userRole === 'admin') && (
          <div className="flex space-x-3">
            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                setShowAddCompletedForm(false);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg text-sm font-semibold flex items-center shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 min-w-[140px] justify-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              Add Todo
            </button>
            <button
              onClick={() => {
                setShowAddCompletedForm(!showAddCompletedForm);
                setShowAddForm(false);
              }}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg text-sm font-semibold flex items-center shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 min-w-[140px] justify-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              Add Completed
            </button>
          </div>
        )}
      </div>
      
      {/* Secondary Utility Buttons - Less prominent */}
      <div className="flex justify-end items-center">
        <div className="flex space-x-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md bg-white hover:bg-gray-50 min-w-[100px] justify-center transition-all duration-200 ${
              isRefreshing 
                ? 'text-gray-400 cursor-not-allowed' 
                : 'text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 hover:shadow-sm'
            }`}
          >
            {isRefreshing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
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
                
                // Add ranked ideas section at the top (only when filtering by a specific analyst)
                if (selectedTodoAnalyst) {
                  const rankedTickers = tickers
                    .filter(t => t.analyst === selectedTodoAnalyst && t.rank !== null && t.rank !== undefined)
                    .sort((a, b) => a.rank - b.rank);
                  
                  emailBody += `
                    <!-- Ranked Ideas Section -->
                    <tr>
                      <td style="padding: 15px; background-color: #fff8e1; border-bottom: 2px solid #ffc107;">
                        <h2 style="margin: 0 0 10px 0; color: #333; font-size: 18px; font-weight: bold;">⭐ Ranked Names - Current Work</h2>`;
                  
                  if (rankedTickers.length > 0) {
                    rankedTickers.forEach((ticker) => {
                      emailBody += `
                        <div style="padding: 8px 0; border-bottom: 1px solid #ffe082;">
                          <span style="font-weight: bold; font-size: 16px; color: #0066cc; margin-right: 10px;">#${ticker.rank}</span>
                          <span style="font-weight: bold; font-size: 16px;">${ticker.ticker}</span>
                          ${ticker.name ? `<span style="color: #666; font-size: 14px;"> - ${ticker.name}</span>` : ''}
                        </div>`;
                    });
                  } else {
                    emailBody += `
                        <p style="color: #666; font-size: 14px; margin: 0;">No ideas are currently ranked for this analyst.</p>`;
                  }
                  
                  emailBody += `
                      </td>
                    </tr>`;
                }
                
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
            className={`inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md bg-white hover:bg-gray-50 min-w-[100px] justify-center transition-all duration-200 ${
              isEmailSending 
                ? 'text-gray-400 cursor-not-allowed' 
                : 'text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 hover:shadow-sm'
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
                  head: [[
                    activeTodoDivision === 'Ops' ? 'Title' : 'Ticker', 
                    activeTodoDivision === 'Ops' ? 'Employee' : 'Analyst', 
                    'Date Entered', 'Days Since', 'Priority', 'Item'
                  ]],
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
                  head: [[
                    activeTodoDivision === 'Ops' ? 'Title' : 'Ticker', 
                    activeTodoDivision === 'Ops' ? 'Employee' : 'Analyst', 
                    'Date Entered', 'Date Closed', 'Priority', 'Item'
                  ]],
                  body: closedTableData,
                  styles: { fontSize: 8 },
                  headStyles: { fillColor: [34, 197, 94] }
                });
              }
              
              doc.save(`todo-list-${selectedTodoAnalyst || 'all'}-${new Date().toISOString().split('T')[0]}.pdf`);
            }}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md bg-white hover:bg-gray-50 min-w-[100px] justify-center transition-all duration-200 text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 hover:shadow-sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </button>
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
          <option value="">All</option>
          {filteredAnalysts.map(analyst => (
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
              setNewTodo(getInitialTodoState());
              setShowAddForm(false);
            } catch (error) {
              console.error('Error adding todo:', error);
            }
          }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {activeTodoDivision === 'Ops' ? 'Title' : 'Ticker'}
              </label>
              <input
                type="text"
                value={newTodo.ticker}
                maxLength={20}
                onChange={(e) => {
                  const value = e.target.value.toUpperCase();
                  if (value.length === 20) {
                    setTodoTitleError('Max 20 characters reached');
                  } else {
                    setTodoTitleError('');
                  }
                  setNewTodo({ ...newTodo, ticker: value });
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                aria-invalid={todoTitleError ? 'true' : 'false'}
                aria-describedby="todo-title-error"
                required
              />
              {todoTitleError && (
                <p id="todo-title-error" className="mt-1 text-xs text-red-600">{todoTitleError}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {activeTodoDivision === 'Ops' ? 'Employee' : 'Analyst'}
              </label>
              <select
                value={newTodo.analyst}
                onChange={(e) => setNewTodo({...newTodo, analyst: e.target.value})}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
 page                required
              >
                <option value="">
                  {activeTodoDivision === 'Ops' ? 'Select Employee' : 'Select Analyst'}
                </option>
                {filteredAnalysts.map(analyst => (
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

      {/* Add Completed Todo Form */}
      {showAddCompletedForm && (userRole === 'readwrite' || userRole === 'admin') && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium mb-4">Add Completed Todo</h3>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!newCompletedTodo.ticker || !newCompletedTodo.analyst || !newCompletedTodo.item) return;
            
            try {
              // Add todo with isOpen set to false and dateClosed set to current timestamp
              await onAddTodo({ 
                ...newCompletedTodo, 
                isOpen: false,
                dateClosed: new Date().toISOString()
              });
              setNewCompletedTodo(getInitialTodoState());
              setShowAddCompletedForm(false);
            } catch (error) {
              console.error('Error adding completed todo:', error);
            }
          }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {activeTodoDivision === 'Ops' ? 'Title' : 'Ticker'}
              </label>
              <input
                type="text"
                value={newCompletedTodo.ticker}
                maxLength={20}
                onChange={(e) => {
                  const value = e.target.value.toUpperCase();
                  if (value.length === 20) {
                    setCompletedTitleError('Max 20 characters reached');
                  } else {
                    setCompletedTitleError('');
                  }
                  setNewCompletedTodo({ ...newCompletedTodo, ticker: value });
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                aria-invalid={completedTitleError ? 'true' : 'false'}
                aria-describedby="completed-title-error"
                required
              />
              {completedTitleError && (
                <p id="completed-title-error" className="mt-1 text-xs text-red-600">{completedTitleError}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {activeTodoDivision === 'Ops' ? 'Employee' : 'Analyst'}
              </label>
              <select
                value={newCompletedTodo.analyst}
                onChange={(e) => setNewCompletedTodo({...newCompletedTodo, analyst: e.target.value})}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                required
              >
                <option value="">
                  {activeTodoDivision === 'Ops' ? 'Select Employee' : 'Select Analyst'}
                </option>
                {filteredAnalysts.map(analyst => (
                  <option key={analyst} value={analyst}>{analyst}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={newCompletedTodo.priority}
                onChange={(e) => setNewCompletedTodo({...newCompletedTodo, priority: e.target.value})}
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
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  Add Completed
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddCompletedForm(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Item Description</label>
              <textarea
                value={newCompletedTodo.item}
                onChange={(e) => setNewCompletedTodo({...newCompletedTodo, item: e.target.value})}
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Open Todos ({openTodos.length})
          </h2>
          {selectedTodoAnalyst && openTodos.length > 1 && (
            <span className="text-sm text-gray-500 flex items-center">
              <span className="mr-1">⋮⋮</span> Drag to reorder todos
            </span>
          )}
        </div>
        {openTodos.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No open todos found.</p>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {activeTodoDivision === 'Ops' ? 'Title' : 'Ticker'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Analyst</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Entered</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days Since</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
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
                    tickers={tickers}
                    onNavigateToIdeaDetail={onNavigateToIdeaDetail}
                    onNavigateToInputWithData={onNavigateToInputWithData}
                    analystEmails={analystEmails}
                    currentUser={currentUser}
                    activeTodoDivision={activeTodoDivision}
                    isDraggable={!!selectedTodoAnalyst}
                    isDragging={draggedTodoId === todo.id}
                    onDragStart={(e) => handleDragStart(e, todo.id)}
                    onDragOver={(e) => handleDragOver(e, todo.id)}
                    onDrop={(e) => handleDrop(e, todo.id)}
                    onDragEnd={handleDragEnd}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {activeTodoDivision === 'Ops' ? 'Title' : 'Ticker'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Analyst</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Entered</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Closed</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
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
                    tickers={tickers}
                    onNavigateToIdeaDetail={onNavigateToIdeaDetail}
                    onNavigateToInputWithData={onNavigateToInputWithData}
                    analystEmails={analystEmails}
                    currentUser={currentUser}
                    activeTodoDivision={activeTodoDivision}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recently Deleted Todos Section */}
      {filteredDeletedTodos.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Recently Deleted Todos - Last 7 Days ({filteredDeletedTodos.length})
          </h2>
          <div className="bg-white shadow overflow-hidden sm:rounded-md border-l-4 border-red-300">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-red-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {activeTodoDivision === 'Ops' ? 'Title' : 'Ticker'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Analyst</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Entered</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Deleted</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                  {(userRole === 'readwrite' || userRole === 'admin') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDeletedTodos.map((todo) => (
                  <tr key={todo.id} className="bg-red-50 bg-opacity-30">
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
                      {formatDate(todo.deletedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        todo.priority === 'high' ? 'bg-red-100 text-red-800' :
                        todo.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {todo.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-md truncate">
                      {todo.item}
                    </td>
                    {(userRole === 'readwrite' || userRole === 'admin') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => onRestoreTodo(todo.id)}
                          className="text-green-600 hover:text-green-900 text-xs font-medium border border-green-500 px-2 py-1 rounded bg-green-50 hover:bg-green-100"
                          title="Restore this todo"
                        >
                          Restore
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

// Todo Row Component with double-click editing
const TodoRow = ({ todo, onUpdateTodo, onDeleteTodo, calculateDaysSinceEntered, formatDate, userRole, hasWriteAccess, isClosed = false, tickers, onNavigateToIdeaDetail, onNavigateToInputWithData, analystEmails = [], currentUser, activeTodoDivision, isDraggable = false, isDragging = false, onDragStart, onDragOver, onDrop, onDragEnd }) => {
  const [editingField, setEditingField] = useState(null); // 'ticker', 'priority' or 'item'
  const [editValue, setEditValue] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);

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

  // Check if ticker exists in the idea database
  const tickerInDatabase = tickers ? tickers.find(t => t.ticker.toUpperCase() === todo.ticker.toUpperCase()) : null;

  // Handle ticker click
  const handleTickerClick = () => {
    if (tickerInDatabase && onNavigateToIdeaDetail) {
      onNavigateToIdeaDetail(tickerInDatabase);
    }
  };

  // Handle email sending for individual todo
  const handleSendTodoEmail = async () => {
    if (isEmailSending) return;

    try {
      setIsEmailSending(true);

      // Find the analyst's email
      const analystInfo = analystEmails.find(analyst => 
        analyst.analyst_code === todo.analyst
      );

      if (!analystInfo || !analystInfo.email) {
        alert(`No email found for analyst: ${todo.analyst}`);
        return;
      }

      // Format the current date
      const emailDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Create email content
      const emailBody = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .content { background: white; padding: 20px; border-radius: 8px; border: 1px solid #dee2e6; }
            .priority-high { color: #dc3545; font-weight: bold; }
            .priority-medium { color: #ffc107; font-weight: bold; }
            .priority-low { color: #28a745; font-weight: bold; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>📋 New Todo Item Added to Your List</h2>
            <p>Hello ${analystInfo.name || todo.analyst},</p>
            <p>This item was recently added to your to-do list and requires your attention.</p>
          </div>
          
          <div class="content">
            <h3>Todo Details:</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #dee2e6; font-weight: bold; width: 120px;">Ticker:</td>
                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${todo.ticker}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #dee2e6; font-weight: bold;">Analyst:</td>
                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${todo.analyst}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #dee2e6; font-weight: bold;">Priority:</td>
                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">
                  <span class="priority-${todo.priority}">${todo.priority.toUpperCase()}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #dee2e6; font-weight: bold;">Date Entered:</td>
                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${formatDate(todo.dateEntered)}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; vertical-align: top;">Task:</td>
                <td style="padding: 8px;">${todo.item}</td>
              </tr>
            </table>
          </div>
          
          <div class="footer">
            <p>This email was sent from the Clearline Flow Todo Management System.</p>
            <p>Generated on ${emailDate}</p>
          </div>
        </body>
        </html>
      `;

      const subject = `📋 New Todo Item - ${todo.ticker} - ${todo.priority.toUpperCase()} Priority`;
      const fromName = currentUser ? AuthService.getUserFullName(currentUser) : 'Clearline Flow App';
      const fromEmail = currentUser?.email || null;

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: [analystInfo.email],
          subject: subject,
          content: emailBody,
          fromName: fromName,
          fromEmail: fromEmail
        })
      });

      if (response.ok) {
        alert(`✅ Todo email sent successfully to ${analystInfo.name} (${analystInfo.email})`);
      } else {
        const errorData = await response.text();
        throw new Error(`Failed to send email: ${errorData}`);
      }
    } catch (error) {
      console.error('Error sending todo email:', error);
      alert(`❌ Failed to send email: ${error.message}`);
    } finally {
      setIsEmailSending(false);
    }
  };

  return (
    <tr 
      className={`${isClosed ? 'bg-white' : ''} ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'opacity-50 bg-blue-50' : ''}`}
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        <div className="flex items-center gap-2">
          {isDraggable && (
            <span className="text-gray-400 mr-1" title="Drag to reorder">⋮⋮</span>
          )}
          {editingField === 'ticker' ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyPress={handleKeyPress}
              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          ) : (
            <>
              {tickerInDatabase ? (
                <button
                  onClick={handleTickerClick}
                  onDoubleClick={() => handleDoubleClick('ticker', todo.ticker)}
                  className="text-blue-600 hover:text-blue-800 underline hover:no-underline font-medium"
                  title="Click to view in Idea Detail, Double-click to edit"
                >
                  {todo.ticker}
                </button>
              ) : (
                <>
                  <span 
                    className="text-gray-900 cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded"
                    onDoubleClick={() => handleDoubleClick('ticker', todo.ticker)}
                    title="Double-click to edit"
                  >
                    {todo.ticker}
                  </span>
                  {(userRole === 'readwrite' || userRole === 'admin') && onNavigateToInputWithData && todo.ticker.length <= 6 && activeTodoDivision !== 'Ops' && (
                    <button
                      onClick={() => onNavigateToInputWithData(todo.ticker, todo.analyst)}
                      className="px-2 py-1 text-xs border border-blue-300 text-blue-600 rounded hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                      title="Add this ticker to Idea Database"
                    >
                      Add
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
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
            <button
              onClick={handleSendTodoEmail}
              disabled={isEmailSending}
              className={`text-xs font-bold border px-2 py-1 rounded ${
                isEmailSending
                  ? 'text-gray-400 border-gray-300 cursor-not-allowed'
                  : 'text-blue-600 hover:text-blue-900 border-blue-500 hover:bg-blue-50'
              }`}
              title={`Send email to ${todo.analyst} about this todo`}
            >
              {isEmailSending ? '📧...' : '📧'}
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
        {ticker?.currentPrice ? formatPriceWithCurrency(ticker.currentPrice, ticker) : '-'}
        {hasError && (
          <div className="text-xs text-red-500">Quote error</div>
        )}
      </div>
    );
  }
  
  return (
    <div className="text-sm">
      <div className="font-medium text-gray-900 flex items-center">
        {formatPriceWithCurrency(quote.price, ticker)}
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
const PMDetailPage = ({ tickers, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors, onNavigateToIdeaDetail }) => {
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
               field === 'thesis' ? '300px' : '45px' 
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
                <SortableHeader field="thesis" style={{ width: '300px' }}>Thesis</SortableHeader>
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
                          <button
                            onClick={() => onNavigateToIdeaDetail && onNavigateToIdeaDetail(ticker)}
                            className="text-blue-600 hover:text-blue-800 underline hover:no-underline font-medium"
                            title="Click to view in Idea Detail"
                          >
                            {ticker.ticker}
                          </button>
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
                        {ticker.ptBear ? formatPriceWithCurrency(ticker.ptBear, ticker.ticker) : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '45px' }}>
                        <span className={getPercentColor(bearPercent)}>
                          {bearPercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '60px' }}>
                        {ticker.ptBase ? formatPriceWithCurrency(ticker.ptBase, ticker.ticker) : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '45px' }}>
                        <span className={getPercentColor(basePercent)}>
                          {basePercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-900" style={{ width: '60px' }}>
                        {ticker.ptBull ? formatPriceWithCurrency(ticker.ptBull, ticker.ticker) : '-'}
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-xs" style={{ width: '45px' }}>
                        <span className={getPercentColor(bullPercent)}>
                          {bullPercent || '-'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-sm text-gray-900" style={{ width: '300px' }}>
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

// Idea Detail Page Component - Shows detailed view of a single ticker
const IdeaDetailPage = ({ tickers, selectedTicker, onSelectTicker, onUpdateSelectedTicker, onUpdate, analysts, quotes, onUpdateQuote, isLoadingQuotes, quoteErrors, formatMarketCap, formatVolumeDollars, currentUser, onNavigateBack }) => {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const lastUpdatedTickerRef = useRef(null);
  
  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [analystEmails, setAnalystEmails] = useState([]);

  // Fetch analyst emails on component mount
  useEffect(() => {
    const loadAnalystEmails = async () => {
      try {
        const emails = await DatabaseService.getAnalystEmails();
        setAnalystEmails(emails);
      } catch (error) {
        console.error('Error loading analyst emails:', error);
      }
    };
    
    loadAnalystEmails();
  }, []);

  // Handle email modal
  const handleOpenEmailModal = () => {
    setShowEmailModal(true);
    // Pre-select current user and Marc Majzner based on analyst emails
    const defaultRecipients = [];
    
    // Find Marc Majzner in analyst emails (assuming MM initials or mmajzner email)
    const marcProfile = analystEmails.find(analyst => 
      analyst.email === 'mmajzner@clearlinecap.com' || 
      analyst.analyst_code === 'MM' ||
      analyst.name?.toLowerCase().includes('marc majzner')
    );
    if (marcProfile) {
      defaultRecipients.push(marcProfile.email);
    }
    
    // Add current user if different
    if (currentUser?.email && !defaultRecipients.includes(currentUser.email)) {
      defaultRecipients.push(currentUser.email);
    }
    
    setSelectedRecipients(defaultRecipients);
  };

  const handleCloseEmailModal = () => {
    setShowEmailModal(false);
    setSelectedRecipients([]);
  };

  const handleRecipientToggle = (email) => {
    setSelectedRecipients(prev => 
      prev.includes(email) 
        ? prev.filter(e => e !== email)
        : [...prev, email]
    );
  };

  const handleSendEmail = async () => {
    if (selectedRecipients.length === 0) {
      alert('Please select at least one recipient.');
      return;
    }

    setIsEmailSending(true);
    try {
      // Create email content
      const emailDate = new Date().toLocaleDateString();
      const quote = quotes[selectedTicker.ticker.replace(' US', '')];
      const currentPrice = quote?.price ? parseFloat(quote.price).toFixed(2) : 
                          (selectedTicker.currentPrice ? parseFloat(selectedTicker.currentPrice).toFixed(2) : 'N/A');

      // Calculate price target percentages
      const calculatePercentage = (ptValue, currentPrice) => {
        if (!ptValue || !currentPrice) return '';
        const pt = parseFloat(ptValue);
        const current = parseFloat(currentPrice);
        if (isNaN(pt) || isNaN(current) || current === 0) return '';
        
        const percentage = selectedTicker.lsPosition === 'Short' ? 
          ((current - pt) / current) * 100 : 
          ((pt - current) / current) * 100;
        
        return percentage >= 0 ? `+${percentage.toFixed(1)}%` : `${percentage.toFixed(1)}%`;
      };

      const emailBody = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Investment Idea Detail - ${selectedTicker.ticker}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
          
          <div style="text-align: center; margin-bottom: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
            <h1 style="color: #1f2937; margin: 0;">Investment Idea Detail</h1>
            <h2 style="color: #3b82f6; margin: 10px 0;">${selectedTicker.ticker} - ${selectedTicker.name || 'N/A'}</h2>
            <p style="margin: 5px 0; color: #6b7280;">Generated on ${emailDate}</p>
          </div>

          <div style="background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Basic Information</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #6b7280; width: 30%;">Ticker:</td>
                <td style="padding: 8px;">${selectedTicker.ticker}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #6b7280;">Company Name:</td>
                <td style="padding: 8px;">${selectedTicker.name || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #6b7280;">L/S Position:</td>
                <td style="padding: 8px;"><span style="background-color: ${selectedTicker.lsPosition === 'Long' ? '#dcfce7' : '#fee2e2'}; color: ${selectedTicker.lsPosition === 'Long' ? '#166534' : '#dc2626'}; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${selectedTicker.lsPosition}</span></td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #6b7280;">Priority:</td>
                <td style="padding: 8px;"><span style="background-color: ${selectedTicker.priority === 'A' ? '#fee2e2' : selectedTicker.priority === 'B' ? '#fef3c7' : '#dbeafe'}; color: ${selectedTicker.priority === 'A' ? '#dc2626' : selectedTicker.priority === 'B' ? '#d97706' : '#2563eb'}; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${selectedTicker.priority}</span></td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #6b7280;">Status:</td>
                <td style="padding: 8px;"><span style="background-color: ${selectedTicker.status === 'Portfolio' ? '#dcfce7' : selectedTicker.status === 'Current' ? '#dbeafe' : selectedTicker.status === 'New' ? '#f3e8ff' : selectedTicker.status === 'On-Deck' ? '#fef3c7' : '#f3f4f6'}; color: ${selectedTicker.status === 'Portfolio' ? '#166534' : selectedTicker.status === 'Current' ? '#2563eb' : selectedTicker.status === 'New' ? '#7c3aed' : selectedTicker.status === 'On-Deck' ? '#d97706' : '#6b7280'}; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${selectedTicker.status}</span></td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #6b7280;">Analyst:</td>
                <td style="padding: 8px;">${selectedTicker.analyst || 'N/A'}</td>
              </tr>
            </table>
          </div>

          <div style="background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Financial Data</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #6b7280; width: 30%;">Current Price:</td>
                <td style="padding: 8px;">$${currentPrice}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #6b7280;">Input Price:</td>
                <td style="padding: 8px;">${selectedTicker.inputPrice ? formatPriceWithCurrency(selectedTicker.inputPrice, selectedTicker.ticker) : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #6b7280;">PT Bear:</td>
                <td style="padding: 8px;">${selectedTicker.ptBear ? `${formatPriceWithCurrency(selectedTicker.ptBear, selectedTicker.ticker)} ${calculatePercentage(selectedTicker.ptBear, currentPrice)}` : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #6b7280;">PT Base:</td>
                <td style="padding: 8px;">${selectedTicker.ptBase ? `${formatPriceWithCurrency(selectedTicker.ptBase, selectedTicker.ticker)} ${calculatePercentage(selectedTicker.ptBase, currentPrice)}` : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #6b7280;">PT Bull:</td>
                <td style="padding: 8px;">${selectedTicker.ptBull ? `${formatPriceWithCurrency(selectedTicker.ptBull, selectedTicker.ticker)} ${calculatePercentage(selectedTicker.ptBull, currentPrice)}` : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #6b7280;">Market Cap:</td>
                <td style="padding: 8px;">${selectedTicker.marketCap ? `$${formatMarketCap(selectedTicker.marketCap)}mm` : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #6b7280;">ADV 3 Month:</td>
                <td style="padding: 8px;">${selectedTicker.adv3Month ? `$${formatVolumeDollars(selectedTicker.adv3Month)}mm` : 'N/A'}</td>
              </tr>
            </table>
          </div>

          ${selectedTicker.thesis ? `
          <div style="background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Investment Thesis</h3>
            <p style="white-space: pre-wrap; margin: 0;">${selectedTicker.thesis}</p>
          </div>
          ` : ''}

          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 15px; text-align: center; margin-top: 30px;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">
              Generated by <strong>Clearline Flow</strong><br>
              ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
            </p>
          </div>
          
        </body>
        </html>
      `;

      const subject = `Investment Idea Detail - ${selectedTicker.ticker} - ${emailDate}`;
      const fromName = currentUser ? AuthService.getUserFullName(currentUser) : 'Clearline Flow App';
      const fromEmail = currentUser?.email || null;

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: selectedRecipients,
          subject: subject,
          content: emailBody,
          fromName: fromName,
          fromEmail: fromEmail
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ Email sent successfully to ${selectedRecipients.length} recipient(s)!`);
        handleCloseEmailModal();
      } else {
        throw new Error(result.error || 'Failed to send email');
      }
    } catch (error) {
      console.error('Error sending email:', error);
      alert(`❌ Failed to send email: ${error.message}`);
    } finally {
      setIsEmailSending(false);
    }
  };

  // Keep selectedTicker in sync with tickers array updates (without affecting navigation)
  useEffect(() => {
    if (selectedTicker && tickers.length > 0 && onUpdateSelectedTicker) {
      const updatedTicker = tickers.find(t => t.id === selectedTicker.id);
      if (updatedTicker && JSON.stringify(updatedTicker) !== JSON.stringify(selectedTicker)) {
        onUpdateSelectedTicker(updatedTicker);
      }
    }
  }, [tickers, selectedTicker, onUpdateSelectedTicker]);

  // Update quote when ticker is first selected to ensure current price is fresh
  useEffect(() => {
    if (selectedTicker && onUpdateQuote && selectedTicker.id !== lastUpdatedTickerRef.current) {
      const cleanSymbol = selectedTicker.ticker.replace(' US', '');
      console.log(`🔄 Updating quote for ${cleanSymbol} on ticker selection`);
      onUpdateQuote(cleanSymbol);
      lastUpdatedTickerRef.current = selectedTicker.id;
    }
  }, [selectedTicker, onUpdateQuote]); // Now we can safely depend on selectedTicker since we track updates with ref

  // If no ticker is selected, show ticker selection
  if (!selectedTicker) {
    // Sort tickers alphabetically by ticker symbol
    const sortedTickers = [...tickers].sort((a, b) => a.ticker.localeCompare(b.ticker));
    
    return (
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-5">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Select a Ticker for Detailed View
          </h3>
          
          {tickers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No tickers available.</p>
            </div>
          ) : (
            <div className="max-w-md">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Choose a ticker:
              </label>
              <select
                onChange={(e) => {
                  const selectedTickerId = e.target.value;
                  if (selectedTickerId) {
                    const ticker = tickers.find(t => t.id.toString() === selectedTickerId);
                    onSelectTicker(ticker);
                  }
                }}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                defaultValue=""
              >
                <option value="">Select a ticker...</option>
                {sortedTickers.map((ticker) => (
                  <option key={ticker.id} value={ticker.id}>
                    {ticker.ticker} - {ticker.name} ({ticker.analyst})
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm text-gray-500">
                {tickers.length} ideas available
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const ticker = selectedTicker;
  const quote = quotes[ticker.ticker] || {};

  // Handle field editing
  const handleDoubleClick = (field, currentValue) => {
    if (!onUpdate) return;
    
    // Handle boolean fields - toggle directly
    if (typeof currentValue === 'boolean') {
      handleToggleBoolean(field, currentValue);
      return;
    }
    
    setEditingField(field);
    setEditValue(currentValue || '');
  };

  const handleToggleBoolean = async (field, currentValue) => {
    try {
      await onUpdate(ticker.id, { [field]: !currentValue });
    } catch (error) {
      console.error('Error toggling boolean field:', error);
    }
  };

  const handleSaveEdit = async () => {
    if (editingField && editValue !== ticker[editingField]) {
      try {
        await onUpdate(ticker.id, { [editingField]: editValue });
      } catch (error) {
        console.error('Error updating ticker:', error);
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

  // Render field component
  const renderField = (label, field, value, type = 'text') => {
    const isEditing = editingField === field;
    const isBoolean = typeof value === 'boolean';
    const displayValue = value || '-';

    return (
      <div className="py-3 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <dt className="text-sm font-medium text-gray-500 w-1/3">{label}</dt>
          <dd className="text-sm text-gray-900 w-2/3">
            {isEditing ? (
              type === 'textarea' ? (
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSaveEdit}
                  onKeyDown={handleKeyPress}
                  autoFocus
                  rows={3}
                  className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : type === 'select' ? (
                <select
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSaveEdit}
                  onKeyDown={handleKeyPress}
                  autoFocus
                  className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {field === 'lsPosition' && (
                    <>
                      <option value="Long">Long</option>
                      <option value="Short">Short</option>
                    </>
                  )}
                  {field === 'priority' && (
                    <>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                    </>
                  )}
                  {field === 'status' && (
                    <>
                      <option value="New">New</option>
                      <option value="Portfolio">Portfolio</option>
                      <option value="Current">Current</option>
                      <option value="On-Deck">On-Deck</option>
                      <option value="Old">Old</option>
                    </>
                  )}
                  {field === 'analyst' && (
                    <>
                      <option value="">TBD</option>
                      {analysts.map(analyst => (
                        <option key={analyst} value={analyst}>{analyst}</option>
                      ))}
                    </>
                  )}
                  {field === 'valueOrGrowth' && (
                    <>
                      <option value="">Select...</option>
                      <option value="Value">Value</option>
                      <option value="Growth">Growth</option>
                    </>
                  )}
                </select>
              ) : (
                <input
                  type={type}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSaveEdit}
                  onKeyDown={handleKeyPress}
                  autoFocus
                  className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )
            ) : isBoolean ? (
              <button
                onClick={() => handleDoubleClick(field, value)}
                disabled={!onUpdate}
                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  value 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                } ${onUpdate ? 'hover:bg-opacity-80 cursor-pointer' : ''}`}
              >
                {value ? 'Yes' : 'No'}
              </button>
            ) : (
              <span
                onClick={() => handleDoubleClick(field, value)}
                className={`${onUpdate ? 'cursor-pointer hover:bg-gray-50 rounded px-1' : ''}`}
                title={onUpdate ? 'Double-click to edit' : ''}
              >
                {displayValue}
              </span>
            )}
          </dd>
        </div>
      </div>
    );
  };

  // Render field component for styled sections (catalysts, characteristics, themes)
  const renderBooleanFieldInSection = (label, field, value) => {
    const handleCheckboxChange = () => {
      if (onUpdate) {
        handleToggleBoolean(field, value);
      }
    };

    return (
      <div key={field} className="flex items-center">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={handleCheckboxChange}
          disabled={!onUpdate}
          className={`h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ${
            onUpdate ? 'cursor-pointer' : 'cursor-not-allowed'
          }`}
        />
        <label 
          className={`ml-2 text-sm text-gray-700 ${
            onUpdate ? 'cursor-pointer' : 'cursor-not-allowed'
          }`}
          onClick={handleCheckboxChange}
        >
          {label}
        </label>
      </div>
    );
  };

  // Render badge field component (for L/S, Priority, Status)
  const renderBadgeField = (label, field, value, type = 'select', colorMap = {}) => {
    const isEditing = editingField === field;
    const displayValue = value || '-';
    const colorClass = colorMap[value] || 'bg-gray-100 text-gray-800';

    return (
      <div className="py-3 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <dt className="text-sm font-medium text-gray-500 w-1/3">{label}</dt>
          <dd className="text-sm text-gray-900 w-2/3">
            {isEditing ? (
              <select
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={handleKeyPress}
                autoFocus
                className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {field === 'lsPosition' && (
                  <>
                    <option value="Long">Long</option>
                    <option value="Short">Short</option>
                  </>
                )}
                {field === 'priority' && (
                  <>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </>
                )}
                {field === 'status' && (
                  <>
                    <option value="New">New</option>
                    <option value="Portfolio">Portfolio</option>
                    <option value="Current">Current</option>
                    <option value="On-Deck">On-Deck</option>
                    <option value="Old">Old</option>
                  </>
                )}
              </select>
            ) : (
              <span
                onClick={() => handleDoubleClick(field, value)}
                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${colorClass} ${
                  onUpdate ? 'cursor-pointer hover:ring-2 hover:ring-blue-300' : ''
                }`}
                title={onUpdate ? 'Double-click to edit' : ''}
              >
                {displayValue}
              </span>
            )}
          </dd>
        </div>
      </div>
    );
  };

  // Render rank field with confirmation prompt for conflicts
  const renderRankField = () => {
    const currentRank = ticker.rank;
    const analyst = ticker.analyst;
    const displayValue = currentRank ? currentRank.toString() : 'N/A';
    const isEditing = editingField === 'rank';
    
    const colorMap = {
      1: 'bg-purple-100 text-purple-800',
      2: 'bg-indigo-100 text-indigo-800',
      3: 'bg-cyan-100 text-cyan-800'
    };
    const colorClass = colorMap[currentRank] || 'bg-gray-100 text-gray-800';

    const handleRankChange = async (newRank) => {
      const rankValue = newRank === '' ? null : parseInt(newRank);
      
      // Close the editing state
      setEditingField(null);
      
      // If setting to same value, just close
      if (rankValue === currentRank) {
        return;
      }

      // If setting to null, just update
      if (rankValue === null) {
        if (onUpdate) {
          await onUpdate(ticker.id, { rank: rankValue });
        }
        return;
      }

      // Check if another ticker by this analyst already has this rank
      const conflictingTicker = tickers.find(t => 
        t.id !== ticker.id && 
        t.analyst === analyst && 
        t.rank === rankValue
      );

      if (conflictingTicker) {
        const confirmed = window.confirm(
          `Confirm you want to change this to Rank ${rankValue} and remove Rank ${rankValue} from ticker ${conflictingTicker.ticker}?`
        );
        
        if (confirmed && onUpdate) {
          // Remove rank from conflicting ticker first
          await onUpdate(conflictingTicker.id, { rank: null });
          // Then set rank on current ticker
          await onUpdate(ticker.id, { rank: rankValue });
        }
      } else {
        if (onUpdate) {
          await onUpdate(ticker.id, { rank: rankValue });
        }
      }
    };

    return (
      <div className="py-3 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <dt className="text-sm font-medium text-gray-500 w-1/3">Rank</dt>
          <dd className="text-sm text-gray-900 w-2/3">
            {isEditing ? (
              <select
                value={currentRank || ''}
                onChange={(e) => handleRankChange(e.target.value)}
                onBlur={() => setEditingField(null)}
                autoFocus
                className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">N/A</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            ) : (
              <span
                onClick={() => onUpdate && setEditingField('rank')}
                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${colorClass} ${
                  onUpdate ? 'cursor-pointer hover:ring-2 hover:ring-blue-300' : ''
                }`}
                title={onUpdate ? 'Click to edit' : ''}
              >
                {displayValue}
              </span>
            )}
          </dd>
        </div>
      </div>
    );
  };

  // Render price target field with percentage calculation
  const renderPriceTargetField = (label, field, value, currentPrice) => {
    const isEditing = editingField === field;
    const displayValue = value || '-';
    
    // Calculate percentage difference from current price
    const calculatePercentage = () => {
      if (!value || !currentPrice) return '';
      const ptValue = parseFloat(value);
      const current = parseFloat(currentPrice);
      if (isNaN(ptValue) || isNaN(current) || current === 0) return '';
      
      let percentage = ((ptValue - current) / current) * 100;
      
      // For short positions, invert the percentage since you're betting price goes down
      if (ticker.lsPosition === 'Short') {
        percentage = -percentage;
      }
      
      const sign = percentage >= 0 ? '+' : '';
      return `${sign}${percentage.toFixed(1)}%`;
    };

    const percentage = calculatePercentage();
    const percentageColor = percentage.startsWith('+') ? 'text-green-600' : 
                           percentage.startsWith('-') ? 'text-red-600' : 'text-gray-500';

    return (
      <div className="py-3 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <dt className="text-sm font-medium text-gray-500 w-1/3">{label}</dt>
          <dd className="text-sm text-gray-900 w-2/3">
            {isEditing ? (
              <input
                type="number"
                step="0.01"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={handleKeyPress}
                autoFocus
                className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <div className="flex items-center">
                <span
                  onClick={() => handleDoubleClick(field, value)}
                  className={`${onUpdate ? 'cursor-pointer hover:bg-gray-50 rounded px-1' : ''}`}
                  title={onUpdate ? 'Double-click to edit' : ''}
                >
                  {value ? formatPriceWithCurrency(value, selectedTicker?.ticker) : '-'}
                </span>
                {percentage && (
                  <span className={`text-xs ${percentageColor} ml-6`}>
                    {percentage}
                  </span>
                )}
              </div>
            )}
          </dd>
        </div>
      </div>
    );
  };

  // Render current price field with refresh button
  const renderCurrentPriceField = () => {
    const cleanSymbol = selectedTicker.ticker.replace(' US', '');
    const quote = quotes[cleanSymbol];
    const currentPrice = quote?.price || selectedTicker.currentPrice;
    const hasQuoteError = quoteErrors[cleanSymbol];
    const isRefreshing = isLoadingQuotes;

    return (
      <div className="py-3 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <dt className="text-sm font-medium text-gray-500 w-1/3">Current Price</dt>
          <dd className="text-sm text-gray-900 w-2/3 flex items-center justify-between">
            <span className={hasQuoteError ? 'text-red-500' : ''}>
              {currentPrice ? formatPriceWithCurrency(currentPrice, selectedTicker.ticker) : '-'}
              {hasQuoteError && <span className="text-xs text-red-500 ml-1">(Error)</span>}
            </span>
            {onUpdateQuote && (
              <button
                onClick={() => onUpdateQuote(cleanSymbol)}
                disabled={isRefreshing}
                className="ml-2 text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 flex items-center"
                title="Refresh current price"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </dd>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-5">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Idea Detail: {ticker.ticker}
          </h3>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleOpenEmailModal}
              className="inline-flex items-center px-3 py-2 border border-transparent shadow-sm text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Mail className="h-4 w-4 mr-2" />
              Email
            </button>
            <button
              onClick={onNavigateBack || (() => onSelectTicker(null))}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Back
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Basic Information */}
          <div>
            <h4 className="text-base font-medium text-gray-900 mb-4 border-b border-gray-200 pb-2">
              Basic Information
            </h4>
            <dl className="space-y-1">
              {renderField('Ticker', 'ticker', ticker.ticker)}
              {renderField('Company Name', 'name', ticker.name)}
              {renderField('Date In', 'dateIn', ticker.dateIn, 'date')}
              {renderField('Poke Date', 'pokeDate', ticker.pokeDate, 'date')}
              {renderBadgeField('L/S Position', 'lsPosition', ticker.lsPosition, 'select', {
                'Long': 'bg-green-100 text-green-800',
                'Short': 'bg-red-100 text-red-800'
              })}
              {renderBadgeField('Priority', 'priority', ticker.priority, 'select', {
                'A': 'bg-red-100 text-red-800',
                'B': 'bg-yellow-100 text-yellow-800', 
                'C': 'bg-blue-100 text-blue-800'
              })}
              {renderBadgeField('Status', 'status', ticker.status, 'select', {
                'Portfolio': 'bg-green-100 text-green-800',
                'Current': 'bg-blue-100 text-blue-800',
                'New': 'bg-purple-100 text-purple-800',
                'On-Deck': 'bg-yellow-100 text-yellow-800',
                'Old': 'bg-gray-100 text-gray-800'
              })}
              {renderField('Analyst', 'analyst', ticker.analyst, 'select')}
              {renderRankField()}
              {renderField('Source', 'source', ticker.source)}
              {renderField('Value/Growth', 'valueOrGrowth', ticker.valueOrGrowth, 'select')}
              {renderField('Catalyst Date', 'catalystDate', ticker.catalystDate, 'date')}
            </dl>
          </div>

          {/* Financial Data */}
          <div>
            <h4 className="text-base font-medium text-gray-900 mb-4 border-b border-gray-200 pb-2">
              Financial Data
            </h4>
            <dl className="space-y-1">
              {renderCurrentPriceField()}
              {renderField('Input Price', 'inputPrice', ticker.inputPrice ? `$${parseFloat(ticker.inputPrice).toFixed(2)}` : '', 'number')}
              {renderField('Market Cap', 'marketCap', ticker.marketCap ? `$${formatMarketCap(ticker.marketCap)}mm` : '', 'number')}
              {renderField('ADV 3 Month', 'adv3Month', ticker.adv3Month ? `$${formatVolumeDollars(ticker.adv3Month)}mm` : '', 'number')}
              {renderPriceTargetField('PT Bull', 'ptBull', ticker.ptBull, quote.price || ticker.currentPrice)}
              {renderPriceTargetField('PT Base', 'ptBase', ticker.ptBase, quote.price || ticker.currentPrice)}
              {renderPriceTargetField('PT Bear', 'ptBear', ticker.ptBear, quote.price || ticker.currentPrice)}
            </dl>
          </div>
        </div>

        {/* Thesis */}
        <div className="mt-8">
          <h4 className="text-base font-medium text-gray-900 mb-4 border-b border-gray-200 pb-2">
            Investment Thesis
          </h4>
          <dl>
            {renderField('Thesis', 'thesis', ticker.thesis, 'textarea')}
          </dl>
        </div>

        {/* Investment Characteristics - styled like input page */}
        <div className="mt-8">
          <h4 className="text-lg font-semibold text-gray-800 mb-4">Investment Characteristics</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Catalysts */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h6 className="text-base font-semibold text-blue-800 mb-3 border-b border-blue-300 pb-2">Catalysts</h6>
              <div className="grid grid-cols-1 gap-3">
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
                  { key: 'selfHelp', label: 'Self-Help' },
                  { key: 'productCycle', label: 'Product Cycle' },
                  { key: 'regulation', label: 'Regulation' }
                ].map(({ key, label }) => 
                  renderBooleanFieldInSection(label, key, ticker[key])
                )}
              </div>
            </div>

            {/* Characteristics */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h6 className="text-base font-semibold text-green-800 mb-3 border-b border-green-300 pb-2">Characteristics</h6>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { key: 'fraudRisk', label: 'Fraud Risk' },
                  { key: 'regulatoryRisk', label: 'Regulatory Risk' },
                  { key: 'cyclical', label: 'Cyclical' },
                  { key: 'nonCyclical', label: 'Non-Cyclical' },
                  { key: 'highBeta', label: 'High Beta' },
                  { key: 'momo', label: 'Momentum' },
                  { key: 'rateExposure', label: 'Rate Exposure' },
                  { key: 'strongDollar', label: 'Strong Dollar' },
                  { key: 'extremeValuation', label: 'Extreme Valuation' },
                  { key: 'crapco', label: 'Crapco' }
                ].map(({ key, label }) => 
                  renderBooleanFieldInSection(label, key, ticker[key])
                )}
              </div>
            </div>

            {/* Theme */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h6 className="text-base font-semibold text-purple-800 mb-3 border-b border-purple-300 pb-2">Theme</h6>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { key: 'aiWinner', label: 'AI Winner' },
                  { key: 'aiLoser', label: 'AI Loser' },
                  { key: 'tariffWinner', label: 'Tariff Winner' },
                  { key: 'tariffLoser', label: 'Tariff Loser' },
                  { key: 'trumpWinner', label: 'Trump Winner' },
                  { key: 'trumpLoser', label: 'Trump Loser' }
                ].map(({ key, label }) => 
                  renderBooleanFieldInSection(label, key, ticker[key])
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Email Modal */}
        {showEmailModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Email Investment Idea</h3>
                <p className="text-sm text-gray-500 mt-1">Select recipients for {ticker.ticker}</p>
              </div>
              
              <div className="px-6 py-4">
                <div className="space-y-3">
                  {analystEmails.map((analyst) => (
                    <label key={analyst.email} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedRecipients.includes(analyst.email)}
                        onChange={() => handleRecipientToggle(analyst.email)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="ml-3 text-sm text-gray-700">
                        {analyst.name} {analyst.analyst_code ? `(${analyst.analyst_code})` : ''} - {analyst.email}
                      </span>
                    </label>
                  ))}
                </div>
                {analystEmails.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500">Loading analyst emails...</p>
                  </div>
                )}
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
                <button
                  onClick={handleCloseEmailModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendEmail}
                  disabled={isEmailSending || selectedRecipients.length === 0}
                  className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    isEmailSending || selectedRecipients.length === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                  }`}
                >
                  {isEmailSending ? (
                    <div className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </div>
                  ) : (
                    `Send Email${selectedRecipients.length > 0 ? ` (${selectedRecipients.length})` : ''}`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function to parse Bloomberg-style tickers
const parseBloombergTicker = (rawTicker) => {
  if (!rawTicker || typeof rawTicker !== 'string') {
    return null;
  }

  // Skip currencies - anything with CURNCY
  if (rawTicker.includes('CURNCY')) {
    return null;
  }

  // Remove common Bloomberg suffixes
  const cleaned = rawTicker
    .replace(/\s+EQUITY$/, '') // Remove " EQUITY" suffix
    .replace(/\s+INDEX$/, '')  // Remove " INDEX" suffix
    .replace(/\s+CORP$/, '')   // Remove " CORP" suffix
    .replace(/\s+COMDTY$/, '') // Remove " COMDTY" suffix
    .trim();

  if (!cleaned) {
    return null;
  }

  const parts = cleaned.split(/\s+/);
  
  if (parts.length === 1) {
    // Single part, just return it (e.g., "AAPL" -> "AAPL")
    return parts[0];
  } else if (parts.length === 2) {
    const [symbol, suffix] = parts;
    
    // US market suffixes that should be removed (including UP)
    const usMarketSuffixes = ['UN', 'UR', 'US', 'UV', 'UW', 'UQ', 'UP'];
    
    // Market suffix transformations
    const suffixTransformations = {
      'AT': 'AU',  // Austria -> Australia format
      'SE': 'SW',  // Sweden transformation
      'CT': 'CN',  // China transformation
      'KQ': 'KS', // South Korea transformation
      'JT': 'JP'   // Japan - standardize to JP
    };
    
    if (usMarketSuffixes.includes(suffix)) {
      // Remove US market suffixes (e.g., "DOUG UN" -> "DOUG", "SPY UP" -> "SPY")
      return symbol;
    } else if (suffixTransformations[suffix]) {
      // Transform suffix (e.g., "MYX AT" -> "MYX AU")
      return `${symbol} ${suffixTransformations[suffix]}`;
    } else {
      // Keep other non-US market suffixes (e.g., "IWG LN" -> "IWG LN")
      return cleaned;
    }
  } else if (parts.length >= 3) {
    // Multiple parts - take first two and apply same logic
    const [symbol, suffix] = parts;
    const usMarketSuffixes = ['UN', 'UR', 'US', 'UV', 'UW', 'UQ', 'UP'];
    const suffixTransformations = {
      'AT': 'AU',
      'SE': 'SW',
      'CT': 'CN',
      'KQ': 'KS',
      'JT': 'JP'   // Japan - standardize to JP
    };
    
    if (usMarketSuffixes.includes(suffix)) {
      return symbol;
    } else if (suffixTransformations[suffix]) {
      return `${symbol} ${suffixTransformations[suffix]}`;
    } else {
      return `${symbol} ${suffix}`;
    }
  }

  return cleaned;
};

// Update Portfolio Page Component
const UpdatePortfolioPage = ({ tickers, onUpdateTickers, currentUser, userRole }) => {
  const [uploadFile, setUploadFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [portfolioTickers, setPortfolioTickers] = useState([]);
  const [alreadyPortfolioTickers, setAlreadyPortfolioTickers] = useState([]);
  const [toBeSetPortfolioTickers, setToBeSetPortfolioTickers] = useState([]);
  const [missingTickers, setMissingTickers] = useState([]);
  const [showMissingPrompt, setShowMissingPrompt] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Section enable/disable states
  const [updateAlreadyPortfolio, setUpdateAlreadyPortfolio] = useState(false); // Default false since no change needed
  const [updateToBeSetPortfolio, setUpdateToBeSetPortfolio] = useState(true);  // Default true
  const [updateMissingTickers, setUpdateMissingTickers] = useState(false);     // Default false, user decides
  const [updatePortfolioToOld, setUpdatePortfolioToOld] = useState(true);     // Default true
  
  // Individual ticker exclusions
  const [excludedAlreadyPortfolio, setExcludedAlreadyPortfolio] = useState(new Set());
  const [excludedToBeSetPortfolio, setExcludedToBeSetPortfolio] = useState(new Set());
  const [excludedMissingTickers, setExcludedMissingTickers] = useState(new Set());
  const [excludedPortfolioToOld, setExcludedPortfolioToOld] = useState(new Set());
  
  // Individual position selections for missing tickers
  const [tickerPositions, setTickerPositions] = useState(new Map());

  // Helper functions for ticker exclusion
  const toggleTickerExclusion = (ticker, excludedSet, setExcludedSet) => {
    const newSet = new Set(excludedSet);
    if (newSet.has(ticker)) {
      newSet.delete(ticker);
    } else {
      newSet.add(ticker);
    }
    setExcludedSet(newSet);
  };

  // Helper function for ticker position selection
  const setTickerPosition = (ticker, position) => {
    const newPositions = new Map(tickerPositions);
    newPositions.set(ticker, position);
    setTickerPositions(newPositions);
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    setUploadFile(file);
    setUploadStatus('');
    setPortfolioTickers([]);
    setAlreadyPortfolioTickers([]);
    setToBeSetPortfolioTickers([]);
    setMissingTickers([]);
    setShowMissingPrompt(false);
    
    // Reset checkboxes and exclusions
    setUpdateAlreadyPortfolio(false);
    setUpdateToBeSetPortfolio(true);
    setUpdateMissingTickers(false);
    setUpdatePortfolioToOld(true);
    setExcludedAlreadyPortfolio(new Set());
    setExcludedToBeSetPortfolio(new Set());
    setExcludedMissingTickers(new Set());
    setExcludedPortfolioToOld(new Set());
    setTickerPositions(new Map());
  };

  const processExcelFile = async () => {
    if (!uploadFile) {
      setUploadStatus('Please select a file first.');
      return;
    }

    setIsProcessing(true);
    setUploadStatus('Processing file...');

    try {
      const data = await uploadFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Extract tickers from column B (index 1), skip header row
      // Parse Bloomberg-style tickers (e.g., "DOUG UN EQUITY" -> "DOUG", "IWG LN EQUITY" -> "IWG LN")
      const tickersFromFile = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (row && row[1] && typeof row[1] === 'string') {
          const rawTicker = row[1].trim().toUpperCase();
          if (rawTicker) {
            const parsedTicker = parseBloombergTicker(rawTicker);
            if (parsedTicker && !tickersFromFile.includes(parsedTicker)) {
              console.log(`📊 Parsed ticker: "${rawTicker}" -> "${parsedTicker}"`);
              tickersFromFile.push(parsedTicker);
            }
          }
        }
      }

      if (tickersFromFile.length === 0) {
        setUploadStatus('No tickers found in column B of the file.');
        setIsProcessing(false);
        return;
      }

      setPortfolioTickers(tickersFromFile);

      // Check which tickers from file are missing in database
      console.log(`🗃️ Raw tickers array has ${tickers.length} entries`);
      console.log(`🔍 First few raw tickers:`, tickers.slice(0, 3));
      
      const validTickers = tickers.filter(t => t && t.ticker);
      console.log(`✅ Valid tickers (with ticker): ${validTickers.length}`);
      console.log(`📝 First few valid tickers:`, validTickers.slice(0, 3).map(t => ({ ticker: t.ticker, status: t.status })));
      
      const existingTickers = validTickers.map(t => t.ticker.toUpperCase());
      
      console.log(`🔍 Database has ${existingTickers.length} tickers:`, existingTickers.slice(0, 10), '...');
      console.log(`📋 File has ${tickersFromFile.length} parsed tickers:`, tickersFromFile.slice(0, 10), '...');
      
      const missing = tickersFromFile.filter(ticker => !existingTickers.includes(ticker));
      const found = tickersFromFile.filter(ticker => existingTickers.includes(ticker));
      
      // Split found tickers into two categories based on current status
      const alreadyPortfolioTickers = found.filter(ticker => {
        const dbTicker = validTickers.find(t => t.ticker.toUpperCase() === ticker);
        return dbTicker && dbTicker.status === 'Portfolio';
      });
      
      const toBeSetPortfolioTickers = found.filter(ticker => {
        const dbTicker = validTickers.find(t => t.ticker.toUpperCase() === ticker);
        return dbTicker && dbTicker.status !== 'Portfolio';
      });
      
      // Find current Portfolio tickers that are NOT in the file (will be set to Old)
      const currentPortfolioTickers = validTickers.filter(t => t.status === 'Portfolio');
      const currentPortfolioSymbols = currentPortfolioTickers.map(t => t.ticker.toUpperCase());
      const toBeSetToOld = currentPortfolioSymbols.filter(ticker => !tickersFromFile.includes(ticker));
      
      console.log(`✅ Found ${found.length} matching tickers:`, found.slice(0, 5));
      console.log(`📋 Already Portfolio: ${alreadyPortfolioTickers.length}`, alreadyPortfolioTickers.slice(0, 5));
      console.log(`🔄 To be set to Portfolio: ${toBeSetPortfolioTickers.length}`, toBeSetPortfolioTickers.slice(0, 5));
      console.log(`❌ Missing ${missing.length} tickers:`, missing.slice(0, 5));
      console.log(`📉 Current Portfolio tickers to be set to Old: ${toBeSetToOld.length}`, toBeSetToOld.slice(0, 5));

      // Set state for all categories
      setMissingTickers(missing);
      setAlreadyPortfolioTickers(alreadyPortfolioTickers);
      setToBeSetPortfolioTickers(toBeSetPortfolioTickers);
      
      // Set default Long position for all missing tickers
      const newPositions = new Map();
      missing.forEach(ticker => {
        newPositions.set(ticker, 'Long');
      });
      setTickerPositions(newPositions);

      // Create comprehensive status message
      let statusMessage = `📊 Portfolio Update Summary:\n`;
      statusMessage += `• Found ${found.length} tickers that exist in database\n`;
      statusMessage += `  - ${alreadyPortfolioTickers.length} already marked as Portfolio (no change)\n`;
      statusMessage += `  - ${toBeSetPortfolioTickers.length} will be changed to Portfolio status\n`;
      statusMessage += `• Missing ${missing.length} tickers not in database\n`;
      statusMessage += `• ${toBeSetToOld.length} current Portfolio tickers will be set to 'Old' status`;

      setUploadStatus(statusMessage);

      if (missing.length > 0) {
        setShowMissingPrompt(true);
      }

      setIsProcessing(false);
    } catch (error) {
      console.error('Error processing Excel file:', error);
      setUploadStatus('Error processing file. Please make sure it\'s a valid Excel file.');
      setIsProcessing(false);
    }
  };

  const updatePortfolioStatus = async () => {
    setIsUpdating(true);
    setUploadStatus('Updating portfolio status...');

    try {
      let addedCount = 0;
      let portfolioCount = 0;
      let oldCount = 0;
      
      // Get fresh ticker list from database
      const freshTickers = await DatabaseService.getTickers();

      // 1. Add missing tickers if enabled and not excluded
      if (updateMissingTickers && missingTickers.length > 0) {
        const tickersToAdd = missingTickers.filter(ticker => !excludedMissingTickers.has(ticker));
        if (tickersToAdd.length > 0) {
          setUploadStatus(`Adding ${tickersToAdd.length} missing tickers...`);
          for (const ticker of tickersToAdd) {
            // Get the analyst code of the user adding this ticker
            const analystSource = currentUser ? AuthService.getUserAnalystCode(currentUser) : null;
            
            const newTicker = {
              ticker: ticker,
              name: ticker, // Will need to be updated manually or via API
              dateIn: new Date().toLocaleDateString('en-US', { 
                year: '2-digit', 
                month: '2-digit', 
                day: '2-digit' 
              }),
              pokeDate: new Date().toISOString().split('T')[0],
              status: 'Portfolio',
              lsPosition: tickerPositions.get(ticker) || 'Long', // Individual ticker position or default to Long
              priority: 'A', // Default value
              thesis: '', // Required field - empty string instead of null
              analyst: '', // Set empty string for now
              source: '', // Set empty string for now
              analystSource: analystSource // Record who entered this ticker
            };
            await DatabaseService.addTicker(newTicker);
            addedCount++;
          }
        }
      }

      // 2. Update existing Portfolio tickers to Old if enabled and not excluded
      if (updatePortfolioToOld) {
        const currentPortfolioTickers = freshTickers.filter(t => t && t.status === 'Portfolio' && t.ticker);
        const tickersToMakeOld = currentPortfolioTickers.filter(t => {
          const upperTicker = t.ticker.toUpperCase();
          return !portfolioTickers.includes(upperTicker) && !excludedPortfolioToOld.has(upperTicker);
        });

        if (tickersToMakeOld.length > 0) {
          setUploadStatus(`Updating ${tickersToMakeOld.length} tickers from Portfolio to Old...`);
          for (const ticker of tickersToMakeOld) {
            await DatabaseService.updateTicker(ticker.id, { status: 'Old' });
            oldCount++;
          }
        }
      }

      // 3. Update tickers to Portfolio status if enabled and not excluded
      if (updateToBeSetPortfolio && toBeSetPortfolioTickers.length > 0) {
        const tickersToMakePortfolio = toBeSetPortfolioTickers.filter(ticker => !excludedToBeSetPortfolio.has(ticker));
        
        if (tickersToMakePortfolio.length > 0) {
          setUploadStatus(`Updating ${tickersToMakePortfolio.length} tickers to Portfolio status...`);
          
          // Get fresh ticker list again in case missing tickers were added
          const latestTickers = await DatabaseService.getTickers();
          
          for (const tickerSymbol of tickersToMakePortfolio) {
            const ticker = latestTickers.find(t => t && t.ticker && t.ticker.toUpperCase() === tickerSymbol);
            if (ticker) {
              await DatabaseService.updateTicker(ticker.id, { status: 'Portfolio' });
              portfolioCount++;
            }
          }
        }
      }

      // Refresh the ticker list in the parent component
      const updatedTickers = await DatabaseService.getTickers();
      onUpdateTickers(updatedTickers);

      let statusMessage = '✅ Portfolio update completed successfully!';
      if (portfolioCount > 0) statusMessage += `\n- ${portfolioCount} tickers set to Portfolio`;
      if (oldCount > 0) statusMessage += `\n- ${oldCount} tickers set to Old`;
      if (addedCount > 0) statusMessage += `\n- ${addedCount} new tickers added`;
      
      setUploadStatus(statusMessage);
      
      // Reset form
      setUploadFile(null);
      setPortfolioTickers([]);
      setAlreadyPortfolioTickers([]);
      setToBeSetPortfolioTickers([]);
      setMissingTickers([]);
      setShowMissingPrompt(false);
      setUpdateAlreadyPortfolio(false);
      setUpdateToBeSetPortfolio(true);
      setUpdateMissingTickers(false);
      setUpdatePortfolioToOld(true);
      setExcludedAlreadyPortfolio(new Set());
      setExcludedToBeSetPortfolio(new Set());
      setExcludedMissingTickers(new Set());
      setExcludedPortfolioToOld(new Set());
      setTickerPositions(new Map());
      
    } catch (error) {
      console.error('Error updating portfolio status:', error);
      setUploadStatus('❌ Error updating portfolio status. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const canUpdate = userRole === 'readwrite' || userRole === 'admin';

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Update Portfolio Status
        </h3>
        
        <div className="space-y-6">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Upload an Excel file to update ticker portfolio status. Tickers listed in column B will be set to "Portfolio" status,
              and existing Portfolio tickers not in the file will be set to "Old" status.
            </p>
            
            {!canUpdate && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  You have read-only access. Portfolio updates require write permissions.
                </p>
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="excel-file" className="block text-sm font-medium text-gray-700 mb-2">
                Select Excel File
              </label>
              <input
                id="excel-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isProcessing || isUpdating || !canUpdate}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
              />
            </div>

            {uploadFile && (
              <div className="mb-4">
                <button
                  onClick={processExcelFile}
                  disabled={isProcessing || isUpdating || !canUpdate}
                  className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    isProcessing || isUpdating || !canUpdate
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                  }`}
                >
                  {isProcessing ? 'Processing...' : 'Process File'}
                </button>
              </div>
            )}

            {uploadStatus && (
              <div className={`mb-4 p-3 rounded-md ${
                uploadStatus.includes('✅') ? 'bg-green-50 border border-green-200' :
                uploadStatus.includes('❌') ? 'bg-red-50 border border-red-200' :
                'bg-blue-50 border border-blue-200'
              }`}>
                <p className={`text-sm ${
                  uploadStatus.includes('✅') ? 'text-green-800' :
                  uploadStatus.includes('❌') ? 'text-red-800' :
                  'text-blue-800'
                }`} style={{ whiteSpace: 'pre-line' }}>
                  {uploadStatus}
                </p>
              </div>
            )}

            {portfolioTickers.length > 0 && (
              <div className="mb-6 space-y-4">
                <h4 className="text-lg font-semibold text-gray-900">Portfolio Analysis Results:</h4>
                
                {/* 1. All tickers from file */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h5 className="text-sm font-medium text-blue-900 mb-2">
                    📋 All Tickers from File: {portfolioTickers.length}
                  </h5>
                  <div className="max-h-24 overflow-y-auto bg-white p-2 rounded border text-sm">
                    {portfolioTickers.join(', ')}
                  </div>
                </div>

                {/* 2. Already Portfolio Tickers */}
                {alreadyPortfolioTickers.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-sm font-medium text-green-900">
                        📋 Already Portfolio (No Change): {alreadyPortfolioTickers.length}
                      </h5>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={updateAlreadyPortfolio}
                          onChange={(e) => setUpdateAlreadyPortfolio(e.target.checked)}
                          className="mr-2"
                        />
                        <span className="text-sm text-green-800">Include in update</span>
                      </label>
                    </div>
                    <div className="max-h-32 overflow-y-auto bg-white p-2 rounded border text-sm">
                      {alreadyPortfolioTickers.map((ticker, index) => (
                        <div key={ticker} className="flex items-center justify-between py-1">
                          <span className={excludedAlreadyPortfolio.has(ticker) ? 'line-through text-gray-400' : ''}>
                            {ticker}
                          </span>
                          <button
                            onClick={() => toggleTickerExclusion(ticker, excludedAlreadyPortfolio, setExcludedAlreadyPortfolio)}
                            className={`text-xs px-2 py-1 rounded ${
                              excludedAlreadyPortfolio.has(ticker) 
                                ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {excludedAlreadyPortfolio.has(ticker) ? 'Include' : 'Exclude'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. To be Set to Portfolio */}
                {toBeSetPortfolioTickers.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-sm font-medium text-yellow-900">
                        🔄 Will be Set to Portfolio: {toBeSetPortfolioTickers.length}
                      </h5>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={updateToBeSetPortfolio}
                          onChange={(e) => setUpdateToBeSetPortfolio(e.target.checked)}
                          className="mr-2"
                        />
                        <span className="text-sm text-yellow-800">Include in update</span>
                      </label>
                    </div>
                    <div className="max-h-32 overflow-y-auto bg-white p-2 rounded border text-sm">
                      {toBeSetPortfolioTickers.map((ticker, index) => (
                        <div key={ticker} className="flex items-center justify-between py-1">
                          <span className={excludedToBeSetPortfolio.has(ticker) ? 'line-through text-gray-400' : ''}>
                            {ticker}
                          </span>
                          <button
                            onClick={() => toggleTickerExclusion(ticker, excludedToBeSetPortfolio, setExcludedToBeSetPortfolio)}
                            className={`text-xs px-2 py-1 rounded ${
                              excludedToBeSetPortfolio.has(ticker) 
                                ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {excludedToBeSetPortfolio.has(ticker) ? 'Include' : 'Exclude'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. Missing Tickers (only show if there are any) */}
            {missingTickers.length > 0 && (
              <div className="mb-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-red-900">
                      ❌ Missing Tickers (Not in Database): {missingTickers.length}
                    </h5>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={updateMissingTickers}
                        onChange={(e) => setUpdateMissingTickers(e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm text-red-800">Add to database</span>
                    </label>
                  </div>
                  <div className="max-h-32 overflow-y-auto bg-white p-2 rounded border text-sm">
                    {missingTickers.map((ticker, index) => (
                      <div key={ticker} className="flex items-center justify-between py-1">
                        <span className={excludedMissingTickers.has(ticker) ? 'line-through text-gray-400' : ''}>
                          {ticker}
                        </span>
                        <div className="flex items-center space-x-2">
                          {/* Position Selection Buttons */}
                          <div className="flex border rounded">
                            <button
                              onClick={() => setTickerPosition(ticker, 'Long')}
                              className={`text-xs px-2 py-1 rounded-l ${
                                tickerPositions.get(ticker) === 'Long'
                                  ? 'bg-green-600 text-white'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              Long
                            </button>
                            <button
                              onClick={() => setTickerPosition(ticker, 'Short')}
                              className={`text-xs px-2 py-1 rounded-r ${
                                tickerPositions.get(ticker) === 'Short'
                                  ? 'bg-red-600 text-white'
                                  : 'bg-red-100 text-red-700 hover:bg-red-200'
                              }`}
                            >
                              Short
                            </button>
                          </div>
                          {/* Exclude/Include Button */}
                          <button
                            onClick={() => toggleTickerExclusion(ticker, excludedMissingTickers, setExcludedMissingTickers)}
                            className={`text-xs px-2 py-1 rounded ${
                              excludedMissingTickers.has(ticker) 
                                ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {excludedMissingTickers.has(ticker) ? 'Include' : 'Exclude'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 5. Current Portfolio tickers to be set to Old */}
            {portfolioTickers.length > 0 && (() => {
              const currentPortfolioTickers = tickers.filter(t => t && t.status === 'Portfolio');
              const currentPortfolioSymbols = currentPortfolioTickers.map(t => t.ticker.toUpperCase());
              const toBeSetToOld = currentPortfolioSymbols.filter(ticker => !portfolioTickers.includes(ticker));
              
              return toBeSetToOld.length > 0 && (
                <div className="mb-4">
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-sm font-medium text-orange-900">
                        📉 Current Portfolio → Old: {toBeSetToOld.length}
                      </h5>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={updatePortfolioToOld}
                          onChange={(e) => setUpdatePortfolioToOld(e.target.checked)}
                          className="mr-2"
                        />
                        <span className="text-sm text-orange-800">Include in update</span>
                      </label>
                    </div>
                    <div className="max-h-32 overflow-y-auto bg-white p-2 rounded border text-sm">
                      {toBeSetToOld.map((ticker, index) => (
                        <div key={ticker} className="flex items-center justify-between py-1">
                          <span className={excludedPortfolioToOld.has(ticker) ? 'line-through text-gray-400' : ''}>
                            {ticker}
                          </span>
                          <button
                            onClick={() => toggleTickerExclusion(ticker, excludedPortfolioToOld, setExcludedPortfolioToOld)}
                            className={`text-xs px-2 py-1 rounded ${
                              excludedPortfolioToOld.has(ticker) 
                                ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {excludedPortfolioToOld.has(ticker) ? 'Include' : 'Exclude'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}



            {/* Single Update Button */}
            {portfolioTickers.length > 0 && (
              <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    <p className="font-medium mb-1">Update Summary:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {updateToBeSetPortfolio && toBeSetPortfolioTickers.filter(t => !excludedToBeSetPortfolio.has(t)).length > 0 && (
                        <li>Set {toBeSetPortfolioTickers.filter(t => !excludedToBeSetPortfolio.has(t)).length} tickers to Portfolio</li>
                      )}
                      {updatePortfolioToOld && (() => {
                        const currentPortfolioTickers = tickers.filter(t => t && t.status === 'Portfolio');
                        const currentPortfolioSymbols = currentPortfolioTickers.map(t => t.ticker.toUpperCase());
                        const toBeSetToOld = currentPortfolioSymbols.filter(ticker => !portfolioTickers.includes(ticker) && !excludedPortfolioToOld.has(ticker));
                        return toBeSetToOld.length > 0 && <li>Set {toBeSetToOld.length} tickers to Old</li>;
                      })()}
                      {updateMissingTickers && missingTickers.filter(t => !excludedMissingTickers.has(t)).length > 0 && (
                        <li>Add {missingTickers.filter(t => !excludedMissingTickers.has(t)).length} new tickers with individual positions</li>
                      )}
                      {!updateToBeSetPortfolio && !updatePortfolioToOld && !updateMissingTickers && (
                        <li className="text-gray-500">No actions selected</li>
                      )}
                    </ul>
                  </div>
                  <button
                    onClick={updatePortfolioStatus}
                    disabled={
                      isUpdating || 
                      !canUpdate || 
                      (!updateToBeSetPortfolio && !updatePortfolioToOld && !updateMissingTickers) ||
                      (updateMissingTickers && missingTickers.filter(t => !excludedMissingTickers.has(t)).some(t => !tickerPositions.has(t)))
                    }
                    className={`px-6 py-3 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      isUpdating || 
                      !canUpdate || 
                      (!updateToBeSetPortfolio && !updatePortfolioToOld && !updateMissingTickers) ||
                      (updateMissingTickers && missingTickers.filter(t => !excludedMissingTickers.has(t)).some(t => !tickerPositions.has(t)))
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500'
                    }`}
                  >
                    {isUpdating ? 'Updating...' : 'Update Database'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Idea Screening Page Component
const IdeaScreeningPage = ({ tickers, quotes, onNavigateToIdeaDetail }) => {
  // Debug: Log first ticker to see structure
  React.useEffect(() => {
    if (tickers && tickers.length > 0) {
      console.log('🔍 First ticker object in Idea Screening:', tickers[0]);
      console.log('🔍 Keys in first ticker:', Object.keys(tickers[0]));
    }
  }, [tickers]);

  // State for selected investment characteristics
  const [selectedCharacteristics, setSelectedCharacteristics] = useState({
    // Catalysts
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
    selfHelp: false,
    productCycle: false,
    regulation: false,
    // Characteristics
    fraudRisk: false,
    regulatoryRisk: false,
    cyclical: false,
    nonCyclical: false,
    highBeta: false,
    momo: false,
    rateExposure: false,
    strongDollar: false,
    extremeValuation: false,
    crapco: false,
    // Themes
    aiWinner: false,
    aiLoser: false,
    tariffWinner: false,
    tariffLoser: false,
    trumpWinner: false,
    trumpLoser: false
  });

  // Sorting state
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'

  // Toggle characteristic selection
  const toggleCharacteristic = (characteristic) => {
    setSelectedCharacteristics(prev => ({
      ...prev,
      [characteristic]: !prev[characteristic]
    }));
  };

  // Handle sorting
  const handleSort = (field) => {
    if (sortField === field) {
      // If clicking the same field, toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // If clicking a new field, default to ascending
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Helper function to get sort value for a field
  const getSortValue = (ticker, field) => {
    switch (field) {
      case 'ticker':
        return ticker.ticker || '';
      case 'name':
        return ticker.name || '';
      case 'lsPosition':
        return ticker.lsPosition || '';
      case 'status':
        return ticker.status || '';
      case 'analyst':
        return ticker.analyst || '';
      case 'marketCap':
        return parseFloat(ticker.marketCap) || 0;
      case 'adv3m':
        return parseFloat(ticker.adv3m) || 0;
      case 'ptBear':
        return parseFloat(ticker.ptBear) || 0;
      case 'ptBase':
        return parseFloat(ticker.ptBase) || 0;
      case 'ptBull':
        return parseFloat(ticker.ptBull) || 0;
      default:
        return '';
    }
  };

  // Filter and sort tickers based on selected characteristics and sorting preferences
  const filteredTickers = useMemo(() => {
    const selectedKeys = Object.keys(selectedCharacteristics).filter(
      key => selectedCharacteristics[key]
    );
    
    let filtered;
    if (selectedKeys.length === 0) {
      // Debug: Log the first few tickers to see ls_position values
      if (tickers.length > 0) {
        console.log('🔍 Debug: First 3 tickers lsPosition values:', 
          tickers.slice(0, 3).map(t => ({ 
            ticker: t.ticker, 
            lsPosition: t.lsPosition, 
            lsPosition_type: typeof t.lsPosition,
            lsPosition_length: t.lsPosition?.length 
          }))
        );
      }
      filtered = tickers; // Show all tickers if no filters selected
    } else {
      filtered = tickers.filter(ticker => {
        return selectedKeys.every(key => ticker[key] === true);
      });
    }
    
    // Apply sorting if a sort field is selected
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = getSortValue(a, sortField);
        const bVal = getSortValue(b, sortField);
        
        // Handle numeric vs string comparison
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        } else {
          const aStr = String(aVal).toLowerCase();
          const bStr = String(bVal).toLowerCase();
          if (sortDirection === 'asc') {
            return aStr.localeCompare(bStr);
          } else {
            return bStr.localeCompare(aStr);
          }
        }
      });
    }
    
    return filtered;
  }, [tickers, selectedCharacteristics, sortField, sortDirection, getSortValue]);

  // Investment characteristics definitions
  const characteristicsGroups = {
    catalysts: {
      title: 'Catalysts',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      titleColor: 'text-blue-800',
      borderBottomColor: 'border-blue-300',
      items: [
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
        { key: 'selfHelp', label: 'Self-Help' },
        { key: 'productCycle', label: 'Product Cycle' },
        { key: 'regulation', label: 'Regulation' }
      ]
    },
    characteristics: {
      title: 'Characteristics',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      titleColor: 'text-green-800',
      borderBottomColor: 'border-green-300',
      items: [
        { key: 'fraudRisk', label: 'Fraud Risk' },
        { key: 'regulatoryRisk', label: 'Regulatory Risk' },
        { key: 'cyclical', label: 'Cyclical' },
        { key: 'nonCyclical', label: 'Non-Cyclical' },
        { key: 'highBeta', label: 'High Beta' },
        { key: 'momo', label: 'Momentum' },
        { key: 'rateExposure', label: 'Rate Exposure' },
        { key: 'strongDollar', label: 'Strong Dollar' },
        { key: 'extremeValuation', label: 'Extreme Valuation' },
        { key: 'crapco', label: 'Crapco' }
      ]
    },
    themes: {
      title: 'Theme',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      titleColor: 'text-purple-800',
      borderBottomColor: 'border-purple-300',
      items: [
        { key: 'aiWinner', label: 'AI Winner' },
        { key: 'aiLoser', label: 'AI Loser' },
        { key: 'tariffWinner', label: 'Tariff Winner' },
        { key: 'tariffLoser', label: 'Tariff Loser' },
        { key: 'trumpWinner', label: 'Trump Winner' },
        { key: 'trumpLoser', label: 'Trump Loser' }
      ]
    }
  };

  // Format market cap
  const formatMarketCap = (marketCap) => {
    if (!marketCap || marketCap === 0) return '-';
    const numValue = parseFloat(marketCap);
    if (numValue >= 1e9) {
      return `$${(numValue / 1e9).toFixed(1)}B`;
    } else if (numValue >= 1e6) {
      return `$${(numValue / 1e6).toFixed(1)}M`;
    } else {
      return `$${numValue.toFixed(0)}`;
    }
  };

  // Format ADV 3M
  const formatADV3M = (adv3m) => {
    if (!adv3m || adv3m === 0) return '-';
    const numValue = parseFloat(adv3m);
    if (numValue >= 1e9) {
      return `$${(numValue / 1e9).toFixed(1)}B`;
    } else if (numValue >= 1e6) {
      return `$${(numValue / 1e6).toFixed(1)}M`;
    } else if (numValue >= 1e3) {
      return `$${(numValue / 1e3).toFixed(1)}K`;
    } else {
      return `$${numValue.toFixed(0)}`;
    }
  };

  // Generate PDF export
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Add title
    doc.setFontSize(16);
    doc.text('Idea Screening Results', 14, 20);
    
    // Add selected characteristics summary
    const selectedKeys = Object.keys(selectedCharacteristics).filter(
      key => selectedCharacteristics[key]
    );
    
    if (selectedKeys.length > 0) {
      // Get characteristic labels
      const selectedLabels = [];
      Object.values(characteristicsGroups).forEach(group => {
        group.items.forEach(item => {
          if (selectedCharacteristics[item.key]) {
            selectedLabels.push(item.label);
          }
        });
      });
      
      doc.setFontSize(10);
      const summaryText = `Selected Characteristics: ${selectedLabels.join(', ')}`;
      const splitSummary = doc.splitTextToSize(summaryText, pageWidth - 28);
      doc.text(splitSummary, 14, 30);
      
      // Calculate starting Y position after summary
      const summaryHeight = splitSummary.length * 4;
      const startY = 35 + summaryHeight;
      
      // Prepare table data
      const tableData = filteredTickers.map(ticker => [
        ticker.ticker || '',
        ticker.name || '',
        (ticker.lsPosition?.toString().trim().toLowerCase() === 'long') ? 'L' : 
        (ticker.lsPosition?.toString().trim().toLowerCase() === 'short') ? 'S' : '',
        ticker.status || '',
        ticker.analyst || '',
        formatMarketCap(ticker.marketCap),
        formatADV3M(ticker.adv3m),
        ticker.ptBear ? `$${parseFloat(ticker.ptBear).toFixed(2)}` : '',
        ticker.ptBase ? `$${parseFloat(ticker.ptBase).toFixed(2)}` : '',
        ticker.ptBull ? `$${parseFloat(ticker.ptBull).toFixed(2)}` : ''
      ]);
      
      // Add table
      autoTable(doc, {
        head: [['Ticker', 'Name', 'L/S', 'Status', 'Analyst', 'Market Cap', 'ADV 3M', 'PT Bear', 'PT Base', 'PT Bull']],
        body: tableData,
        startY: startY,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] },
        columnStyles: {
          0: { cellWidth: 15 }, // Ticker
          1: { cellWidth: 25 }, // Name
          2: { cellWidth: 12 }, // L/S
          3: { cellWidth: 15 }, // Status
          4: { cellWidth: 15 }, // Analyst
          5: { cellWidth: 18 }, // Market Cap
          6: { cellWidth: 15 }, // ADV 3M
          7: { cellWidth: 15 }, // PT Bear
          8: { cellWidth: 15 }, // PT Base
          9: { cellWidth: 15 }  // PT Bull
        }
      });
    } else {
      doc.setFontSize(10);
      doc.text('No characteristics selected - showing all tickers', 14, 30);
      
      // Prepare table data for all tickers
      const tableData = filteredTickers.map(ticker => [
        ticker.ticker || '',
        ticker.name || '',
        (ticker.lsPosition?.toString().trim().toLowerCase() === 'long') ? 'L' : 
        (ticker.lsPosition?.toString().trim().toLowerCase() === 'short') ? 'S' : '',
        ticker.status || '',
        ticker.analyst || '',
        formatMarketCap(ticker.marketCap),
        formatADV3M(ticker.adv3m),
        ticker.ptBear ? `$${parseFloat(ticker.ptBear).toFixed(2)}` : '',
        ticker.ptBase ? `$${parseFloat(ticker.ptBase).toFixed(2)}` : '',
        ticker.ptBull ? `$${parseFloat(ticker.ptBull).toFixed(2)}` : ''
      ]);
      
      // Add table
      autoTable(doc, {
        head: [['Ticker', 'Name', 'L/S', 'Status', 'Analyst', 'Market Cap', 'ADV 3M', 'PT Bear', 'PT Base', 'PT Bull']],
        body: tableData,
        startY: 40,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] },
        columnStyles: {
          0: { cellWidth: 15 }, // Ticker
          1: { cellWidth: 25 }, // Name
          2: { cellWidth: 12 }, // L/S
          3: { cellWidth: 15 }, // Status
          4: { cellWidth: 15 }, // Analyst
          5: { cellWidth: 18 }, // Market Cap
          6: { cellWidth: 15 }, // ADV 3M
          7: { cellWidth: 15 }, // PT Bear
          8: { cellWidth: 15 }, // PT Base
          9: { cellWidth: 15 }  // PT Bull
        }
      });
    }
    
    // Save the PDF
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    doc.save(`idea-screening-${timestamp}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Idea Screening</h1>
          <p className="text-gray-600">
            Filter investment ideas by selecting investment characteristics below. Results show tickers that have ALL of the selected characteristics.
          </p>
        </div>
      </div>

      {/* Investment Characteristics Filter Section */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Investment Characteristics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(characteristicsGroups).map(([groupKey, group]) => (
              <div key={groupKey} className={`${group.bgColor} ${group.borderColor} border rounded-lg p-4`}>
                <h6 className={`text-base font-semibold ${group.titleColor} mb-3 ${group.borderBottomColor} border-b pb-2`}>
                  {group.title}
                </h6>
                <div className="grid grid-cols-1 gap-3">
                  {group.items.map(({ key, label }) => (
                    <div key={key} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedCharacteristics[key]}
                        onChange={() => toggleCharacteristic(key)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                      />
                      <label 
                        className="ml-2 text-sm text-gray-700 cursor-pointer"
                        onClick={() => toggleCharacteristic(key)}
                      >
                        {label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Filtered Results ({filteredTickers.length} ideas)
            </h2>
            <div className="flex items-center space-x-4">
              {Object.values(selectedCharacteristics).some(v => v) && (
                <button
                  onClick={() => setSelectedCharacteristics(prev => {
                    const reset = {};
                    Object.keys(prev).forEach(key => reset[key] = false);
                    return reset;
                  })}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Clear All Filters
                </button>
              )}
              {filteredTickers.length > 0 && (
                <button
                  onClick={exportToPDF}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export to PDF
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Table Container */}
          <div className="overflow-hidden border border-gray-200 rounded-lg">
            <div className="max-h-96 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                {/* Sticky Header */}
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('ticker')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Ticker</span>
                        {sortField === 'ticker' && (
                          <span className="text-gray-400">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Name</span>
                        {sortField === 'name' && (
                          <span className="text-gray-400">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('lsPosition')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>L/S</span>
                        {sortField === 'lsPosition' && (
                          <span className="text-gray-400">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Status</span>
                        {sortField === 'status' && (
                          <span className="text-gray-400">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('analyst')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Analyst</span>
                        {sortField === 'analyst' && (
                          <span className="text-gray-400">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('marketCap')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Market Cap</span>
                        {sortField === 'marketCap' && (
                          <span className="text-gray-400">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('adv3m')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>ADV 3M</span>
                        {sortField === 'adv3m' && (
                          <span className="text-gray-400">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('ptBear')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>PT Bear</span>
                        {sortField === 'ptBear' && (
                          <span className="text-gray-400">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('ptBase')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>PT Base</span>
                        {sortField === 'ptBase' && (
                          <span className="text-gray-400">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('ptBull')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>PT Bull</span>
                        {sortField === 'ptBull' && (
                          <span className="text-gray-400">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                
                {/* Table Body */}
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTickers.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="px-6 py-12 text-center">
                        <div className="text-gray-500">
                          {Object.values(selectedCharacteristics).some(v => v) 
                            ? "No tickers match the selected criteria" 
                            : "Select investment characteristics above to filter ideas"
                          }
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredTickers.map((ticker, index) => (
                      <tr key={`${ticker.ticker}-${index}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          <button
                            onClick={() => onNavigateToIdeaDetail(ticker)}
                            className="text-blue-600 hover:text-blue-800 underline hover:no-underline font-medium"
                            title="Click to view in Idea Detail"
                          >
                            {ticker.ticker}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {ticker.name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            (ticker.lsPosition?.toString().trim().toLowerCase() === 'long')
                              ? 'bg-green-100 text-green-800' 
                              : (ticker.lsPosition?.toString().trim().toLowerCase() === 'short')
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {(ticker.lsPosition?.toString().trim().toLowerCase() === 'long') ? 'L' : 
                             (ticker.lsPosition?.toString().trim().toLowerCase() === 'short') ? 'S' : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            ticker.status === 'Portfolio' 
                              ? 'bg-blue-100 text-blue-800'
                              : ticker.status === 'Watchlist'
                              ? 'bg-yellow-100 text-yellow-800'
                              : ticker.status === 'Old'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {ticker.status || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {ticker.analyst || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatMarketCap(ticker.marketCap)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatADV3M(ticker.adv3m)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {ticker.ptBear ? formatPriceWithCurrency(ticker.ptBear, ticker.ticker) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {ticker.ptBase ? formatPriceWithCurrency(ticker.ptBase, ticker.ticker) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {ticker.ptBull ? formatPriceWithCurrency(ticker.ptBull, ticker.ticker) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClearlineFlow;