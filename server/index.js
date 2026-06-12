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

// Error tracking - stores error messages for symbols that failed to get prices
// Key: symbol, Value: { error, timestamp, source }
const symbolErrors = new Map();

// Track pending subscription requests to detect unacknowledged symbols
// Key: symbol, Value: { timestamp, chunkId }
const pendingSubscriptions = new Map();
let subscriptionChunkId = 0;

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
// KS/KQ/KP (Korea), AU (Australia) and CN/CT (Canada) added because the
// TwelveData WebSocket rejects KRX outright and never acknowledges
// ASX/TSX subscriptions - FMP quotes all of them.
const fmpExchanges = ['JP', 'JT', 'HK', 'IM', 'HM', 'TE', 'LN', 'DC', 'FP',
                      'KS', 'KQ', 'KP', 'AU', 'CN', 'CT'];

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
  // Baseline closes/opens for Prism's Live period selector (CORS-enabled GET).
  if (req.url && req.url.indexOf('/closes') === 0) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    let qs = ''; const qi = req.url.indexOf('?');
    if (qi >= 0) qs = req.url.slice(qi + 1);
    const params = new URLSearchParams(qs);
    const symbols = (params.get('symbols') || '').split(',').map(decodeURIComponent).filter(Boolean).slice(0, 600);
    fetchFMPDetail(symbols).then((out) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    }).catch(() => { res.writeHead(500); res.end('{}'); });
    return;
  }
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
      
      // Clear pending subscriptions since they'll need to be resent
      if (pendingSubscriptions.size > 0) {
        console.log(`📋 Clearing ${pendingSubscriptions.size} pending subscriptions due to disconnect`);
        pendingSubscriptions.clear();
      }
      
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

// Helper to extract symbol string from TwelveData response item (could be string or object)
function extractSymbol(item) {
  if (typeof item === 'string') return item;
  if (typeof item === 'object' && item !== null) {
    return item.symbol || item.s || JSON.stringify(item);
  }
  return String(item);
}

// Maps a TwelveData-converted symbol back to the Bloomberg-format symbol
// the client originally subscribed with (e.g. "MAY:KLSE" -> "1155 MK"),
// so the FMP fallback can derive a valid FMP symbol and broadcast prices
// under the key clients are listening for.
const convertedToOriginal = new Map();

// Route a symbol the TwelveData WebSocket cannot stream (explicit fail or
// never acknowledged) to the FMP poller instead, carrying its subscriber
// list over so price broadcasts keep reaching the right clients.
function fallbackToFMP(twelveDataSymbol) {
  const original = convertedToOriginal.get(twelveDataSymbol) || twelveDataSymbol;
  const fmpSymbol = convertToFMPSymbol(original);
  if (!fmpSymbol) return; // not representable on FMP

  const subs = symbolSubscribers.get(twelveDataSymbol);
  if (!subs || subs.size === 0) return;

  if (!fmpSymbolSubscribers.has(original)) {
    fmpSymbolSubscribers.set(original, new Set());
  }
  const fmpSubs = fmpSymbolSubscribers.get(original);
  let added = 0;
  subs.forEach((ws) => {
    if (!fmpSubs.has(ws)) {
      fmpSubs.add(ws);
      added++;
    }
    const clientData = clients.get(ws);
    if (clientData) clientData.fmpSymbols.add(original);
  });

  if (added > 0) {
    console.log(`🔁 FMP fallback engaged for ${original} -> ${fmpSymbol} (${added} subscriber${added === 1 ? '' : 's'})`);
    updateFMPSubscriptions();
  }
}

