import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent } from "./agent.mjs";
import { getTurns } from "./store.mjs";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const SESSION_ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_MESSAGE_LENGTH = 500;

// ---------- Rate limit: 15 messages per IP per 10 minutes ----------
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 15;
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_HITS;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hits) {
    if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(ip);
  }
}, WINDOW_MS).unref();

// ---------- App ----------
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // correct client IP behind a proxy (e.g. Render)

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: "10kb" }));
app.use(express.static(PUBLIC_DIR));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/history", (req, res) => {
  const { sessionId } = req.query;
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) {
    return res.status(400).json({ error: "Invalid sessionId" });
  }
  res.json({ turns: getTurns(sessionId) });
});

app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body ?? {};

  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) {
    return res.status(400).json({ error: "Invalid sessionId" });
  }
  if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` });
  }
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ error: "Too many messages. Please wait a few minutes." });
  }

  try {
    res.json({ reply: await runAgent(sessionId, message.trim()) });
  } catch (err) {
    console.error("[chat]", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// Malformed JSON and other errors
app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  res.status(status).json({ error: status === 400 ? "Bad request" : "Server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Notes Agent running at http://localhost:${PORT}`));