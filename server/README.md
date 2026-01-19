# Clearline Flow WebSocket Server

A backend WebSocket server that maintains a single connection to TwelveData and serves multiple frontend clients. This allows sharing a single TwelveData WebSocket connection across all users.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Frontend (1)   │────▶│                      │────▶│                 │
└─────────────────┘     │   Backend WebSocket  │     │   TwelveData    │
┌─────────────────┐     │       Server         │◀────│   WebSocket     │
│  Frontend (2)   │────▶│                      │     │                 │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
┌─────────────────┐             │
│  Frontend (N)   │─────────────┘
└─────────────────┘
```

## Features

- Single TwelveData WebSocket connection shared by all clients
- Automatic subscription aggregation (only subscribes once per symbol)
- Automatic reconnection with exponential backoff
- Heartbeat to keep connections alive
- Health check endpoint for monitoring
- Graceful shutdown

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TWELVE_DATA_API_KEY` | Your TwelveData API key | Yes |
| `PORT` | Server port (default: 3001) | No |

## Local Development

```bash
cd server
npm install

# Set environment variable
# Windows PowerShell:
$env:TWELVE_DATA_API_KEY="your_api_key_here"

# Mac/Linux:
export TWELVE_DATA_API_KEY="your_api_key_here"

# Start the server
npm start
```

## Deployment Options

### Option 1: Railway (Recommended)

1. Create a new project on [Railway](https://railway.app)
2. Connect your GitHub repository
3. Set the root directory to `server`
4. Add environment variable: `TWELVE_DATA_API_KEY`
5. Deploy

Railway will automatically detect Node.js and run `npm start`.

### Option 2: Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Set:
   - Build Command: `cd server && npm install`
   - Start Command: `cd server && npm start`
4. Add environment variable: `TWELVE_DATA_API_KEY`
5. Deploy

### Option 3: Fly.io

1. Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
2. From the `server` directory:
```bash
fly launch
fly secrets set TWELVE_DATA_API_KEY=your_api_key_here
fly deploy
```

### Option 4: DigitalOcean App Platform

1. Create a new App
2. Connect your GitHub repository
3. Set source directory to `/server`
4. Add environment variable: `TWELVE_DATA_API_KEY`
5. Deploy

## Health Check

The server exposes a health check endpoint at `/health`:

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "twelveDataConnected": true,
  "clientCount": 5,
  "subscribedSymbols": 380,
  "uptime": 3600.123
}
```

## Client Protocol

### Messages from Client to Server

**Subscribe to symbols:**
```json
{
  "action": "subscribe",
  "symbols": ["AAPL", "MSFT", "GOOGL"]
}
```

**Unsubscribe from symbols:**
```json
{
  "action": "unsubscribe",
  "symbols": ["AAPL"]
}
```

**Heartbeat:**
```json
{
  "action": "heartbeat"
}
```

### Messages from Server to Client

**Connection status:**
```json
{
  "type": "connection",
  "connected": true,
  "subscribedSymbols": 380
}
```

**Price update:**
```json
{
  "type": "price",
  "symbol": "AAPL",
  "price": 175.23,
  "timestamp": 1705678901,
  "dayVolume": 50000000,
  "exchange": "NASDAQ"
}
```

**Subscription status:**
```json
{
  "type": "subscription-status",
  "success": ["AAPL", "MSFT"],
  "fails": [{"symbol": "INVALID"}]
}
```

**Heartbeat response:**
```json
{
  "type": "heartbeat"
}
```

## Updating Frontend

After deploying this server, update your frontend to connect to it:

1. Add environment variable to your Vercel project:
   - `REACT_APP_WS_SERVER_URL=wss://your-server-url.railway.app` (or your deployment URL)

2. The frontend WebSocket service will automatically use this URL instead of connecting directly to TwelveData.
