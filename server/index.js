// Backend WebSocket Server for TwelveData Price Streaming + FMP Polling
// This server maintains a single connection to TwelveData and serves multiple clients
// Also polls FMP for exchanges not supported by TwelveData WebSocket
// Syncs ticker list from Supabase database periodically

const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const PORT = process.env.PORT || 3001;
const TWELVE_DATA_WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price';
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TICKER_SYNC_INTERVAL = 5 * 60 * 1000; // Sync tickers every 5 minutes

// Initialize Supabase client
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('✅ Supabase client initialized');
} else {
  console.log('⚠️ Supabase not configured - will rely on client subscriptions');
}

// Server state
let twelveDataWS = null;
let isConnected = false;
let isConnecting = false; // Lock to prevent multiple simultaneous connections
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectDelay = 5000;
let reconnectTimeout = null; // Track reconnection timeout

// Client connections and their subscriptions
const clients = new Map(); // client WebSocket -> Set of symbols
const symbolSubscribers = new Map(); // symbol -> Set of client WebSockets
const subscribedSymbols = new Set(); // All symbols currently subscribed to TwelveData

// Server-managed symbols from database sync (converted TwelveData format)
// These should NOT be unsubscribed when clients disconnect
const serverManagedTwelveDataSymbols = new Set();

// FMP symbols (exchanges not supported by TwelveData WebSocket)
const fmpSymbols = new Set(); // Symbols to poll via FMP
const fmpSymbolSubscribers = new Map(); // FMP symbol -> Set of client WebSockets
let fmpPollingInterval = null;
const FMP_POLL_INTERVAL = 60000; // Poll FMP every 60 seconds

// Price cache - stores last known price for each symbol
// Key: converted symbol (e.g., "AAPL" or "BT.A:LSE"), Value: { price, timestamp, source }
const priceCache = new Map();

// Heartbeat interval
let heartbeatInterval = null;
let lastActivity = Date.now();

// Bloomberg to TwelveData suffix mapping
const bloombergToTwelveDataMap = {
  'US': '',
  'GR': ':XETR',
  'GY': ':XETR',
  'CN': ':TSX',
  'CT': ':TSX',
  'AU': ':ASX',
  'FP': ':EPA',
  'SM': ':BME',
  'SW': ':SIX',
  'SS': ':SHH',
  'SZ': ':SHZ',
  'IN': ':NSE',
  'KS': ':KRX',
  'TB': ':SET',
  'MK': ':KLSE',
  'SP': ':SGX',
  'TT': ':TWSE',
  'NA': ':Euronext',
};

// FMP-handled exchanges (skip for TwelveData)
const fmpExchanges = ['JP', 'JT', 'HK', 'IM', 'HM', 'TE', 'LN', 'DC'];

// Special US ticker mappings where TwelveData uses different symbols
const usTwelveDataSymbolMap = {
  'ACHVW': 'ACHVWXX',
  'TICAW': 'TICAWX',
};

