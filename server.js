// STEP 8 - HTTP server. Keeps the API key on the server, never in the browser.
require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { newSession, handleTurn } = require("./src/session");
const data = require("./src/data/seller");

const app = express();
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

const sessions = new Map();
const hits = new Map(); // naive per-IP rate limit: 40 requests/minute
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, s] of sessions) if (s.createdAt < cutoff) sessions.delete(id);
  hits.clear();
}, 60 * 1000).unref();

app.use("/api", (req, res, next) => {
  const n = (hits.get(req.ip) || 0) + 1;
  hits.set(req.ip, n);
  if (n > 40) return res.status(429).json({ error: "Too many requests. Please slow down." });
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true, brain: process.env.GEMINI_API_KEY && process.env.LLM_PROVIDER !== "mock" ? "gemini" : "mock" }));
app.get("/api/data", (_req, res) => res.json({ seller: data.seller, metrics: data.metrics, assumptions: data.assumptions }));

app.post("/api/session", (_req, res) => {
  const id = crypto.randomUUID();
  const s = newSession();
  sessions.set(id, s);
  res.json({ sessionId: id, greeting: s.greeting });
});

app.post("/api/chat", async (req, res) => {
  const { sessionId, text } = req.body || {};
  const s = sessions.get(sessionId);
  if (!s) return res.status(404).json({ error: "Session expired. Please start a new call." });
  try {
    res.json(await handleTurn(s, text));
  } catch (e) {
    console.error(e);
    res.status(500).json({ reply: "Sorry, I had a technical problem. Could you say that again?", ended: false });
  }
});

const port = process.env.PORT || 3000;
if (require.main === module) app.listen(port, () => console.log(`Virtual KAM running at http://localhost:${port}`));
module.exports = app;
