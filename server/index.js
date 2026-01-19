// Backend WebSocket Server for TwelveData Price Streaming
// This server maintains a single connection to TwelveData and serves multiple clients

const WebSocket = require('ws');
const http = require('http');

// Configuration
const PORT = process.env.PORT || 3001;
const TWELVE_DATA_WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price';
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;

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
      subscribedSymbols: subscribedSymbols.size,
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
    
    // Convert Swiss prices (quoted in cents)
    if (data.symbol.endsWith(':SIX')) {
      price = price / 100;
    }
    
    const priceData = {
      type: 'price',
      symbol: data.symbol,
      price: price,
      timestamp: data.timestamp,
      dayVolume: data.day_volume ? parseInt(data.day_volume) : null,
      exchange: data.exchange
    };
    
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
  // Collect all symbols needed by all clients
  const neededSymbols = new Set();
  clients.forEach((symbols) => {
    symbols.forEach((symbol) => neededSymbols.add(symbol));
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
  
  // Initialize client's subscription set
  clients.set(ws, new Set());
  
  // Connect to TwelveData if this is the first client and we're not already connected
  if (!twelveDataWS || twelveDataWS.readyState !== WebSocket.OPEN) {
    console.log('🔌 First client connected, connecting to TwelveData...');
    connectToTwelveData();
  }
  
  // Send initial connection status
  ws.send(JSON.stringify({
    type: 'connection',
    connected: isConnected,
    subscribedSymbols: subscribedSymbols.size
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
    
    // Remove client's subscriptions from symbol tracking
    const clientSymbols = clients.get(ws);
    if (clientSymbols) {
      clientSymbols.forEach((symbol) => {
        const subscribers = symbolSubscribers.get(symbol);
        if (subscribers) {
          subscribers.delete(ws);
          if (subscribers.size === 0) {
            symbolSubscribers.delete(symbol);
          }
        }
      });
    }
    
    // Remove client
    clients.delete(ws);
    
    // Update TwelveData subscriptions
    updateAggregatedSubscriptions();
    
    console.log(`📊 Active clients: ${clients.size}, Subscribed symbols: ${subscribedSymbols.size}`);
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
    
    const clientSymbols = clients.get(ws);
    const convertedSymbols = [];
    
    symbols.forEach((symbol) => {
      const { converted, original, isFMP } = convertBloombergToTwelveData(symbol);
      
      if (isFMP || converted === null) {
        // Skip FMP-handled symbols for TwelveData
        return;
      }
      
      // Track client's subscriptions using converted symbol
      clientSymbols.add(converted);
      convertedSymbols.push(converted);
      
      // Track which clients are subscribed to which symbols
      if (!symbolSubscribers.has(converted)) {
        symbolSubscribers.set(converted, new Set());
      }
      symbolSubscribers.get(converted).add(ws);
    });
    
    // Update TwelveData subscriptions
    updateAggregatedSubscriptions();
  }
  
  if (action === 'unsubscribe' && Array.isArray(symbols)) {
    console.log(`📤 Client unsubscribing from ${symbols.length} symbols`);
    
    const clientSymbols = clients.get(ws);
    
    symbols.forEach((symbol) => {
      const { converted } = convertBloombergToTwelveData(symbol);
      if (!converted) return;
      
      clientSymbols.delete(converted);
      
      const subscribers = symbolSubscribers.get(converted);
      if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          symbolSubscribers.delete(converted);
        }
      }
    });
    
    // Update TwelveData subscriptions
    updateAggregatedSubscriptions();
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
  
  // Don't connect to TwelveData immediately - wait for clients
  // This prevents unnecessary reconnection loops when no one is using the service
  console.log('⏳ Waiting for clients before connecting to TwelveData...');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  
  stopHeartbeat();
  
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
  process.exit(0);
});
