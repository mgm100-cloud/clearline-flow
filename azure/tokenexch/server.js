// Clearline Flow — Entra -> PostgREST token-exchange.
// The SPA signs in with MSAL (Entra), then POSTs its Entra ID token here. We verify
// it against Entra's JWKS (issuer + audience = the Flow app), then mint a short-lived
// JWT that PostgREST accepts: { role: "authenticated", sub: <entra oid>, email }, signed
// HS256 with the SAME secret PostgREST verifies with (PGRST_JWT_SECRET). RLS then sees
// auth.uid() = the user's Entra oid and auth.role() = 'authenticated'.
const express = require("express");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const TENANT = process.env.TENANT_ID;
const AUD = process.env.FLOW_CLIENT_ID;        // expected audience = the "Clearline Flow" app reg
const SECRET = process.env.PGRST_JWT_SECRET;   // shared HS256 secret with PostgREST
const ISS = `https://login.microsoftonline.com/${TENANT}/v2.0`;
// 2026-10-21: the issuer pins Clearline's tenant, but ANY account in it passed - a guest invited for one
// document included - and got a full "authenticated" pass to the data API. Now only staff addresses.
const DOMAINS = String(process.env.ALLOWED_EMAIL_DOMAINS || "clearlinecap.com").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
// and only Flow's own pages may call this from a browser (it used to echo back any Origin)
const ORIGINS = String(process.env.ALLOWED_ORIGINS || "https://www.clearlineflow.com,https://clearlineflow.com,https://flow.clearlineflow.com,http://localhost:3000")
  .split(",").map((s) => s.trim()).filter(Boolean);
const jwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`,
  cache: true, rateLimit: true,
});
function getKey(header, cb) {
  jwks.getSigningKey(header.kid, (err, key) => cb(err, key && key.getPublicKey()));
}

const app = express();
app.use((req, res, next) => {                  // CORS — the SPA calls this cross-origin
  const origin = req.headers.origin;
  if (origin && ORIGINS.indexOf(origin) >= 0) res.set("Access-Control-Allow-Origin", origin);
  res.set("Access-Control-Allow-Headers", "authorization, content-type");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Vary", "Origin");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (_req, res) =>
  res.json({ ok: true, tenant: !!TENANT, aud: !!AUD, secret: !!SECRET }));

function handle(req, res) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "missing bearer token" });
  jwt.verify(auth.slice(7), getKey, { audience: AUD, issuer: ISS, algorithms: ["RS256"] }, (err, c) => {
    if (err) return res.status(401).json({ error: "invalid entra token" });
    const oid = c.oid || c.sub;
    const email = String(c.preferred_username || c.email || c.upn || "").toLowerCase();
    if (!oid) return res.status(401).json({ error: "token has no oid claim" });
    if (c.tid && c.tid !== TENANT) return res.status(401).json({ error: "wrong tenant" });
    if (!email || !DOMAINS.some((d) => email.endsWith("@" + d))) return res.status(403).json({ error: "Clearline staff accounts only" });
    const token = jwt.sign({ role: "authenticated", sub: oid, email }, SECRET, { algorithm: "HS256", expiresIn: "1h" });
    res.json({ token, email, exp: Math.floor(Date.now() / 1000) + 3600 });
  });
}
app.get("/exchange", handle);
app.post("/exchange", handle);

app.listen(process.env.PORT || 3000, () => console.log("tokenexch listening"));
