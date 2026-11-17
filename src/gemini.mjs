import "dotenv/config";

const API_KEY = process.env.GEMINI_API_KEY;
const MODELS = (
  process.env.GEMINI_MODELS || "gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-3.5-flash"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const RETRYABLE = new Set([429, 500, 503]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls Gemini's generateContent. Retries transient errors, then falls back to the next model.
 * Pass `model` to pin one model (used mid tool-loop so the model never changes between steps).
 * Returns { data, model }.
 */
export async function generate(body, { model = null, retries = 2 } = {}) {
  if (!API_KEY) throw new Error("GEMINI_API_KEY is missing (check .env)");

  const candidates = model ? [model] : MODELS;
  let lastError = "no model was tried";

  for (const m of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        lastError = `network error (${m}): ${err.cause?.code ?? err.message}`;
        if (attempt < retries) {
          await sleep(2000 * 2 ** (attempt - 1));
          continue;
        }
        break;
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok) return { data, model: m };

      lastError = `API error ${res.status} (${m}): ${data.error?.message ?? "unknown"}`;
      if (res.status === 404) break; // model unavailable, try the next one
      if (!RETRYABLE.has(res.status)) throw new Error(lastError); // our fault (400/403): don't retry
      if (attempt < retries) await sleep(2000 * 2 ** (attempt - 1));
    }
  }

  throw new Error(`All models failed. Last error: ${lastError}`);
}