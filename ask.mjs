import "dotenv/config";
import fs from "node:fs";
import readline from "node:readline/promises";
import { embedTexts, cosineSimilarity } from "./embed.mjs";
import { generateRaw } from "./gemini.mjs";

const TOP_K = 3;

const index = JSON.parse(fs.readFileSync("index.json", "utf8"));
if (index.model !== process.env.GEMINI_EMBED_MODEL) {
  console.error("❌ Index aur .env ka embedding model alag hain. build-index.mjs dobara chalao.");
  process.exit(1);
}

async function answer(question) {
  // 1. Sawal ki embedding
  const [queryVec] = await embedTexts([question], "RETRIEVAL_QUERY");

  // 2. Har tukde se milan, sab se milte julte TOP_K chuno
  const best = index.chunks
    .map((c) => ({ ...c, score: cosineSimilarity(queryVec, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  // 3. Tukde prompt mein daalo
  const context = best.map((c, i) => `[${i + 1}] (${c.source})\n${c.text}`).join("\n\n");

  const systemInstruction = {
    parts: [
      {
        text: `Tum ek assistant ho. Jawab sirf neeche diye gaye CONTEXT se do. Roman Urdu mein.
Agar jawab CONTEXT mein nahi hai to saaf kaho: "Yeh baat mere documents mein nahi hai." Apni taraf se andaza mat lagao.
Jawab ke end mein bata do ke kis [number] se liya.

CONTEXT:
${context}`,
      },
    ],
  };

  const data = await generateRaw({
    systemInstruction,
    contents: [{ role: "user", parts: [{ text: question }] }],
  });

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  return { text, best };
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("Apne documents se poochho. Band karne ke liye 'exit'.\n");

while (true) {
  const q = (await rl.question("Aap: ")).trim();
  if (!q) continue;
  if (q.toLowerCase() === "exit") break;

  try {
    const { text, best } = await answer(q);
    console.log(`\nAI: ${text}\n`);
    console.log("📚 Sources:");
    best.forEach((c, i) => console.log(`  [${i + 1}] ${c.source} (milan: ${c.score.toFixed(3)})`));
    console.log();
  } catch (err) {
    console.error("❌", err.message);
  }
}

rl.close();