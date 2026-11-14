import "dotenv/config";

const API_KEY = process.env.GEMINI_API_KEY;
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callBatch(body, maxAttempts = 4) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (res.ok) return data.embeddings.map((e) => e.values);

    const retryable = [429, 500, 503].includes(res.status);
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`Embedding error ${res.status}: ${data.error?.message}`);
    }
    const waitMs = 2000 * 2 ** (attempt - 1);
    console.log(`⏳ Error ${res.status}, ${waitMs / 1000}s baad dobara`);
    await sleep(waitMs);
  }
}

// taskType: documents ke liye "RETRIEVAL_DOCUMENT", sawal ke liye "RETRIEVAL_QUERY"
export async function embedTexts(texts, taskType = "RETRIEVAL_DOCUMENT") {
  if (!API_KEY) throw new Error("GEMINI_API_KEY nahi mili (.env check karo)");
  if (!EMBED_MODEL) throw new Error("GEMINI_EMBED_MODEL .env mein likho (listEmbedModels.mjs chalao)");

  const results = [];
  for (let i = 0; i < texts.length; i += 20) {
    const batch = texts.slice(i, i + 20);
    const body = {
      requests: batch.map((t) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: t }] },
        taskType,
      })),
    };
    results.push(...(await callBatch(body)));
  }
  return results;
}

export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Lambe text ko chhote tukron (chunks) mein todta hai, thora overlap ke saath
export function chunkText(text, size = 600, overlap = 100) {
  const clean = text.replace(/\r/g, "").trim();
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    const piece = clean.slice(start, start + size).trim();
    if (piece) chunks.push(piece);
    if (start + size >= clean.length) break;
    start += size - overlap;
  }
  return chunks;
}