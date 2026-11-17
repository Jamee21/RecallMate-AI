import { generate } from "./gemini.mjs";
import { toolDeclarations, runTool } from "./tools.mjs";
import { getTurns, appendTurns } from "./store.mjs";

const MAX_STEPS = 5; // safety limit for the tool loop
const HISTORY_TURNS = 10;

const SYSTEM = {
  parts: [
    {
      text: `You are a friendly Notes Assistant. Always reply in Roman Urdu (Urdu written in English letters). Keep replies short.

You can only: save notes (saveNote), list notes (listNotes) and tell the time (getCurrentTime).
You cannot set alarms, reminders or notifications, and you cannot wake anyone up.
If the user asks for a wake-up call or reminder, save the note and clearly say you cannot send alarms or reminders, so they should set an alarm on their phone.
Never promise something you cannot do.

Save notes in the user's own words. Do not add details they did not say (subah, sham, dates, places).`,
    },
  ],
};

export async function runAgent(sessionId, message) {
  const contents = getTurns(sessionId, HISTORY_TURNS).map((t) => ({
    role: t.role,
    parts: [{ text: t.text }],
  }));
  contents.push({ role: "user", parts: [{ text: message }] });

  let reply = "Sorry, I could not finish that. Please try again.";
  let pinnedModel = null;

  for (let step = 1; step <= MAX_STEPS; step++) {
    const { data, model } = await generate(
      { systemInstruction: SYSTEM, contents, tools: toolDeclarations },
      { model: pinnedModel }
    );

    const content = data.candidates?.[0]?.content;
    if (!content) throw new Error("The model returned no answer");
    contents.push(content);

    const parts = content.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);

    if (calls.length === 0) {
      reply = parts.map((p) => p.text ?? "").join("").trim() || reply;
      break;
    }

    // Once tools are involved, keep the same model for the rest of this turn
    pinnedModel = model;

    const responses = [];
    for (const { functionCall } of calls) {
      const result = await runTool(functionCall.name, functionCall.args ?? {}, {
        sessionId,
        userMessage: message,
      });
      responses.push({ functionResponse: { name: functionCall.name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }

  // Only the final text is stored, not the tool-call internals
  appendTurns(sessionId, [
    { role: "user", text: message },
    { role: "model", text: reply },
  ]);
  return reply;
}