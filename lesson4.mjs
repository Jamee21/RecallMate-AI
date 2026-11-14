import readline from "node:readline/promises";
import fs from "node:fs";
import { generateRaw } from "./gemini.mjs";

const MEMORY_FILE = "memory.json";
const MAX_MESSAGES = 20; // history mein zyada se zyada itne messages

// ---------- 1. Long-term memory (file) ----------
function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
  } catch {
    return []; // file nahi hai to khali memory
  }
}

function saveMemory(facts) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(facts, null, 2));
}

// ---------- 2. Tools ----------
const toolFunctions = {
  remember: ({ fact }) => {
    const facts = loadMemory();
    if (!facts.includes(fact)) {
      facts.push(fact);
      saveMemory(facts);
    }
    return { saved: true, totalFacts: facts.length };
  },
};

const tools = [
  {
    functionDeclarations: [
      {
        name: "remember",
        description:
          "User ke bare mein koi zaroori, lambay arse tak kaam aane wali baat hamesha ke liye save karta hai (jaise naam, pasand, kaam, maqsad). Chhoti ya waqti baton ke liye use mat karo.",
        parameters: {
          type: "object",
          properties: {
            fact: {
              type: "string",
              description: "Ek saaf, chhota jumla, jaise 'User ka naam Jamee hai'",
            },
          },
          required: ["fact"],
        },
      },
    ],
  },
];

// ---------- 3. System prompt (memory ke saath) ----------
function buildSystem() {
  const facts = loadMemory();
  const memoryText = facts.length
    ? facts.map((f) => `- ${f}`).join("\n")
    : "(abhi kuch save nahi)";

  return {
    parts: [
      {
        text: `Tum ek dostana assistant ho. Jawab Roman Urdu mein do.
Agar user apne bare mein koi zaroori baat bataye to remember tool se save karo.

Tumhein user ke bare mein yeh baatein pehle se maloom hain:
${memoryText}`,
      },
    ],
  };
}

// ---------- 4. History trim karna ----------
function trimHistory(history) {
  if (history.length <= MAX_MESSAGES) return history;

  let start = history.length - MAX_MESSAGES;
  // Sirf aise message se shuru karo jo user ka asli text ho
  // (tool ke jawab se nahi, warna function call/response ka jora toot jata hai)
  while (start < history.length) {
    const m = history[start];
    if (m.role === "user" && m.parts?.some((p) => p.text)) break;
    start++;
  }
  return history.slice(start);
}

// ---------- 5. Ek turn (user ka ek message) ----------
async function runTurn(history, userText) {
  const lengthBefore = history.length;
  history.push({ role: "user", parts: [{ text: userText }] });

  try {
    for (let step = 1; step <= 5; step++) {
      const data = await generateRaw({
        systemInstruction: buildSystem(), // har baar taaza memory
        contents: history,
        tools,
      });

      const modelContent = data.candidates?.[0]?.content;
      if (!modelContent) throw new Error("AI ne koi jawab nahi diya");
      history.push(modelContent);

      const parts = modelContent.parts ?? [];
      const calls = parts.filter((p) => p.functionCall);

      if (calls.length === 0) {
        return parts.map((p) => p.text ?? "").join("");
      }

      const responseParts = [];
      for (const { functionCall } of calls) {
        console.log(`   🧠 Memory tool: ${functionCall.name}`, functionCall.args);
        const fn = toolFunctions[functionCall.name];
        let result;
        try {
          result = fn ? await fn(functionCall.args ?? {}) : { error: "Tool nahi mila" };
        } catch (err) {
          result = { error: err.message };
        }
        responseParts.push({
          functionResponse: { name: functionCall.name, response: { result } },
        });
      }
      history.push({ role: "user", parts: responseParts });
    }
    return "Bohat zyada steps ho gaye, ruk gaya.";
  } catch (err) {
    history.length = lengthBefore; // ghalti hui to adhoora turn hata do
    throw err;
  }
}

// ---------- 6. Chat loop ----------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let history = [];

console.log("Chat shuru! Band karne ke liye 'exit' likho.");
console.log(`Purani yaad-dasht: ${loadMemory().length} baatein\n`);

while (true) {
  const input = (await rl.question("Aap: ")).trim();
  if (!input) continue;
  if (input.toLowerCase() === "exit") break;

  try {
    history = trimHistory(history);
    const answer = await runTurn(history, input);
    console.log(`\nAI: ${answer}\n`);
  } catch (err) {
    console.error("❌", err.message);
  }
}

rl.close();