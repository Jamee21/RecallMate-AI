import { addNote, listNotes } from "./store.mjs";

// Words the model must not add on its own when saving a note
const TIME_WORDS = ["subah", "sham", "shaam", "dopahar", "raat", "morning", "afternoon", "evening", "night"];
const words = (s) => new Set(s.toLowerCase().split(/[^a-z]+/));

const tools = [
  {
    name: "saveNote",
    description:
      "Saves a note for the user. Write the user's own words as they said them. Never add details they did not say (morning/evening, dates, places).",
    parameters: {
      type: "object",
      properties: { text: { type: "string", description: "The note, in the user's own words" } },
      required: ["text"],
    },
    run: async ({ text }, ctx) => {
      if (typeof text !== "string" || !text.trim()) return { error: "Note text is empty." };

      // Guardrail: reject time-of-day words the user never said
      const noteWords = words(text);
      const userWords = words(ctx.userMessage);
      const invented = TIME_WORDS.find((w) => noteWords.has(w) && !userWords.has(w));
      if (invented) {
        return { error: `The note contains "${invented}", which the user did not say. Save it again using only the user's words.` };
      }

      addNote(ctx.sessionId, text.trim().slice(0, 500));
      return { saved: true };
    },
  },
  {
    name: "listNotes",
    description: "Returns the user's 10 most recent saved notes.",
    parameters: { type: "object", properties: {} },
    run: async (_args, ctx) => ({ notes: listNotes(ctx.sessionId) }),
  },
  {
    name: "getCurrentTime",
    description: "Returns the current date and time in Karachi, Pakistan.",
    parameters: { type: "object", properties: {} },
    run: async () => ({ time: new Date().toLocaleString("en-GB", { timeZone: "Asia/Karachi" }) }),
  },
];

const byName = new Map(tools.map((t) => [t.name, t]));

// What the model sees: name, description, parameters (never the code)
export const toolDeclarations = [
  { functionDeclarations: tools.map(({ run, ...declaration }) => declaration) },
];

export async function runTool(name, args, ctx) {
  const tool = byName.get(name);
  if (!tool) return { error: `Unknown tool: ${name}` };

  console.log(`[tool] ${name}`, args);
  try {
    return await tool.run(args, ctx);
  } catch (err) {
    console.error(`[tool:${name}]`, err.message);
    return { error: "The tool failed." };
  }
}