// Convert Bloomberg format to TwelveData format
function convertBloombergToTwelveData(symbol) {
  if (!symbol || typeof symbol !== 'string') return { converted: symbol, original: symbol };
  
  let cleanSymbol = symbol.trim().toUpperCase();
  cleanSymbol = cleanSymbol.replace(/\//g, '.');
  
  // Check for special US ticker mappings first
  const baseSymbol = cleanSymbol.split(' ')[0];
  if (usTwelveDataSymbolMap[baseSymbol]) {
    const mappedSymbol = usTwelveDataSymbolMap[baseSymbol];
    console.log(`🔄 Mapping US ticker: ${baseSymbol} → ${mappedSymbol}`);
    return { converted: mappedSymbol, original: symbol };
  }
  
  const parts = cleanSymbol.split(' ');
  
  if (parts.length === 2) {
    let [ticker, bloombergSuffix] = parts;
    
    if (fmpExchanges.includes(bloombergSuffix)) {
      return { converted: null, original: symbol, isFMP: true };
    }
    
    ticker = ticker.replace(/\//g, '.');
    const twelveDataSuffix = bloombergToTwelveDataMap[bloombergSuffix];
    
    if (twelveDataSuffix !== undefined) {
      return { converted: ticker + twelveDataSuffix, original: symbol };
    } else {
      console.warn(`Unknown Bloomberg suffix "${bloombergSuffix}" for symbol "${symbol}"`);
      return { converted: ticker, original: symbol };
    }
  }
  
  return { converted: cleanSymbol, original: symbol };
}

// Create HTTP server for health checks
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      twelveDataConnected: isConnected,
      clientCount: clients.size,
      twelveDataSymbols: subscribedSymbols.size,
      fmpSymbols: fmpSymbols.size,
      fmpPollingActive: !!fmpPollingInterval,
      supabaseConnected: !!supabase,
      serverManagedSymbols: serverManagedSymbols.size,
      tickerSyncActive: !!tickerSyncInterval,
      priceCacheSize: priceCache.size,
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Create WebSocket server for clients
const wss = new WebSocket.Server({ server });

console.log('🚀 Starting WebSocket server...');

// Connect to TwelveData WebSocket
function connectToTwelveData() {
  if (!TWELVE_DATA_API_KEY) {
    console.error('❌ TWELVE_DATA_API_KEY environment variable not set');
    console.log('⚠️ Server will run without TwelveData connection - clients can still connect');
    return;
  }

  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    console.log('⏳ Connection already in progress, skipping...');
    return;
  }
  
  // If already connected, don't reconnect
  if (twelveDataWS && twelveDataWS.readyState === WebSocket.OPEN) {
    console.log('✅ Already connected to TwelveData');
    return;
  }

  isConnecting = true;
  console.log('🔌 Connecting to TwelveData WebSocket...');
  console.log(`📝 API Key length: ${TWELVE_DATA_API_KEY.length} chars, starts with: ${TWELVE_DATA_API_KEY.substring(0, 4)}...`);
  
  try {
    // Close any existing connection first
    if (twelveDataWS) {
      twelveDataWS.removeAllListeners();
      if (twelveDataWS.readyState === WebSocket.OPEN || twelveDataWS.readyState === WebSocket.CONNECTING) {
        twelveDataWS.close();
      }
      twelveDataWS = null;
    }
    
    twelveDataWS = new WebSocket(`${TWELVE_DATA_WS_URL}?apikey=${TWELVE_DATA_API_KEY}`);
    
    twelveDataWS.on('open', () => {
      console.log('✅ Connected to TwelveData WebSocket');
      isConnected = true;
      isConnecting = false;
      reconnectAttempts = 0;
      lastActivity = Date.now();
      
      // Clear any pending reconnect timeout
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      
      // Start heartbeat
      startHeartbeat();
      
      // Resubscribe to all symbols if we had any (with delay between chunks)
      if (subscribedSymbols.size > 0) {
        console.log(`🔄 Resubscribing to ${subscribedSymbols.size} symbols...`);
        subscribeToTwelveDataWithDelay(Array.from(subscribedSymbols));
      }
      
      // Notify all clients of connection status
      broadcastToClients({
        type: 'connection',
        connected: true
      });
    });
    
    twelveDataWS.on('message', (data) => {
      lastActivity = Date.now();
      
      try {
        const message = JSON.parse(data.toString());
        handleTwelveDataMessage(message);
      } catch (error) {
        console.error('❌ Error parsing TwelveData message:', error);
      }
    });
    
    twelveDataWS.on('error', (error) => {
      console.error('❌ TwelveData WebSocket error:', error.message);
      isConnecting = false;
    });
    
    twelveDataWS.on('close', (code, reason) => {
      console.log(`🔌 TwelveData WebSocket closed: ${code} ${reason || '(no reason)'}`);
      isConnected = false;
      isConnecting = false;
      stopHeartbeat();
      
      // Notify all clients of disconnection
      broadcastToClients({
        type: 'connection',
        connected: false
      });
      
      // Only attempt reconnection if we have clients or symbols to subscribe
      if (clients.size > 0 || subscribedSymbols.size > 0) {
        attemptReconnect();
      } else {
        console.log('📋 No clients connected, will reconnect when needed');
      }
    });
  } catch (error) {
    console.error('❌ Error creating TwelveData WebSocket:', error);
    isConnecting = false;
  }
}

// Handle messages from TwelveData
function handleTwelveDataMessage(data) {
  // Handle subscription status
  if (data.event === 'subscribe-status') {
    console.log(`📊 Subscription status: ${data.success?.length || 0} success, ${data.fails?.length || 0} fails`);
    
    // Broadcast subscription status to all clients
    broadcastToClients({
      type: 'subscription-status',
      success: data.success || [],
      fails: data.fails || []
    });
    return;
  }
  
  if (data.event === 'unsubscribe-status') {
    console.log('📊 Unsubscribe status:', data);
    return;
  }
  
  if (data.event === 'heartbeat') {
    return;
  }
  
  if (data.status === 'error' || data.code) {
    console.error('❌ TwelveData error:', data.message || data);
    return;
  }
  
  // Handle price updates
  if (data.symbol && data.price !== undefined) {
    let price = parseFloat(data.price);
    
    const priceData = {
      type: 'price',
      symbol: data.symbol,
      price: price,
      timestamp: data.timestamp,
      dayVolume: data.day_volume ? parseInt(data.day_volume) : null,
      exchange: data.exchange
    };
    
    // Cache the price
    priceCache.set(data.symbol, {
      price: price,
      timestamp: data.timestamp || Date.now(),
      source: 'twelvedata',
      dayVolume: priceData.dayVolume,
      exchange: data.exchange
    });
    
    // Broadcast to clients subscribed to this symbol
    broadcastPriceUpdate(priceData);
  }
}

// Broadcast price update to subscribed clients
function broadcastPriceUpdate(priceData) {
  const symbol = priceData.symbol;
  const subscribers = symbolSubscribers.get(symbol);
  
  if (subscribers && subscribers.size > 0) {
    const message = JSON.stringify(priceData);
    subscribers.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

// Send cached prices to a specific client for their subscribed symbols
function sendCachedPricesToClient(ws, symbols) {
  if (ws.readyState !== WebSocket.OPEN) return;
  
  let sentCount = 0;
  const cachedPrices = [];
  
  const missingSymbols = [];
  
  symbols.forEach(symbol => {
    const { converted, original, isFMP } = convertBloombergToTwelveData(symbol);
    let found = false;
    
    // Check TwelveData cache (using converted symbol)
    if (converted && priceCache.has(converted)) {
      const cached = priceCache.get(converted);
      cachedPrices.push({
        type: 'price',
        symbol: converted,
        price: cached.price,
        timestamp: cached.timestamp,
        dayVolume: cached.dayVolume,
        exchange: cached.exchange,
        cached: true
      });
      sentCount++;
      found = true;
    }
    
    // Check FMP cache (using original Bloomberg symbol)
    if (isFMP && priceCache.has(original)) {
      const cached = priceCache.get(original);
      cachedPrices.push({
        type: 'price',
        symbol: original,
        price: cached.price,
        timestamp: cached.timestamp,
        dayVolume: cached.dayVolume,
        exchange: cached.exchange,
        cached: true
      });
      sentCount++;
      found = true;
    }
    
    // Track symbols without cached prices
    if (!found) {
      missingSymbols.push({
        original: symbol,
        converted: converted,
        isFMP: isFMP
      });
    }
  });
  
  // Send all cached prices in a batch message
  if (cachedPrices.length > 0) {
    ws.send(JSON.stringify({
      type: 'cached-prices',
      prices: cachedPrices,
      count: cachedPrices.length,
      totalRequested: symbols.length,
      missing: missingSymbols.length
    }));
    console.log(`📤 Sent ${sentCount} cached prices to client (${missingSymbols.length} symbols without cache)`);
  }
  
  // Log missing symbols for diagnostics
  if (missingSymbols.length > 0) {
    console.log(`⚠️ ${missingSymbols.length} symbols without cached prices:`);
    // Log first 20 for brevity
    missingSymbols.slice(0, 20).forEach(m => {
      console.log(`   - ${m.original} → ${m.converted || 'null'} (FMP: ${m.isFMP})`);
    });
    if (missingSymbols.length > 20) {
      console.log(`   ... and ${missingSymbols.length - 20} more`);
    }
  }
}

// Broadcast to all connected clients
function broadcastToClients(data) {
  const message = JSON.stringify(data);
  clients.forEach((_, client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Subscribe to symbols on TwelveData (immediate, for small batches)
function subscribeToTwelveData(symbols) {
  if (!twelveDataWS || twelveDataWS.readyState !== WebSocket.OPEN) {
    console.log('📋 TwelveData not connected, queuing subscriptions');
    return;
  }
  
  if (symbols.length === 0) return;
  
  // Subscribe in chunks of 100
  const chunkSize = 100;
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    const message = {
      action: 'subscribe',
      params: {
        symbols: chunk.join(',')
      }
    };
    
    console.log(`📊 Subscribing to chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(symbols.length/chunkSize)}: ${chunk.length} symbols`);
    twelveDataWS.send(JSON.stringify(message));
  }
}

// Subscribe to symbols with delay between chunks (for large batches/resubscription)
async function subscribeToTwelveDataWithDelay(symbols) {
  if (!twelveDataWS || twelveDataWS.readyState !== WebSocket.OPEN) {
    console.log('📋 TwelveData not connected, queuing subscriptions');
    return;
  }
  
  if (symbols.length === 0) return;
  
  // Subscribe in chunks of 100 with 500ms delay between each
  const chunkSize = 100;
  const chunkDelay = 500; // ms between chunks
  const totalChunks = Math.ceil(symbols.length / chunkSize);
  
  for (let i = 0; i < symbols.length; i += chunkSize) {
    // Check if still connected before each chunk
    if (!twelveDataWS || twelveDataWS.readyState !== WebSocket.OPEN) {
      console.log('⚠️ Connection lost during subscription, stopping');
      return;
    }
    
    const chunk = symbols.slice(i, i + chunkSize);
    const chunkNum = Math.floor(i/chunkSize) + 1;
    const message = {
      action: 'subscribe',
      params: {
        symbols: chunk.join(',')
      }
    };
    
    console.log(`📊 Subscribing to chunk ${chunkNum}/${totalChunks}: ${chunk.length} symbols`);
    twelveDataWS.send(JSON.stringify(message));
    
    // Delay before next chunk (except for last chunk)
    if (i + chunkSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, chunkDelay));
    }
  }
}

// Unsubscribe from symbols on TwelveData
function unsubscribeFromTwelveData(symbols) {
  if (!twelveDataWS || twelveDataWS.readyState !== WebSocket.OPEN) return;
  if (symbols.length === 0) return;
  
  const message = {
    action: 'unsubscribe',
    params: {
      symbols: symbols.join(',')
    }
  };
  
  console.log(`📊 Unsubscribing from ${symbols.length} symbols`);
  twelveDataWS.send(JSON.stringify(message));
}

// Update subscriptions based on all clients' needs
function updateAggregatedSubscriptions() {
  // Collect all TwelveData symbols from symbolSubscribers (these are the actual subscribed symbols)
  const neededSymbols = new Set();
  symbolSubscribers.forEach((subscribers, symbol) => {
    if (subscribers.size > 0) {
      neededSymbols.add(symbol);
    }
  });
  
  // Also include server-managed symbols from database sync
  // These should always stay subscribed regardless of client activity
  serverManagedTwelveDataSymbols.forEach(symbol => {
    neededSymbols.add(symbol);
  });
  
  // Find symbols to add and remove
  const symbolsToAdd = [];
  const symbolsToRemove = [];
  
  neededSymbols.forEach((symbol) => {
    if (!subscribedSymbols.has(symbol)) {
      symbolsToAdd.push(symbol);
      subscribedSymbols.add(symbol);
    }
  });
  
  subscribedSymbols.forEach((symbol) => {
    if (!neededSymbols.has(symbol)) {
      symbolsToRemove.push(symbol);
      subscribedSymbols.delete(symbol);
    }
  });
  
  // Execute subscriptions
  if (symbolsToAdd.length > 0) {
    subscribeToTwelveData(symbolsToAdd);
  }
  
  if (symbolsToRemove.length > 0) {
    unsubscribeFromTwelveData(symbolsToRemove);
  }
}

// ==================== FMP POLLING ====================

// Convert Bloomberg symbol to FMP format
function convertToFMPSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return null;
  
  const cleanSymbol = symbol.trim().toUpperCase();
  const parts = cleanSymbol.split(' ');
  
  if (parts.length !== 2) return null;
  
  let [ticker, exchange] = parts;
  
  // Replace slashes with dashes for FMP format (e.g., BT/A -> BT-A)
  ticker = ticker.replace(/\//g, '-');
  
  // Map Bloomberg exchange codes to FMP exchange suffixes
  const fmpExchangeMap = {
    'JP': '.T',    // Tokyo Stock Exchange
    'JT': '.T',    // Tokyo Stock Exchange (alternative)
    'HK': '.HK',   // Hong Kong Stock Exchange
    'LN': '.L',    // London Stock Exchange
    'IM': '.MI',   // Milan Stock Exchange (Italy)
    'HM': '.MI',   // Milan Stock Exchange (alternative)
    'TE': '.MI',   // Milan Stock Exchange (alternative)
    'DC': '.CO',   // Copenhagen Stock Exchange (Denmark)
  };
  
  const fmpSuffix = fmpExchangeMap[exchange];
  if (!fmpSuffix) return null;
  
  return ticker + fmpSuffix;
}

// Fetch quotes from FMP for a batch of symbols
async function fetchFMPQuotes(symbols) {
  if (!FMP_API_KEY || symbols.length === 0) return [];
  
  // Convert to FMP format - use array to support multiple original symbols mapping to same FMP symbol
  // e.g., both "9984 JP" and "9984 JT" map to "9984.T"
  const fmpSymbolMap = new Map(); // FMP symbol -> array of original symbols
  symbols.forEach(originalSymbol => {
    const fmpSymbol = convertToFMPSymbol(originalSymbol);
    if (fmpSymbol) {
      if (!fmpSymbolMap.has(fmpSymbol)) {
        fmpSymbolMap.set(fmpSymbol, []);
      }
      fmpSymbolMap.get(fmpSymbol).push(originalSymbol);
    }
  });
  
  if (fmpSymbolMap.size === 0) return [];
  
  const fmpSymbolList = Array.from(fmpSymbolMap.keys()).join(',');
  const url = `${FMP_BASE_URL}/quote/${fmpSymbolList}?apikey=${FMP_API_KEY}`;
  
  // Log the URL (without API key for security)
  console.log(`🌐 FMP Request URL: ${FMP_BASE_URL}/quote/${fmpSymbolList}?apikey=***`);
  console.log(`📋 FMP Symbol mapping: ${Array.from(fmpSymbolMap.entries()).map(([fmp, originals]) => `${originals.join('+')} → ${fmp}`).join(', ')}`);
  
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', chunk => { data += chunk; });
      
      res.on('end', () => {
        try {
          const quotes = JSON.parse(data);
          
          // Log raw response for debugging
          console.log(`📥 FMP Response (${quotes.length || 0} items):`, 
            Array.isArray(quotes) 
              ? quotes.map(q => `${q.symbol}: ${q.price}`).join(', ')
              : JSON.stringify(quotes).substring(0, 200)
          );
          
          if (!Array.isArray(quotes)) {
            console.error('❌ FMP returned non-array:', quotes);
            resolve([]);
            return;
          }
          
          // Log which symbols were returned vs requested
          const returnedSymbols = new Set(quotes.map(q => q.symbol));
          const requestedSymbols = Array.from(fmpSymbolMap.keys());
          const missingFromResponse = requestedSymbols.filter(s => !returnedSymbols.has(s));
          if (missingFromResponse.length > 0) {
            console.warn(`⚠️ FMP did not return data for: ${missingFromResponse.join(', ')}`);
          }
          
          // Map back to original symbols and format as price updates
          // One FMP quote can map to multiple original symbols
          const priceUpdates = [];
          quotes.forEach(quote => {
            const originalSymbols = fmpSymbolMap.get(quote.symbol);
            if (!originalSymbols || quote.price === undefined) return;
            
            // Create a price update for EACH original symbol that maps to this FMP symbol
            originalSymbols.forEach(originalSymbol => {
              priceUpdates.push({
                type: 'price',
                symbol: originalSymbol, // Use original Bloomberg format
                price: parseFloat(quote.price),
                timestamp: quote.timestamp || Date.now(),
                dayVolume: quote.volume ? parseInt(quote.volume) : null,
                exchange: quote.exchange || 'FMP',
                source: 'FMP'
              });
            });
          });
          
          resolve(priceUpdates);
        } catch (error) {
          console.error('❌ Error parsing FMP response:', error);
          resolve([]);
        }
      });
    }).on('error', (error) => {
      console.error('❌ FMP request error:', error.message);
      resolve([]);
    });
  });
}

