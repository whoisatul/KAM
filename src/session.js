// STEP 7 - Session + orchestration: guardrails -> brain -> guardrails.
const { checkInput, checkOutput } = require("./guardrails");
const fallback = require("./fallback");
const llm = require("./llm");
const { defaultSummary } = require("./tools");

const GREETING = "Namaste Ravi ji, I'm your Snapdeal Virtual KAM. How can I help you today?";
const useLLM = () => (process.env.LLM_PROVIDER || "gemini") === "gemini" && !!process.env.GEMINI_API_KEY;

function newSession() {
  return { greeting: GREETING, contents: [], step: 0, turns: 0, ended: false, escalated: false, summary: null, log: [], createdAt: Date.now() };
}

async function handleTurn(session, rawText) {
  if (session.ended) return { reply: "The call has ended. Please start a new call.", ended: true, summary: session.summary };
  const g = checkInput(rawText, session);
  let reply, flag = g.flag, brain = "guardrail";

  if (g.escalate) {
    session.ended = true;
    session.escalated = true;
    session.summary = defaultSummary(true);
    reply = "I understand, and I'm sorry for the trouble. I'll arrange a callback from a human account manager within one working day, and your case notes are saved.";
  } else if (g.forceEnd) {
    session.ended = true;
    session.summary = defaultSummary();
    reply = g.reply;
  } else if (g.reply) {
    reply = g.reply;
  } else {
    session.turns++;
    try {
      if (useLLM()) { reply = await llm.chat(session, g.text); brain = "llm"; }
      else { reply = fallback.reply(session, g.text, { goodbye: g.goodbye }); brain = "fallback"; }
    } catch (e) {
      console.error("[llm-error]", e.message);
      reply = fallback.reply(session, g.text, { goodbye: g.goodbye });
      brain = "fallback(after-error)";
    }
    const out = checkOutput(reply);
    if (out.flag) flag = out.flag;
    reply = out.text;
  }
  session.log.push({ user: String(rawText).slice(0, 200), reply, flag, brain, t: Date.now() });
  console.log(`[turn] brain=${brain} flag=${flag || "-"} ended=${session.ended}`);
  return { reply, ended: session.ended, summary: session.ended ? session.summary || defaultSummary() : null, escalated: session.escalated };
}

module.exports = { newSession, handleTurn, GREETING };