// Handle messages from TwelveData
function handleTwelveDataMessage(data) {
  // Handle subscription status
  if (data.event === 'subscribe-status') {
    const successItems = data.success || [];
    const failItems = data.fails || [];
    const successCount = successItems.length;
    const failCount = failItems.length;
    
    console.log(`📊 Subscription batch status: ${successCount} success, ${failCount} fails (Total errors so far: ${symbolErrors.size})`);
    
    // Process successful subscriptions (extract symbol names properly)
    if (successCount > 0) {
      successItems.forEach((item) => {
        const symbol = extractSymbol(item);
        // Remove from pending
        pendingSubscriptions.delete(symbol);
        // Clear any previous error
        symbolErrors.delete(symbol);
      });
    }
    
    // Track failed subscriptions with full details
    if (failCount > 0) {
      failItems.forEach((fail) => {
        const symbol = extractSymbol(fail);
        const exchange = typeof fail === 'object' && fail.exchange ? fail.exchange : 'unknown';
        // Capture the FULL failure object so we see exactly what TwelveData returned
        const errorMsg = typeof fail === 'object' ? JSON.stringify(fail) : 'Subscription failed (no details)';
        if (symbol && symbol !== '{}') {
          symbolErrors.set(symbol, {
            error: errorMsg,
            timestamp: Date.now(),
            source: 'twelvedata-ws',
            exchange: exchange
          });
          // Remove from pending
          pendingSubscriptions.delete(symbol);
          // Try FMP instead of giving up
          fallbackToFMP(symbol);
        }
      });
    }
    
    // Check for symbols that were sent but NOT acknowledged (still in pending)
    // These symbols were sent to TwelveData but didn't appear in success OR fails
    const now = Date.now();
    const staleThreshold = 5000; // 5 seconds
    pendingSubscriptions.forEach((info, symbol) => {
      const ageMs = now - info.timestamp;
      if (ageMs > staleThreshold) {
        // Track as error
        symbolErrors.set(symbol, {
          error: `Sent to TwelveData but never acknowledged (no success or fail response after ${Math.round(ageMs/1000)}s)`,
          timestamp: now,
          source: 'twelvedata-ws-unacknowledged'
        });
        // Stop re-reporting it and try FMP instead
        pendingSubscriptions.delete(symbol);
        fallbackToFMP(symbol);
      }
    });
    
    // Log current totals
    console.log(`   Pending: ${pendingSubscriptions.size}, Total tracked errors: ${symbolErrors.size}`);
    
    // Broadcast subscription status to all clients
    broadcastToClients({
      type: 'subscription-status',
      success: successItems,
      fails: failItems
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
    
    // Track price updates received
    priceUpdatesReceived++;
    
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
  
  // Log missing symbols with actual error messages - NO TRUNCATION, show ALL
  if (missingSymbols.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`⚠️ MISSING PRICES: ${missingSymbols.length} symbols without cached prices`);
    console.log(`📊 Stats: Cache=${priceCache.size}, ErrorsTracked=${symbolErrors.size}`);
    console.log(`${'='.repeat(80)}`);
    
    // Log ALL missing symbols - no truncation
    for (let i = 0; i < missingSymbols.length; i++) {
      const m = missingSymbols[i];
      try {
        // Check for stored error message
        const symbolToCheck = m.converted || m.original;
        const errorInfo = symbolErrors.get(symbolToCheck) || symbolErrors.get(m.original);
        
        let errorMsg = 'No error recorded - price not yet received';
        if (errorInfo) {
          errorMsg = `[${errorInfo.source}] ${errorInfo.error}`;
        }
        
        console.log(`  ${i+1}. ${m.original} -> ${m.converted || 'null'}`);
        console.log(`     Error: ${errorMsg}`);
      } catch (err) {
        console.log(`  ${i+1}. ERROR logging ${m.original}: ${err.message}`);
      }
    }
    
    console.log(`${'='.repeat(80)}\n`);
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
    const chunkId = ++subscriptionChunkId;
    const message = {
      action: 'subscribe',
      params: {
        symbols: chunk.join(',')
      }
    };
    
    // Track pending subscriptions
    const now = Date.now();
    chunk.forEach(symbol => {
      pendingSubscriptions.set(symbol, { timestamp: now, chunkId });
    });
    
    console.log(`📊 Subscribing to chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(symbols.length/chunkSize)}: ${chunk.length} symbols (chunkId: ${chunkId})`);
    console.log(`   Symbols: ${chunk.join(', ')}`);
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
    const chunkId = ++subscriptionChunkId;
    const message = {
      action: 'subscribe',
      params: {
        symbols: chunk.join(',')
      }
    };
    
    // Track pending subscriptions
    const now = Date.now();
    chunk.forEach(symbol => {
      pendingSubscriptions.set(symbol, { timestamp: now, chunkId });
    });
    
    console.log(`📊 Subscribing to chunk ${chunkNum}/${totalChunks}: ${chunk.length} symbols (chunkId: ${chunkId})`);
    console.log(`   Symbols: ${chunk.join(', ')}`);
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

  // Plain US tickers (no exchange suffix) pass through unchanged - used by
  // the TwelveData-fallback path for symbols the WebSocket never streams
  // (e.g. micro caps). TwelveData's converted intl symbols (TICKER:EXCH)
  // are not valid FMP symbols.
  if (parts.length === 1) {
    return cleanSymbol.includes(':') ? null : cleanSymbol.replace(/\//g, '-');
  }

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
    'FP': '.PA',   // Paris Stock Exchange (France)
    'KS': '.KS',   // Korea KOSPI
    'KQ': '.KQ',   // Korea KOSDAQ
    'KP': '.KS',   // Korea KOSPI (alternative)
    'AU': '.AX',   // Australia ASX
    'CN': '.TO',   // Canada composite -> Toronto
    'CT': '.TO',   // Canada Toronto (Bloomberg CT; verified vs Citco extract)
    'CV': '.V',    // Canada TSX Venture
    'MK': '.KL',   // Malaysia Bursa (use the numeric Bursa code as ticker)
  };

  const fmpSuffix = fmpExchangeMap[exchange];
  if (!fmpSuffix) return null;

  return ticker + fmpSuffix;
}

// Fetch open + previousClose for a list of original (Bloomberg-format) symbols.
// Returns { originalSymbol: { open, prevClose } } in the listing's native units.
// Used by Prism's Live "period" selector (Today = since open, Last 24h = since
// prior close). One batched FMP /quote call covers US + international.
function fetchFMPDetail(originalSymbols) {
  return new Promise((resolve) => {
    if (!FMP_API_KEY || !originalSymbols.length) { resolve({}); return; }
    const fmpToOrig = new Map();
    originalSymbols.forEach((o) => {
      const f = convertToFMPSymbol(o);
      if (f) { if (!fmpToOrig.has(f)) fmpToOrig.set(f, []); fmpToOrig.get(f).push(o); }
    });
    const fmpList = Array.from(fmpToOrig.keys());
    if (!fmpList.length) { resolve({}); return; }
    const url = `${FMP_BASE_URL}/quote/${fmpList.join(',')}?apikey=${FMP_API_KEY}`;
    https.get(url, (r) => {
      let data = '';
      r.on('data', (c) => { data += c; });
      r.on('end', () => {
        const out = {};
        try {
          const arr = JSON.parse(data);
          if (Array.isArray(arr)) arr.forEach((q) => {
            (fmpToOrig.get(q.symbol) || []).forEach((o) => {
              out[o] = { open: q.open != null ? q.open : null, prevClose: q.previousClose != null ? q.previousClose : null };
            });
          });
        } catch (e) { /* return whatever we have */ }
        resolve(out);
      });
    }).on('error', () => resolve({}));
  });
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
  
  // Log detailed info about ALL failed symbols - no truncation
  if (failedSymbols.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`❌ FMP FAILED SYMBOLS: ${failedSymbols.length} total`);
    console.log(`${'='.repeat(80)}`);
    failedSymbols.forEach(({ symbol, error }, index) => {
      const fmpSymbol = convertToFMPSymbol(symbol);
      console.log(`  ${index + 1}. ${symbol} -> FMP: ${fmpSymbol}`);
      console.log(`     Error: ${error}`);
    });
    console.log(`${'='.repeat(80)}\n`);
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

// ==================== CACHE SEEDING ====================
// The price cache is in-memory, so any restart (deploy, crash, Railway
// maintenance) leaves clients price-less until live ticks resume - which
// overnight means no prices until the next session. On boot, seed the
// cache with last quotes from FMP for every TwelveData-subscribed symbol
// FMP can represent, and broadcast them like normal ticks. FMP-path
// symbols already self-seed because polling fetches immediately on start.
let cacheSeedRuns = 0;
async function seedPriceCache() {
  cacheSeedRuns++;
  if (!FMP_API_KEY) return;
  const candidates = Array.from(symbolSubscribers.keys())
    .filter((s) => !priceCache.has(s))
    .filter((s) => convertToFMPSymbol(s)); // representable on FMP
  if (candidates.length === 0) {
    console.log(`🌱 Cache seed run ${cacheSeedRuns}: nothing to seed (${priceCache.size} cached)`);
    return;
  }
  console.log(`🌱 Cache seed run ${cacheSeedRuns}: fetching last quotes for ${candidates.length} symbols...`);
  let seeded = 0;
  const batchSize = 50;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const priceUpdates = await fetchFMPQuotes(candidates.slice(i, i + batchSize));
    priceUpdates.forEach((priceData) => {
      if (priceCache.has(priceData.symbol)) return; // a live tick won the race
      priceCache.set(priceData.symbol, {
        price: priceData.price,
        timestamp: priceData.timestamp || Date.now(),
        source: 'fmp-seed',
        dayVolume: priceData.dayVolume,
        exchange: priceData.exchange
      });
      seeded++;
      broadcastPriceUpdate(priceData);
    });
  }
  console.log(`🌱 Cache seed run ${cacheSeedRuns} complete: ${seeded} prices seeded (cache now ${priceCache.size})`);
}
// after subscriptions settle on boot, then a slow recurring sweep so
// symbols subscribed later (new clients, ticker sync) also get a last
// quote when no live ticks are flowing. Skips anything already cached,
// so during market hours it does essentially nothing.
setTimeout(seedPriceCache, 30000);
setInterval(seedPriceCache, 5 * 60 * 1000);

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
    
    // Wait for subscription responses to come back, then log all failures
    setTimeout(() => {
      dumpAllSubscriptionFailures();
    }, 10000); // Wait 10 seconds for all subscription responses
    
    // Fetch initial prices for symbols without cached prices
    // Run this in background after a short delay to let WebSocket subscriptions complete
    setTimeout(async () => {
      await fetchInitialPrices();
    }, 15000); // Wait 15 seconds (after subscription failures are logged)
    
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
          // Clear any previous error for this symbol
          symbolErrors.delete(symbol);
          successCount++;
        } else {
          errorCount++;
          // Capture the FULL TwelveData response as the error message
          let errorMsg;
          if (data) {
            // Include the entire response so we can see exactly what TwelveData returned
            errorMsg = JSON.stringify(data);
          } else {
            errorMsg = 'No response data';
          }
          failedSymbols.push({ symbol, error: errorMsg });
          // Store in symbolErrors map for later reference
          symbolErrors.set(symbol, {
            error: errorMsg,
            timestamp: Date.now(),
            source: 'twelvedata-rest'
          });
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
        const errorMsg = `Batch error: ${error.message}`;
        failedSymbols.push({ symbol, error: errorMsg });
        symbolErrors.set(symbol, {
          error: errorMsg,
          timestamp: Date.now(),
          source: 'twelvedata-rest-batch'
        });
      });
      errorCount += batch.length;
    }
  }
  
  console.log(`📊 Initial price fetch complete: ${successCount} success, ${errorCount} errors`);
  console.log(`💾 Price cache now has ${priceCache.size} entries`);
  
  // Log detailed info about ALL failed symbols - no truncation
  if (failedSymbols.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`❌ INITIAL PRICE FETCH FAILED: ${failedSymbols.length} symbols`);
    console.log(`${'='.repeat(80)}`);
    failedSymbols.forEach(({ symbol, error }, index) => {
      console.log(`  ${index + 1}. ${symbol}`);
      console.log(`     Error: ${error}`);
    });
    console.log(`${'='.repeat(80)}\n`);
  }
  
  // After initial fetch, dump ALL tracked errors so we have a complete picture
  console.log(`\n📋 INITIAL FETCH COMPLETE - Dumping all tracked errors...`);
  dumpAllSymbolErrors();
}

