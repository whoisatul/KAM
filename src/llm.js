// STEP 6 - LLM layer (Gemini REST API with function calling, no SDK needed).
// To swap providers, only this file changes: keep the chat(session, text) shape.
const SYSTEM = require("./prompt");
const { registry, defaultSummary } = require("./tools");

const MODEL = () => process.env.GEMINI_MODEL || "gemini-3.5-flash";
const URL = () => `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`;

const S = (type, extra = {}) => ({ type, ...extra });
const declarations = [
  { name: "get_sales_metrics", description: "Seller's sales, orders, cancellation rate, price, stock-outs, rating, ad spend and a precomputed diagnosis." },
  { name: "get_out_of_stock_items", description: "Out-of-stock products with typical monthly orders and revenue at stake." },
  { name: "get_cancellation_reasons", description: "Share of cancellations by reason this month." },
  { name: "escalate_to_human", description: "Use when the seller is angry or asks for a human. Ends the call with a callback." },
  {
    name: "end_call",
    description: "Call once when the seller is finished, with the final summary.",
    parameters: S("OBJECT", {
      properties: { issues: S("ARRAY", { items: S("STRING") }), actions: S("ARRAY", { items: S("STRING") }), nextSteps: S("ARRAY", { items: S("STRING") }) },
      required: ["issues", "actions", "nextSteps"],
    }),
  },
];

function runTool(session, name, args) {
  if (registry[name]) return registry[name]();
  if (name === "end_call") {
    session.ended = true;
    session.summary = { issues: args.issues || [], actions: args.actions || [], nextSteps: args.nextSteps || [] };
    return { ok: true, instruction: "Now say a brief spoken goodbye." };
  }
  if (name === "escalate_to_human") {
    session.ended = true;
    session.escalated = true;
    session.summary = defaultSummary(true);
    return { ok: true, instruction: "Tell the seller a human manager will call back within one working day." };
  }
  return { error: "unknown tool" };
}

async function callGemini(contents) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(URL(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        tools: [{ functionDeclarations: declarations }],
        generationConfig: { maxOutputTokens: 512, thinkingConfig: { thinkingLevel: "low" } },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (res.status === 503) {
      lastErr = new Error(`Gemini 503: busy`);
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw lastErr || new Error("Gemini unavailable");
}

async function chat(session, userText) {
  const startLen = session.contents.length;
  session.contents.push({ role: "user", parts: [{ text: userText }] });
  try {
    for (let round = 0; round < 4; round++) {
      const data = await callGemini(session.contents);
      const content = data.candidates?.[0]?.content;
      if (!content?.parts?.length) throw new Error("Empty model response");
      session.contents.push(content);
      const calls = content.parts.filter((p) => p.functionCall);
      if (!calls.length) {
        const text = content.parts.map((p) => p.text || "").join(" ").trim();
        if (text) return text;
        throw new Error("No text in reply");
      }
      const responses = calls.map((c) => {
        const fc = c.functionCall;
        const fr = { name: fc.name, response: { result: runTool(session, fc.name, fc.args || fc.arguments || {}) } };
        if (fc.id) fr.id = fc.id;
        return { functionResponse: fr };
      });
      session.contents.push({ role: "user", parts: responses });
    }
    throw new Error("Too many tool rounds");
  } catch (e) {
    session.contents.length = startLen; // roll back so history stays valid
    throw e;
  }
}

module.exports = { chat, runTool };
