import fs from "node:fs";
import path from "node:path";
import { embedTexts, chunkText } from "./embed.mjs";

const DOCS_DIR = "docs";
const files = fs
  .readdirSync(DOCS_DIR)
  .filter((f) => f.endsWith(".txt") || f.endsWith(".md"));

if (files.length === 0) {
  console.error("❌ docs folder mein koi .txt ya .md file nahi mili");
  process.exit(1);
}

const chunks = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(DOCS_DIR, file), "utf8");
  for (const piece of chunkText(text)) {
    chunks.push({ source: file, text: piece });
  }
  console.log(`📄 ${file}`);
}

console.log(`\n✂️ Kul ${chunks.length} tukde. Embeddings ban rahi hain...`);
const embeddings = await embedTexts(chunks.map((c) => c.text), "RETRIEVAL_DOCUMENT");
chunks.forEach((c, i) => (c.embedding = embeddings[i]));

fs.writeFileSync(
  "index.json",
  JSON.stringify({ model: process.env.GEMINI_EMBED_MODEL, chunks })
);
console.log("✅ index.json ban gayi");