// ==================== END INITIAL PRICE FETCH ====================

// Track price updates received
let priceUpdatesReceived = 0;
let lastPriceUpdateLog = Date.now();
let lastErrorDumpLog = Date.now();

// Dump all tracked symbol errors to the log
function dumpAllSymbolErrors() {
  if (symbolErrors.size === 0) {
    console.log('✅ No symbol errors tracked');
    return;
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`❌ ALL TRACKED SYMBOL ERRORS (${symbolErrors.size} total)`);
  console.log(`${'='.repeat(80)}`);
  
  // Group errors by source for better readability
  const errorsBySource = new Map();
  symbolErrors.forEach((errorInfo, symbol) => {
    const source = errorInfo.source || 'unknown';
    if (!errorsBySource.has(source)) {
      errorsBySource.set(source, []);
    }
    errorsBySource.get(source).push({ symbol, ...errorInfo });
  });
  
  // Log each source group
  errorsBySource.forEach((errors, source) => {
    console.log(`\n📍 Source: ${source} (${errors.length} errors)`);
    console.log(`${'-'.repeat(60)}`);
    errors.forEach((err, index) => {
      const age = Math.round((Date.now() - err.timestamp) / 1000);
      console.log(`  ${index + 1}. ${err.symbol}`);
      console.log(`     Error: ${err.error}`);
      console.log(`     Age: ${age}s ago`);
    });
  });
  
  console.log(`\n${'='.repeat(80)}\n`);
}

