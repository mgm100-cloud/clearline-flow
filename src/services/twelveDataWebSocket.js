// TwelveData WebSocket Service for real-time price streaming
// Connects to backend WebSocket server (shared connection) or directly to TwelveData (local dev)

const TWELVE_DATA_WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price';

// Check for backend WebSocket server URL (set this in production)
const BACKEND_WS_URL = process.env.REACT_APP_WS_SERVER_URL;

class TwelveDataWebSocketService {
  constructor() {
    this.ws = null;
    this.apiKey = null;
    this.subscribedSymbols = new Set();
    this.pendingSubscriptions = [];
    this.onPriceUpdate = null;
    this.onConnectionChange = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5 seconds
    this.isConnecting = false;
    this.heartbeatInterval = null;
    this.lastHeartbeat = null;
    this.useBackendServer = !!BACKEND_WS_URL;
    this.lastBackendStatus = null; // Track last status to avoid duplicate logs
  }

  // Initialize with API key and callbacks
  init(apiKey, onPriceUpdate, onConnectionChange, onSubscriptionStatus) {
    this.apiKey = apiKey;
    this.onPriceUpdate = onPriceUpdate;
    this.onConnectionChange = onConnectionChange;
    this.onSubscriptionStatus = onSubscriptionStatus;
    
    if (this.useBackendServer) {
      console.log('🔌 TwelveData WebSocket service initialized (using backend server)');
      console.log('🌐 Backend server URL:', BACKEND_WS_URL);
    } else {
      console.log('🔌 TwelveData WebSocket service initialized (direct connection)');
    }
  }

  // Convert Bloomberg format to TwelveData format (same logic as QuoteService)
  convertBloombergToTwelveData(symbol) {
    if (!symbol || typeof symbol !== 'string') return symbol;
    
    // Special US ticker mappings where TwelveData uses different symbols
    const usTwelveDataSymbolMap = {
      'ACHVW': 'ACHVWXX',
      'TICAW': 'TICAWX',
    };
    
    // Check for special US ticker mappings first
    const baseSymbol = symbol.trim().toUpperCase().split(' ')[0];
    if (usTwelveDataSymbolMap[baseSymbol]) {
      return usTwelveDataSymbolMap[baseSymbol];
    }
    
    // These exchanges are handled via FMP API, not TwelveData - return null to skip
    // Japan (JP, JT), Hong Kong (HK), Italy (IM, HM, TE), UK (LN), Denmark (DC), France (FP)
    const fmpExchanges = ['JP', 'JT', 'HK', 'IM', 'HM', 'TE', 'LN', 'DC', 'FP'];
    
    // Bloomberg to TwelveData suffix mapping (only exchanges supported by TwelveData)
    const bloombergToTwelveDataMap = {
      'US': '',          // US markets - just remove suffix
      'GR': ':XETR',     // Germany Xetra
      'GY': ':XETR',     // Germany Xetra (alternative)
      'CN': ':TSX',      // Canada Toronto Stock Exchange
      'CT': ':TSX',      // Canada Toronto Venture Exchange
      'AU': ':ASX',      // Australia ASX
      'SM': ':BME',      // Spain Madrid Stock Exchange (BME for WebSocket)
      'SW': ':SIX',      // Switzerland SIX Swiss Exchange
      'SS': ':SHH',      // China Shanghai Stock Exchange
      'SZ': ':SHZ',      // China Shenzhen Stock Exchange
      'IN': ':NSE',      // India National Stock Exchange (NSE more common)
      'KS': ':KRX',      // South Korea Seoul Stock Exchange
      'KP': ':KRX',      // South Korea KOSPI
      'TB': ':SET',      // Thailand Bangkok Stock Exchange (SET for WebSocket)
      'MK': ':KLSE',     // Malaysia Kuala Lumpur Stock Exchange
      'SP': ':SGX',      // Singapore Stock Exchange
      'TT': ':TWSE',     // Taiwan Stock Exchange
      'NA': ':Euronext', // Netherlands/Amsterdam Euronext
    };
    
    // Clean the symbol and convert to uppercase
    let cleanSymbol = symbol.trim().toUpperCase();
    
    // Replace slashes with periods (for UK share classes like BT/A -> BT.A)
    cleanSymbol = cleanSymbol.replace(/\//g, '.');
    
    // Check if symbol has a space-separated suffix (Bloomberg format)
    const parts = cleanSymbol.split(' ');
    
    if (parts.length === 2) {
      let [ticker, bloombergSuffix] = parts;
      
      // Skip FMP-handled exchanges silently (Japan, Hong Kong, Italy, UK, Denmark)
      if (fmpExchanges.includes(bloombergSuffix)) {
        return null; // Return null to indicate this should be skipped
      }
      
      // Also clean up the ticker part - replace slashes with periods
      ticker = ticker.replace(/\//g, '.');
      
      const twelveDataSuffix = bloombergToTwelveDataMap[bloombergSuffix];
      
      if (twelveDataSuffix !== undefined) {
        const convertedSymbol = ticker + twelveDataSuffix;
        return convertedSymbol;
      } else {
        console.warn(`Unknown Bloomberg suffix "${bloombergSuffix}" for symbol "${symbol}". Using original ticker.`);
        return ticker; // Just use the ticker without suffix
      }
    }
    
    // If no Bloomberg suffix detected, return original symbol
    return cleanSymbol;
  }
  
  // Check if a symbol is international (non-US)
  isInternationalSymbol(symbol) {
    if (!symbol || typeof symbol !== 'string') return false;
    // If it contains a colon followed by exchange code, it's international
    return symbol.includes(':');
  }

  // Connect to WebSocket (backend server or directly to TwelveData)
  connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      console.log('🔌 WebSocket already connected or connecting');
      return;
    }

    // For backend server, we don't need API key
    if (!this.useBackendServer && (!this.apiKey || this.apiKey === 'YOUR_API_KEY_HERE')) {
      console.error('❌ TwelveData API key not configured for WebSocket');
      return;
    }

    this.isConnecting = true;
    
    const wsUrl = this.useBackendServer 
      ? BACKEND_WS_URL 
      : `${TWELVE_DATA_WS_URL}?apikey=${this.apiKey}`;
    
    console.log(`🔌 Connecting to ${this.useBackendServer ? 'backend' : 'TwelveData'} WebSocket...`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`✅ ${this.useBackendServer ? 'Backend' : 'TwelveData'} WebSocket connected`);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        if (this.onConnectionChange) {
          this.onConnectionChange(true);
        }

        // Start heartbeat
        this.startHeartbeat();

        // Clear pending subscriptions - the App.js useEffect will handle subscriptions
        // This prevents double-subscribing
        this.pendingSubscriptions = [];
        
        // Note: We don't resubscribe here - the App.js useEffect will detect
        // the connection change and call updateSubscriptions() with the current tickers
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code, event.reason);
        this.isConnecting = false;
        this.stopHeartbeat();
        