// Poll FMP for all subscribed FMP symbols
async function pollFMPQuotes() {
  if (fmpSymbols.size === 0) return;
  
  console.log(`📈 Polling FMP for ${fmpSymbols.size} symbols...`);
  
  const symbols = Array.from(fmpSymbols);
  let successCount = 0;
  const failedSymbols = [];
  
  // FMP has a limit, so batch in groups of 50
  const batchSize = 50;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const priceUpdates = await fetchFMPQuotes(batch);
    
    // Track which symbols got prices
    const returnedSymbols = new Set(priceUpdates.map(p => p.symbol));
    
    // Check for symbols that didn't get a price
    batch.forEach(symbol => {
      if (!returnedSymbols.has(symbol)) {
        failedSymbols.push({ symbol, error: 'No price returned from FMP' });
      }
    });
    
    // Cache and broadcast each price update
    priceUpdates.forEach(priceData => {
      // Cache the price (use original Bloomberg symbol as key)
      priceCache.set(priceData.symbol, {
        price: priceData.price,
        timestamp: priceData.timestamp || Date.now(),
        source: 'fmp',
        dayVolume: priceData.dayVolume,
        exchange: priceData.exchange
      });
      successCount++;
      
      // Broadcast to subscribed clients
      broadcastFMPPriceUpdate(priceData);
    });
  }
  
  console.log(`📊 FMP poll complete: ${successCount} success, ${failedSymbols.length} failed`);
  
  // Log detailed info about failed symbols
  if (failedSymbols.length > 0) {
    console.log(`❌ ${failedSymbols.length} FMP symbols failed:`);
    failedSymbols.forEach(({ symbol, error }) => {
      const fmpSymbol = convertToFMPSymbol(symbol);
      console.log(`   - ${symbol} (FMP: ${fmpSymbol}): ${error}`);
    });
  }
}