// Dump ALL subscription failures across all batches - consolidated list
function dumpAllSubscriptionFailures() {
  // Get all TwelveData WebSocket related errors
  const wsErrors = [];
  symbolErrors.forEach((errorInfo, symbol) => {
    if (errorInfo.source && errorInfo.source.startsWith('twelvedata-ws')) {
      wsErrors.push({ symbol, ...errorInfo });
    }
  });
  
  if (wsErrors.length === 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ ALL TWELVEDATA SUBSCRIPTIONS SUCCESSFUL`);
    console.log(`   Total subscribed: ${subscribedSymbols.size}`);
    console.log(`${'='.repeat(80)}\n`);
    return;
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`❌ CONSOLIDATED TWELVEDATA SUBSCRIPTION FAILURES: ${wsErrors.length} total`);
  console.log(`${'='.repeat(80)}`);
  console.log(`   Successfully subscribed: ${subscribedSymbols.size}`);
  console.log(`   Failed subscriptions: ${wsErrors.length}`);
  console.log(`${'-'.repeat(80)}`);
  
  // Sort by symbol for easier reading
  wsErrors.sort((a, b) => a.symbol.localeCompare(b.symbol));
  
  wsErrors.forEach((err, index) => {
    console.log(`  ${index + 1}. ${err.symbol}`);
    console.log(`     Source: ${err.source}`);
    console.log(`     Error: ${err.error}`);
  });
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📋 SUMMARY: ${wsErrors.length} symbols failed to subscribe to TwelveData`);
  console.log(`   List of failed symbols: ${wsErrors.map(e => e.symbol).join(', ')}`);
  console.log(`${'='.repeat(80)}\n`);
}