        if (this.onConnectionChange) {
          this.onConnectionChange(false);
        }

        // Attempt reconnection
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('❌ Error creating WebSocket:', error);
      this.isConnecting = false;
    }
  }

  // Handle incoming messages
  handleMessage(data) {
    // Track last activity for connection health monitoring
    this.lastHeartbeat = Date.now();
    
    // Handle backend server message format
    if (this.useBackendServer) {
      this.handleBackendMessage(data);
      return;
    }
    
    // Handle direct TwelveData message format
    this.handleTwelveDataMessage(data);
  }

  // Handle messages from backend server
  handleBackendMessage(data) {
    const { type } = data;
    
    if (type === 'heartbeat') {
      return;
    }
    
    if (type === 'connection') {
      // Only log if status actually changed
      const newStatus = data.connected ? 'connected' : 'disconnected';
      if (this.lastBackendStatus !== newStatus) {
        console.log(`🔌 Backend TwelveData status: ${data.connected ? 'Connected' : 'Disconnected'}`);
        this.lastBackendStatus = newStatus;
      }
      return;
    }
    
    if (type === 'subscription-status') {
      // Only log summary, not full details
      const successCount = data.success?.length || 0;
      const failCount = data.fails?.length || 0;
      console.log(`📊 Subscription: ${successCount} success, ${failCount} fails`);
      
      // Notify the app of subscription status
      if (this.onSubscriptionStatus) {
        this.onSubscriptionStatus({
          success: data.success || [],
          fails: data.fails || []
        });
      }
      return;
    }
    
    if (type === 'cached-prices') {
      // Batch of cached prices from backend (sent on initial connection)
      const receivedCount = data.count || data.prices?.length || 0;
      const totalRequested = data.totalRequested || 'unknown';
      const missingCount = data.missing || 0;
      
      console.log(`📦 Received ${receivedCount} cached prices from backend (requested: ${totalRequested}, missing: ${missingCount})`);
      
      if (missingCount > 0) {
        console.warn(`⚠️ ${missingCount} symbols don't have cached prices - check Railway logs for details`);
      }
      
      if (data.prices && Array.isArray(data.prices) && this.onPriceUpdate) {
        data.prices.forEach(priceData => {
          this.onPriceUpdate({
            symbol: priceData.symbol,
            price: priceData.price,
            timestamp: priceData.timestamp,
            dayVolume: priceData.dayVolume,
            exchange: priceData.exchange,
            cached: true
          });
        });
      }
      return;
    }
    
    if (type === 'price') {
      // Price update from backend - don't log every price to reduce noise
      const priceData = {
        symbol: data.symbol,
        price: data.price,
        timestamp: data.timestamp,
        dayVolume: data.dayVolume,
        exchange: data.exchange
      };

      if (this.onPriceUpdate) {
        this.onPriceUpdate(priceData);
      }
      return;
    }
  }

  // Handle direct TwelveData messages (for local development)
  handleTwelveDataMessage(data) {
    // Log all incoming messages for debugging (except heartbeat responses to reduce noise)
    if (data.event !== 'heartbeat') {
      console.log('📨 WebSocket message received:', data);
    }
    
    // Handle different message types
    if (data.event === 'subscribe-status') {
      console.log('📊 Subscription status:', data);
      if (data.success) {
        console.log('✅ Successfully subscribed to:', data.success.length, 'symbols');
      }
      if (data.fails && data.fails.length > 0) {
        // Categorize failures - international vs US
        const intlFails = data.fails.filter(f => {
          const sym = typeof f === 'string' ? f : f?.symbol || '';
          return sym.includes(':'); // International symbols have exchange suffix
        });
        const usFails = data.fails.filter(f => {
          const sym = typeof f === 'string' ? f : f?.symbol || '';
          return !sym.includes(':');
        });
        
        if (usFails.length > 0) {
          console.warn('❌ Failed to subscribe to US symbols:', usFails);
        }
        if (intlFails.length > 0) {
          console.log('⚠️ International symbols not available via WebSocket:', intlFails.length, 'symbols');
        }
      }
      // Notify the app of subscription status
      if (this.onSubscriptionStatus) {
        this.onSubscriptionStatus({
          success: data.success || [],
          fails: data.fails || []
        });
      }
      return;
    }

    if (data.event === 'unsubscribe-status') {
      console.log('📊 Unsubscription status:', data);
      return;
    }
    
    // Handle errors
    if (data.status === 'error' || data.code) {
      console.error('❌ WebSocket error:', data.message || data);
      return;
    }

    if (data.event === 'heartbeat') {
      this.lastHeartbeat = Date.now();
      return;
    }

    // TwelveData WebSocket sends price updates directly without event wrapper
    // Check if this is a price update (has symbol and price fields)
    if (data.symbol && data.price !== undefined) {
      // Price update received
      const priceData = {
        symbol: data.symbol,
        price: parseFloat(data.price),
        timestamp: data.timestamp,
        dayVolume: data.day_volume ? parseInt(data.day_volume) : null,
        exchange: data.exchange
      };

      console.log('💰 Price update:', priceData.symbol, priceData.price);

      if (this.onPriceUpdate) {
        this.onPriceUpdate(priceData);
      }
      return;
    }

    // Handle event-based price updates (fallback)
    if (data.event === 'price') {
      const priceData = {
        symbol: data.symbol,
        price: parseFloat(data.price),
        timestamp: data.timestamp,
        dayVolume: data.day_volume ? parseInt(data.day_volume) : null,
        exchange: data.exchange
      };

      console.log('💰 Price update (event):', priceData.symbol, priceData.price);

      if (this.onPriceUpdate) {
        this.onPriceUpdate(priceData);
      }
    }
  }

  // Subscribe to symbols (in chunks to avoid limits)
  subscribe(symbols) {
    if (!symbols || symbols.length === 0) return;

    // For backend server, send original symbols (backend handles conversion)
    if (this.useBackendServer) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.log('📋 Queuing subscriptions for when connected:', symbols.length, 'symbols');
        this.pendingSubscriptions.push(...symbols);
        this.connect();
        return;
      }

      const subscribeMessage = {
        action: 'subscribe',
        symbols: symbols
      };

      console.log(`📊 Subscribing to ${symbols.length} symbols via backend`);
      this.ws.send(JSON.stringify(subscribeMessage));
      
      // Track subscribed symbols
      symbols.forEach(s => this.subscribedSymbols.add(s));
      return;
    }

    // Direct TwelveData connection - convert symbols
    const convertedSymbols = symbols
      .map(s => this.convertBloombergToTwelveData(s))
      .filter(s => s !== null && s !== undefined);

    if (convertedSymbols.length === 0) {
      console.log('📋 No symbols to subscribe after filtering (e.g., Japanese stocks use FMP)');
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Queue for later if not connected (only TwelveData-supported symbols)
      const fmpSuffixes = ['JP', 'JT', 'HK', 'IM', 'HM', 'TE', 'LN', 'DC'];
      const twelveDataSymbols = symbols.filter(s => {
        const upper = s?.toUpperCase() || '';
        return !fmpSuffixes.some(suffix => upper.includes(` ${suffix}`));
      });
      if (twelveDataSymbols.length > 0) {
        console.log('📋 Queuing subscriptions for when connected:', twelveDataSymbols.length, 'symbols');
        this.pendingSubscriptions.push(...twelveDataSymbols);
      }
      
      // Try to connect if not already
      this.connect();
      return;
    }

    // TwelveData has limits - subscribe in chunks of 100
    const chunkSize = 100;
    for (let i = 0; i < convertedSymbols.length; i += chunkSize) {
      const chunk = convertedSymbols.slice(i, i + chunkSize);
      
      // TwelveData subscription message format
      const subscribeMessage = {
        action: 'subscribe',
        params: {
          symbols: chunk.join(',')
        }
      };

      console.log(`📊 Subscribing to symbols chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(convertedSymbols.length/chunkSize)}:`, chunk.length, 'symbols');
      console.log('📤 Sending subscription:', JSON.stringify(subscribeMessage));
      this.ws.send(JSON.stringify(subscribeMessage));
    }

    // Track subscribed symbols (keep original format for mapping)
    symbols.forEach(s => this.subscribedSymbols.add(s));
  }

  // Unsubscribe from symbols
  unsubscribe(symbols) {
    if (!symbols || symbols.length === 0) return;

    // For backend server
    if (this.useBackendServer) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const unsubscribeMessage = {
          action: 'unsubscribe',
          symbols: symbols
        };
        console.log('📊 Unsubscribing from symbols via backend:', symbols.length);
        this.ws.send(JSON.stringify(unsubscribeMessage));
      }
      symbols.forEach(s => this.subscribedSymbols.delete(s));
      return;
    }

    // Direct TwelveData connection
    const convertedSymbols = symbols
      .map(s => this.convertBloombergToTwelveData(s))
      .filter(s => s !== null && s !== undefined);

    if (convertedSymbols.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const unsubscribeMessage = {
        action: 'unsubscribe',
        params: {
          symbols: convertedSymbols.join(',')
        }
      };

      console.log('📊 Unsubscribing from symbols:', convertedSymbols);
      this.ws.send(JSON.stringify(unsubscribeMessage));
    }

    // Remove from tracked symbols
    symbols.forEach(s => this.subscribedSymbols.delete(s));
  }

  // Unsubscribe from all and resubscribe to new list
  updateSubscriptions(newSymbols) {
    // Unsubscribe from symbols no longer needed
    const currentSymbols = Array.from(this.subscribedSymbols);
    const symbolsToRemove = currentSymbols.filter(s => !newSymbols.includes(s));
    const symbolsToAdd = newSymbols.filter(s => !this.subscribedSymbols.has(s));

    if (symbolsToRemove.length > 0) {
      this.unsubscribe(symbolsToRemove);
    }

    if (symbolsToAdd.length > 0) {
      this.subscribe(symbolsToAdd);
    }
  }
  
  // Request cached prices for specific symbols (for retrying missing prices)
  requestCachedPrices(symbols) {
    if (!symbols || symbols.length === 0) return;
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('⚠️ Cannot request cached prices - WebSocket not connected');
      return;
    }
    
    if (!this.useBackendServer) {
      console.log('⚠️ get-cached-prices only supported with backend server');
      return;
    }
    
    const message = {
      action: 'get-cached-prices',
      symbols: symbols
    };
    
    this.ws.send(JSON.stringify(message));
  }

  // Start heartbeat to keep connection alive
  // TwelveData recommends sending heartbeat every 10 seconds
  startHeartbeat() {
    this.stopHeartbeat();
    this.lastHeartbeat = Date.now();
    this.heartbeatCount = 0;
    
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send heartbeat message to keep connection alive
        const heartbeatMessage = { action: 'heartbeat' };
        this.ws.send(JSON.stringify(heartbeatMessage));
        this.heartbeatCount++;
        
        // Only log every 6th heartbeat (once per minute) to reduce noise
        if (this.heartbeatCount % 6 === 0) {
          console.log('💓 Heartbeat sent (connection alive)');
        }
        
        // Check if we've received any data recently - use 5 minutes since markets may be closed
        const now = Date.now();
        if (this.lastHeartbeat && (now - this.lastHeartbeat) > 300000) {
          // No activity in 5 minutes, connection might be stale
          console.warn('⚠️ No activity in 5 minutes, reconnecting...');
          this.ws.close();
        }
      }
    }, 10000); // Send heartbeat every 10 seconds as recommended by TwelveData
  }

  // Stop heartbeat
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Attempt to reconnect
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay/1000}s...`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  // Disconnect WebSocket
  disconnect() {
    console.log('🔌 Disconnecting WebSocket...');
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.subscribedSymbols.clear();
    this.pendingSubscriptions = [];
  }

  // Check if connected
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  // Get connection status
  getStatus() {
    return {
      connected: this.isConnected(),
      subscribedCount: this.subscribedSymbols.size,
      reconnectAttempts: this.reconnectAttempts,
      useBackendServer: this.useBackendServer
    };
  }
}

// Export singleton instance
export const twelveDataWS = new TwelveDataWebSocketService();
export default twelveDataWS;
