import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "my-first-server", version: "1.0.0" });

// Tool ka nateeja MCP ke format mein lapetne wala chhota helper
const reply = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });

// ---------- Tool 1: calculate ----------
server.registerTool(
  "calculate",
  {
    description: "Do numbers par add, subtract, multiply ya divide karta hai",
    inputSchema: {
      a: z.number().describe("Pehla number"),
      b: z.number().describe("Doosra number"),
      operation: z.enum(["add", "subtract", "multiply", "divide"]).describe("Kaun sa hisaab"),
    },
  },
  async ({ a, b, operation }) => {
    if (operation === "add") return reply({ result: a + b });
    if (operation === "subtract") return reply({ result: a - b });
    if (operation === "multiply") return reply({ result: a * b });
    if (b === 0) return reply({ error: "Zero se divide nahi ho sakta" });
    return reply({ result: a / b });
  }
);

// ---------- Tool 2: getWeather (nakli data) ----------
server.registerTool(
  "getWeather",
  {
    description: "Kisi shehar ka mausam batata hai (Karachi, Lahore, Islamabad)",
    inputSchema: {
      city: z.string().describe("Shehar ka naam, jaise Karachi"),
    },
  },
  async ({ city }) => {
    const fakeData = {
      karachi: { temp: 32, condition: "dhoop" },
      lahore: { temp: 27, condition: "dhund" },
      islamabad: { temp: 22, condition: "badal" },
    };
    return reply(fakeData[city.toLowerCase()] || { error: `${city} ka data nahi mila` });
  }
);

// ---------- Server chalao ----------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("✅ MCP server chal raha hai"); // dhyan: console.error, console.log nahi