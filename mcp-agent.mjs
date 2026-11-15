import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { generateRaw } from "./gemini.mjs";

// ---------- 1. Server se connect ----------
const transport = new StdioClientTransport({
  command: process.execPath, // yaani node
  args: ["mcp-server.mjs"],
});

const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(transport);

// ---------- 2. Server ke tools maloom karo ----------
const { tools: mcpTools } = await client.listTools();
console.log("🔌 Server ke tools:", mcpTools.map((t) => t.name).join(", "));

// MCP ka JSON Schema Gemini ko kuch extra fields ke saath jata hai
// ($schema, additionalProperties) jo Gemini ko pasand nahi aa sakte, is liye saaf karo
function cleanSchema(schema) {
  if (Array.isArray(schema)) return schema.map(cleanSchema);
  if (schema && typeof schema === "object") {
    const out = {};
    for (const [key, value] of Object.entries(schema)) {
      if (key === "$schema" || key === "additionalProperties") continue;
      out[key] = cleanSchema(value);
    }
    return out;
  }
  return schema;
}

const geminiTools = [
  {
    functionDeclarations: mcpTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: cleanSchema(t.inputSchema),
    })),
  },
];

// ---------- 3. Agent loop (Lesson 3 jaisa) ----------
async function runAgent(question) {
  const contents = [{ role: "user", parts: [{ text: question }] }];
  const systemInstruction = {
    parts: [{ text: "Tum ek madadgar assistant ho. Zaroorat ho to tools use karo. Jawab Roman Urdu mein do." }],
  };

  for (let step = 1; step <= 5; step++) {
    const data = await generateRaw({ systemInstruction, contents, tools: geminiTools });

    const modelContent = data.candidates?.[0]?.content;
    if (!modelContent) throw new Error("AI ne koi jawab nahi diya");
    contents.push(modelContent);

    const parts = modelContent.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);

    if (calls.length === 0) {
      return parts.map((p) => p.text ?? "").join("");
    }

    const responseParts = [];
    for (const { functionCall } of calls) {
      console.log(`🔧 AI ne ${functionCall.name} manga`, functionCall.args);

      let result;
      try {
        // Asli kaam ab MCP server karta hai
        const res = await client.callTool({
          name: functionCall.name,
          arguments: functionCall.args ?? {},
        });
        const text = (res.content ?? []).map((c) => c.text ?? "").join("");
        result = res.isError ? { error: text } : { output: text };
      } catch (err) {
        result = { error: err.message };
      }
      console.log("   📦 Nateeja:", result);

      responseParts.push({
        functionResponse: { name: functionCall.name, response: { result } },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }
  return "Bohat zyada steps ho gaye, ruk gaya.";
}

// ---------- 4. Chalao ----------
try {
  const answer = await runAgent("Karachi aur Lahore ke mausam mein kitna farq hai?");
  console.log("\n✅ Final jawab:\n" + answer);
} catch (err) {
  console.error("❌", err.message);
} finally {
  await client.close(); // server band karo
}