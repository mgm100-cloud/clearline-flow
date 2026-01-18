// TwelveData WebSocket Service for real-time price streaming

const TWELVE_DATA_WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price';

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
  }

  // Initialize with API key and callbacks
  init(apiKey, onPriceUpdate, onConnectionChange) {
    this.apiKey = apiKey;
    this.onPriceUpdate = onPriceUpdate;
    this.onConnectionChange = onConnectionChange;
    console.log('🔌 TwelveData WebSocket service initialized');
  }

  // Convert Bloomberg format to TwelveData format (same logic as QuoteService)
  convertBloombergToTwelveData(symbol) {
    if (!symbol) return symbol;
    
    // Handle Bloomberg format like "AAPL US" -> "AAPL"
    if (symbol.includes(' US')) {
      return symbol.replace(' US', '');
    }
    
    // Handle other Bloomberg formats
    const bloombergMappings = {
      ' LN': '.LON',   // London
      ' SW': '.SW',    // Switzerland
      ' GY': '.XETRA', // Germany
      ' FP': '.PA',    // France/Paris
      ' NA': '.AS',    // Netherlands/Amsterdam
      ' SM': '.MC',    // Spain/Madrid
      ' IM': '.MI',    // Italy/Milan
      ' AU': '.AX',    // Australia
      ' JT': '.T',     // Japan/Tokyo
      ' HK': '.HK',    // Hong Kong
      ' CN': '.SS',    // China/Shanghai
      ' KS': '.KS',    // South Korea
      ' IN': '.NS',    // India
      ' SP': '.SI',    // Singapore
      ' TB': '.BK',    // Thailand/Bangkok
      ' IJ': '.JK',    // Indonesia/Jakarta
    };
    
    for (const [bloomberg, twelveData] of Object.entries(bloombergMappings)) {
      if (symbol.includes(bloomberg)) {
        return symbol.replace(bloomberg, twelveData);
      }
    }
    
    return symbol;
  }

  // Connect to WebSocket
  connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      console.log('🔌 WebSocket already connected or connecting');
      return;
    }

    if (!this.apiKey || this.apiKey === 'YOUR_API_KEY_HERE') {
      console.error('❌ TwelveData API key not configured for WebSocket');
      return;
    }

    this.isConnecting = true;
    console.log('🔌 Connecting to TwelveData WebSocket...');

    try {
      this.ws = new WebSocket(`${TWELVE_DATA_WS_URL}?apikey=${this.apiKey}`);

      this.ws.onopen = () => {
        console.log('✅ TwelveData WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        if (this.onConnectionChange) {
          this.onConnectionChange(true);
        }

        // Start heartbeat
        this.startHeartbeat();

        // Subscribe to any pending symbols
        if (this.pendingSubscriptions.length > 0) {
          this.subscribe(this.pendingSubscriptions);
          this.pendingSubscriptions = [];
        }

        // Resubscribe to previously subscribed symbols on reconnect
        if (this.subscribedSymbols.size > 0) {
          this.subscribe(Array.from(this.subscribedSymbols));
        }
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
        console.error('❌ TwelveData WebSocket error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = (event) => {
        console.log('🔌 TwelveData WebSocket closed:', event.code, event.reason);
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
    // Log all incoming messages for debugging
    console.log('📨 WebSocket message received:', data);
    
    // Handle different message types
    if (data.event === 'subscribe-status') {
      console.log('📊 Subscription status:', data);
      if (data.success) {
        console.log('✅ Successfully subscribed to:', data.success.length, 'symbols');
      }
      if (data.fails) {
        console.warn('❌ Failed to subscribe to:', data.fails);
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

      // Convert Swiss prices if needed (same logic as QuoteService)
      if (data.symbol && (data.symbol.endsWith('.SW') || data.symbol.includes(' SW'))) {
        priceData.price = priceData.price / 100;
      }

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

      if (data.symbol && (data.symbol.endsWith('.SW') || data.symbol.includes(' SW'))) {
        priceData.price = priceData.price / 100;
      }

      console.log('💰 Price update (event):', priceData.symbol, priceData.price);

      if (this.onPriceUpdate) {
        this.onPriceUpdate(priceData);
      }
    }
  }

  // Subscribe to symbols (in chunks to avoid limits)
  subscribe(symbols) {
    if (!symbols || symbols.length === 0) return;

    // Convert symbols to TwelveData format
    const convertedSymbols = symbols.map(s => this.convertBloombergToTwelveData(s));

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Queue for later if not connected
      console.log('📋 Queuing subscriptions for when connected:', convertedSymbols.length, 'symbols');
      this.pendingSubscriptions.push(...symbols);
      
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

    const convertedSymbols = symbols.map(s => this.convertBloombergToTwelveData(s));

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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

  // Start heartbeat to keep connection alive
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // TwelveData doesn't require explicit ping, but we check connection health
        const now = Date.now();
        if (this.lastHeartbeat && (now - this.lastHeartbeat) > 60000) {
          // No heartbeat in 60 seconds, connection might be stale
          console.warn('⚠️ No heartbeat received in 60 seconds, reconnecting...');
          this.ws.close();
        }
      }
    }, 30000); // Check every 30 seconds
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
    console.log('🔌 Disconnecting TwelveData WebSocket...');
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
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Export singleton instance
export const twelveDataWS = new TwelveDataWebSocketService();
export default twelveDataWS;