// Start heartbeat to keep TwelveData connection alive
function startHeartbeat() {
  stopHeartbeat();
  
  heartbeatInterval = setInterval(() => {
    if (twelveDataWS && twelveDataWS.readyState === WebSocket.OPEN) {
      twelveDataWS.send(JSON.stringify({ action: 'heartbeat' }));
      
      // Log cache status every minute (every 6 heartbeats since heartbeat is every 10s)
      const now = Date.now();
      if (now - lastPriceUpdateLog >= 60000) {
        console.log(`📊 Status: Cache=${priceCache.size}, Subscribed=${subscribedSymbols.size}, ServerManaged=${serverManagedTwelveDataSymbols.size}, FMP=${fmpSymbols.size}, PriceUpdates=${priceUpdatesReceived}, ErrorsTracked=${symbolErrors.size}, PendingSubs=${pendingSubscriptions.size}`);
        lastPriceUpdateLog = now;
        
        // Check for stale pending subscriptions (sent more than 30 seconds ago)
        if (pendingSubscriptions.size > 0) {
          const staleThreshold = 30000; // 30 seconds
          const staleSymbols = [];
          pendingSubscriptions.forEach((info, symbol) => {
            const age = now - info.timestamp;
            if (age > staleThreshold) {
              staleSymbols.push({ symbol, ageMs: age, chunkId: info.chunkId });
            }
          });
          
          if (staleSymbols.length > 0) {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`⚠️ STALE PENDING SUBSCRIPTIONS: ${staleSymbols.length} symbols sent but never acknowledged`);
            console.log(`${'='.repeat(80)}`);
            staleSymbols.forEach((item, index) => {
              const ageSec = Math.round(item.ageMs / 1000);
              console.log(`  ${index + 1}. ${item.symbol}`);
              console.log(`     Sent ${ageSec}s ago in chunk #${item.chunkId}`);
              // Track as error if not already tracked
              if (!symbolErrors.has(item.symbol)) {
                symbolErrors.set(item.symbol, {
                  error: `Sent to TwelveData ${ageSec}s ago but never acknowledged`,
                  timestamp: now,
                  source: 'twelvedata-ws-unacknowledged'
                });
              }
            });
            console.log(`${'='.repeat(80)}\n`);
          }
        }
      }
      
      // Dump all symbol errors every 5 minutes (30 heartbeats)
      if (now - lastErrorDumpLog >= 300000 && symbolErrors.size > 0) {
        dumpAllSubscriptionFailures();
        dumpAllSymbolErrors();
        lastErrorDumpLog = now;
      }
      
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

      // Remember the original Bloomberg form for the FMP fallback path
      if (converted !== original && !convertedToOriginal.has(converted)) {
        convertedToOriginal.set(converted, original);
      }

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
  
  if (action === 'get-cached-prices' && Array.isArray(symbols)) {
    // Client requesting cached prices for specific symbols (for retrying missing prices)
    console.log(`🔄 Client requesting cached prices for ${symbols.length} symbols`);
    sendCachedPricesToClient(ws, symbols);
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