// Broadcast FMP price update to subscribed clients
function broadcastFMPPriceUpdate(priceData) {
  const symbol = priceData.symbol;
  const subscribers = fmpSymbolSubscribers.get(symbol);
  
  if (subscribers && subscribers.size > 0) {
    const message = JSON.stringify(priceData);
    subscribers.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

// Start FMP polling
function startFMPPolling() {
  if (fmpPollingInterval) return;
  
  if (!FMP_API_KEY) {
    console.log('⚠️ FMP_API_KEY not set, FMP polling disabled');
    return;
  }
  
  console.log('🔄 Starting FMP polling...');
  
  // Poll immediately, then on interval
  pollFMPQuotes();
  
  fmpPollingInterval = setInterval(() => {
    pollFMPQuotes();
  }, FMP_POLL_INTERVAL);
}

// Stop FMP polling
function stopFMPPolling() {
  if (fmpPollingInterval) {
    clearInterval(fmpPollingInterval);
    fmpPollingInterval = null;
  }
}

// Update FMP subscriptions
function updateFMPSubscriptions() {
  // Collect all FMP symbols from fmpSymbolSubscribers (these are the actual subscribed symbols)
  const neededFMPSymbols = new Set();
  fmpSymbolSubscribers.forEach((subscribers, symbol) => {
    if (subscribers.size > 0) {
      neededFMPSymbols.add(symbol);
    }
  });
  
  // Update the set
  fmpSymbols.clear();
  neededFMPSymbols.forEach(symbol => fmpSymbols.add(symbol));
  
  // Start or stop polling based on whether we have symbols
  if (fmpSymbols.size > 0 && !fmpPollingInterval) {
    startFMPPolling();
  } else if (fmpSymbols.size === 0 && fmpPollingInterval) {
    stopFMPPolling();
  }
  
  console.log(`📊 FMP symbols updated: ${fmpSymbols.size} symbols`);
}

// ==================== END FMP POLLING ====================

// ==================== SUPABASE TICKER SYNC ====================

let tickerSyncInterval = null;
let serverManagedSymbols = new Set(); // Symbols loaded from database

// Fetch all tickers from Supabase and update subscriptions
async function syncTickersFromDatabase() {
  if (!supabase) {
    return;
  }
  
  console.log('🔄 Syncing tickers from database...');
  
  try {
    // Fetch all tickers from the database
    const { data: tickers, error } = await supabase
      .from('tickers')
      .select('ticker, status')
      .not('ticker', 'is', null);
    
    if (error) {
      console.error('❌ Error fetching tickers from Supabase:', error.message);
      return;
    }
    
    if (!tickers || tickers.length === 0) {
      console.log('📋 No tickers found in database');
      return;
    }
    
    console.log(`📊 Found ${tickers.length} tickers in database`);
    
    // Get unique symbols
    const newSymbols = new Set();
    tickers.forEach(t => {
      if (t.ticker) {
        // Remove ' US' suffix for consistency
        const symbol = t.ticker.replace(' US', '');
        newSymbols.add(symbol);
      }
    });
    
    // Find symbols to add and remove
    const symbolsToAdd = [];
    const symbolsToRemove = [];
    
    newSymbols.forEach(symbol => {
      if (!serverManagedSymbols.has(symbol)) {
        symbolsToAdd.push(symbol);
      }
    });
    
    serverManagedSymbols.forEach(symbol => {
      if (!newSymbols.has(symbol)) {
        symbolsToRemove.push(symbol);
      }
    });
    
    // Update server managed symbols
    serverManagedSymbols = newSymbols;
    
    if (symbolsToAdd.length === 0 && symbolsToRemove.length === 0) {
      console.log('✅ No ticker changes detected');
      return;
    }
    
    console.log(`📊 Ticker changes: +${symbolsToAdd.length} new, -${symbolsToRemove.length} removed`);
    
    // Subscribe to new symbols
    if (symbolsToAdd.length > 0) {
      // Route symbols to TwelveData or FMP
      const twelveDataSymbols = [];
      const fmpSymbolsList = [];
      
      symbolsToAdd.forEach(symbol => {
        const { converted, isFMP } = convertBloombergToTwelveData(symbol);
        
        if (isFMP) {
          fmpSymbolsList.push(symbol);
          fmpSymbols.add(symbol);
        } else if (converted) {
          twelveDataSymbols.push(converted);
          subscribedSymbols.add(converted);
          serverManagedTwelveDataSymbols.add(converted); // Track server-managed symbols
        }
      });
      
      if (twelveDataSymbols.length > 0) {
        console.log(`📈 Adding ${twelveDataSymbols.length} symbols to TwelveData`);
        await subscribeToTwelveDataWithDelay(twelveDataSymbols);
      }
      
      if (fmpSymbolsList.length > 0) {
        console.log(`📈 Adding ${fmpSymbolsList.length} symbols to FMP polling`);
        if (!fmpPollingInterval) {
          startFMPPolling();
        }
      }
    }
    
    // Unsubscribe from removed symbols
    if (symbolsToRemove.length > 0) {
      const twelveDataToRemove = [];
      
      symbolsToRemove.forEach(symbol => {
        const { converted, isFMP } = convertBloombergToTwelveData(symbol);
        
        if (isFMP) {
          fmpSymbols.delete(symbol);
        } else if (converted) {
          twelveDataToRemove.push(converted);
          subscribedSymbols.delete(converted);
          serverManagedTwelveDataSymbols.delete(converted); // Remove from server-managed
        }
      });
      
      if (twelveDataToRemove.length > 0) {
        unsubscribeFromTwelveData(twelveDataToRemove);
      }
    }
    
    console.log(`✅ Sync complete: ${subscribedSymbols.size} TwelveData, ${fmpSymbols.size} FMP`);
    
    // Fetch initial prices for symbols without cached prices
    // Run this in background after a short delay to let WebSocket subscriptions complete
    setTimeout(async () => {
      await fetchInitialPrices();
    }, 5000);
    
  } catch (error) {
    console.error('❌ Error syncing tickers:', error);
  }
}

// Start periodic ticker sync
function startTickerSync() {
  if (!supabase) {
    console.log('⚠️ Supabase not configured, skipping ticker sync');
    return;
  }
  
  if (tickerSyncInterval) return;
  
  console.log(`🔄 Starting ticker sync (every ${TICKER_SYNC_INTERVAL / 1000 / 60} minutes)`);
  
  // Sync immediately
  syncTickersFromDatabase();
  
  // Then sync periodically
  tickerSyncInterval = setInterval(() => {
    syncTickersFromDatabase();
  }, TICKER_SYNC_INTERVAL);
}

// Stop ticker sync
function stopTickerSync() {
  if (tickerSyncInterval) {
    clearInterval(tickerSyncInterval);
    tickerSyncInterval = null;
  }
}

// ==================== END SUPABASE TICKER SYNC ====================

// ==================== INITIAL PRICE FETCH ====================

// Fetch initial prices from TwelveData REST API for symbols without cached prices
async function fetchInitialPrices() {
  if (!TWELVE_DATA_API_KEY) {
    console.log('⚠️ TwelveData API key not set, skipping initial price fetch');
    return;
  }
  
  // Get all TwelveData symbols that don't have cached prices
  const symbolsWithoutPrices = [];
  serverManagedTwelveDataSymbols.forEach(symbol => {
    if (!priceCache.has(symbol)) {
      symbolsWithoutPrices.push(symbol);
    }
  });
  
  if (symbolsWithoutPrices.length === 0) {
    console.log('✅ All symbols have cached prices');
    return;
  }
  
  console.log(`📈 Fetching initial prices for ${symbolsWithoutPrices.length} symbols via REST API...`);
  
  // TwelveData batch quote endpoint supports up to 8 symbols at once
  const batchSize = 8;
  let successCount = 0;
  let errorCount = 0;
  const failedSymbols = []; // Track which symbols failed and why
  
  for (let i = 0; i < symbolsWithoutPrices.length; i += batchSize) {
    const batch = symbolsWithoutPrices.slice(i, i + batchSize);
    const symbolsParam = batch.join(',');
    
    try {
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolsParam)}&apikey=${TWELVE_DATA_API_KEY}`;
      
      const response = await new Promise((resolve, reject) => {
        https.get(url, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });
      
      // Handle batch response (object with symbol keys) or single response
      const quotes = batch.length === 1 ? { [batch[0]]: response } : response;
      
      Object.entries(quotes).forEach(([symbol, data]) => {
        if (data && data.close && !data.code) {
          let price = parseFloat(data.close);
          
          priceCache.set(symbol, {
            price: price,
            timestamp: Date.now(),
            source: 'twelvedata-rest',
            dayVolume: data.volume ? parseInt(data.volume) : null,
            exchange: data.exchange
          });
          successCount++;
        } else {
          errorCount++;
          // Track the failure with details
          const errorMsg = data?.code ? `${data.code}: ${data.message || 'Unknown error'}` : 'No price data';
          failedSymbols.push({ symbol, error: errorMsg });
        }
      });
      
      // Small delay between batches to respect rate limits
      if (i + batchSize < symbolsWithoutPrices.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
    } catch (error) {
      console.error(`❌ Error fetching batch ${Math.floor(i/batchSize) + 1}:`, error.message);
      // Track all symbols in failed batch
      batch.forEach(symbol => {
        failedSymbols.push({ symbol, error: `Batch error: ${error.message}` });
      });
      errorCount += batch.length;
    }
  }
  
  console.log(`📊 Initial price fetch complete: ${successCount} success, ${errorCount} errors`);
  console.log(`💾 Price cache now has ${priceCache.size} entries`);
  
  // Log detailed info about failed symbols
  if (failedSymbols.length > 0) {
    console.log(`❌ ${failedSymbols.length} symbols failed to fetch initial price:`);
    failedSymbols.forEach(({ symbol, error }) => {
      console.log(`   - ${symbol}: ${error}`);
    });
  }
}

// ==================== END INITIAL PRICE FETCH ====================

// Start heartbeat to keep TwelveData connection alive
function startHeartbeat() {
  stopHeartbeat();
  
  heartbeatInterval = setInterval(() => {
    if (twelveDataWS && twelveDataWS.readyState === WebSocket.OPEN) {
      twelveDataWS.send(JSON.stringify({ action: 'heartbeat' }));
      console.log('💓 Sent heartbeat to TwelveData');
      
      // Check for stale connection - use 5 minutes since markets may be closed
      // and no price updates will come through
      if (Date.now() - lastActivity > 300000) {
        console.warn('⚠️ No activity in 5 minutes, reconnecting...');
        twelveDataWS.close();
      }
    }
  }, 10000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// Attempt reconnection
function attemptReconnect() {
  // Don't schedule another reconnection if one is already pending or connecting
  if (reconnectTimeout || isConnecting) {
    console.log('⏳ Reconnection already scheduled or in progress');
    return;
  }
  
  if (reconnectAttempts >= maxReconnectAttempts) {
    console.error('❌ Max reconnection attempts reached, waiting 60s before retry');
    // Reset and try again after longer delay
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      reconnectAttempts = 0;
      connectToTwelveData();
    }, 60000);
    return;
  }
  
  reconnectAttempts++;
  const delay = reconnectDelay * Math.min(reconnectAttempts, 6);
  
  console.log(`🔄 Attempting reconnection ${reconnectAttempts}/${maxReconnectAttempts} in ${delay/1000}s...`);
  
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connectToTwelveData();
  }, delay);
}

// Handle new client connections
wss.on('connection', (ws, req) => {
  const clientId = `${req.socket.remoteAddress}:${Date.now()}`;
  console.log(`👤 New client connected: ${clientId}`);
  
  // Initialize client's subscription sets (TwelveData and FMP)
  clients.set(ws, { twelveDataSymbols: new Set(), fmpSymbols: new Set() });
  
  // Connect to TwelveData if this is the first client and we're not already connected
  if (!twelveDataWS || twelveDataWS.readyState !== WebSocket.OPEN) {
    console.log('🔌 First client connected, connecting to TwelveData...');
    connectToTwelveData();
  }
  
  // Send initial connection status
  ws.send(JSON.stringify({
    type: 'connection',
    connected: isConnected,
    subscribedSymbols: subscribedSymbols.size,
    fmpSymbols: fmpSymbols.size
  }));
  
  // Handle messages from client
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleClientMessage(ws, message);
    } catch (error) {
      console.error('❌ Error parsing client message:', error);
    }
  });
  
  // Handle client disconnect
  ws.on('close', () => {
    console.log(`👤 Client disconnected: ${clientId}`);
    
    // Remove client's TwelveData subscriptions
    const clientData = clients.get(ws);
    if (clientData && clientData.twelveDataSymbols) {
      clientData.twelveDataSymbols.forEach((symbol) => {
        const subscribers = symbolSubscribers.get(symbol);
        if (subscribers) {
          subscribers.delete(ws);
          if (subscribers.size === 0) {
            symbolSubscribers.delete(symbol);
          }
        }
      });
    }
    
    // Remove client's FMP subscriptions
    if (clientData && clientData.fmpSymbols) {
      clientData.fmpSymbols.forEach((symbol) => {
        const subscribers = fmpSymbolSubscribers.get(symbol);
        if (subscribers) {
          subscribers.delete(ws);
          if (subscribers.size === 0) {
            fmpSymbolSubscribers.delete(symbol);
          }
        }
      });
    }
    
    // Remove client
    clients.delete(ws);
    
    // Update subscriptions
    updateAggregatedSubscriptions();
    updateFMPSubscriptions();
    
    console.log(`📊 Active clients: ${clients.size}, TwelveData: ${subscribedSymbols.size}, FMP: ${fmpSymbols.size}`);
  });
  
  ws.on('error', (error) => {
    console.error(`❌ Client WebSocket error: ${error.message}`);
  });
});

// Handle messages from clients
function handleClientMessage(ws, message) {
  const { action, symbols } = message;
  
  if (!action) return;
  
  if (action === 'subscribe' && Array.isArray(symbols)) {
    console.log(`📥 Client subscribing to ${symbols.length} symbols`);
    
    const clientData = clients.get(ws);
    if (!clientData) return;
    
    let twelveDataCount = 0;
    let fmpCount = 0;
    
    symbols.forEach((symbol) => {
      const { converted, original, isFMP } = convertBloombergToTwelveData(symbol);
      
      if (isFMP) {
        // Handle FMP symbol
        clientData.fmpSymbols.add(original);
        fmpCount++;
        
        // Track which clients are subscribed to this FMP symbol
        if (!fmpSymbolSubscribers.has(original)) {
          fmpSymbolSubscribers.set(original, new Set());
        }
        fmpSymbolSubscribers.get(original).add(ws);
        return;
      }
      
      if (converted === null) return;
      
      // Track client's TwelveData subscriptions using converted symbol
      clientData.twelveDataSymbols.add(converted);
      twelveDataCount++;
      
      // Track which clients are subscribed to which TwelveData symbols
      if (!symbolSubscribers.has(converted)) {
        symbolSubscribers.set(converted, new Set());
      }
      symbolSubscribers.get(converted).add(ws);
    });
    
    console.log(`📊 Subscription breakdown: ${twelveDataCount} TwelveData, ${fmpCount} FMP`);
    
    // Update subscriptions
    updateAggregatedSubscriptions();
    if (fmpCount > 0) {
      updateFMPSubscriptions();
    }
    
    // Send cached prices to the client immediately
    sendCachedPricesToClient(ws, symbols);
  }
  
  if (action === 'unsubscribe' && Array.isArray(symbols)) {
    console.log(`📤 Client unsubscribing from ${symbols.length} symbols`);
    
    const clientData = clients.get(ws);
    if (!clientData) return;
    
    symbols.forEach((symbol) => {
      const { converted, original, isFMP } = convertBloombergToTwelveData(symbol);
      
      if (isFMP) {
        // Handle FMP symbol unsubscription
        clientData.fmpSymbols.delete(original);
        
        const subscribers = fmpSymbolSubscribers.get(original);
        if (subscribers) {
          subscribers.delete(ws);
          if (subscribers.size === 0) {
            fmpSymbolSubscribers.delete(original);
          }
        }
        return;
      }
      
      if (!converted) return;
      
      clientData.twelveDataSymbols.delete(converted);
      
      const subscribers = symbolSubscribers.get(converted);
      if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          symbolSubscribers.delete(converted);
        }
      }
    });
    
    // Update subscriptions
    updateAggregatedSubscriptions();
    updateFMPSubscriptions();
  }
  
  if (action === 'heartbeat') {
    // Client heartbeat - respond to keep connection alive
    ws.send(JSON.stringify({ type: 'heartbeat' }));
  }
}

// Start the server - bind to 0.0.0.0 for Railway
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
  console.log(`📡 Health check available at http://0.0.0.0:${PORT}/health`);
  console.log(`🔑 TWELVE_DATA_API_KEY is ${TWELVE_DATA_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`🔑 FMP_API_KEY is ${FMP_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`🔑 SUPABASE is ${supabase ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
  
  // If Supabase is configured, start syncing tickers from database
  if (supabase) {
    console.log('🔄 Starting database ticker sync...');
    startTickerSync();
    
    // Connect to TwelveData immediately since we'll have symbols from database
    console.log('🔌 Connecting to TwelveData for database-synced symbols...');
    connectToTwelveData();
  } else {
    // Without Supabase, wait for clients to provide symbols
    console.log('⏳ Waiting for clients before connecting to TwelveData...');
  }
  
  console.log('📈 FMP polling will start when FMP symbols are subscribed');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  
  stopHeartbeat();
  stopFMPPolling();
  stopTickerSync();
  
  if (twelveDataWS) {
    twelveDataWS.close();
  }
  
  wss.clients.forEach((client) => {
    client.close();
  });
  
  server.close(() => {
    console.log('👋 Server shut down');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down...');
  stopFMPPolling();
  stopTickerSync();
  process.exit(0);
});
