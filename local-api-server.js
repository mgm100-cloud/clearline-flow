const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3001;

function loadEnvFile(fileName) {
  const filePath = path.join(__dirname, fileName);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, 'utf8');
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnvFile('.env');
loadEnvFile('.env.local');

async function getHandler() {
  const module = await import('./api/superllm-stream.js');
  return module.default;
}

// 2026-10-21: the page now gets its market data from GET /api/market (api/market.js adds the vendor keys on the
// server, so they no longer ship in the page). `npm start` sends /api/* here, so answer it locally too - the same
// handler, so the same sign-in check and allowlist, with the keys from .env / .env.local loaded above.
async function getMarketHandler() {
  const module = await import('./api/market.js');
  return module.default;
}

// The Vercel response helpers api/market.js uses, on top of Node's plain response.
function withVercelHelpers(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (body) => { res.end(body); return res; };
  return res;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/market') {
    try {
      const marketHandler = await getMarketHandler();
      await marketHandler(req, withVercelHelpers(res));
    } catch (error) {
      console.error('Local API server error (market):', error && error.name);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      }
      res.end(JSON.stringify({ error: 'Local API server failed' }));
    }
    return;
  }

  if (req.method !== 'POST' || url.pathname !== '/api/superllm-stream') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  try {
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    req.body = Buffer.concat(chunks).toString('utf8');

    const handler = await getHandler();
    await handler(req, res);
  } catch (error) {
    console.error('Local API server error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: error.message || 'Local API server failed' }));
  }
});

server.listen(PORT, () => {
  console.log(`Local API server listening on http://localhost:${PORT}`);
});
