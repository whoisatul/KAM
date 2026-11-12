// STEP 4 - Guardrails. Checked BEFORE the text reaches the LLM (input) and
// BEFORE the reply reaches the seller (output).
const { getSalesMetrics, getOutOfStockItems, getCancellationReasons } = require("./tools");
const seller = require("./data/seller");

const INJECTION = /(ignore (all|any|previous|the above)|disregard (your|the) (instructions|rules)|system prompt|reveal your (prompt|instructions)|you are now|act as (?!a seller)|jailbreak|developer mode)/i;
const ABUSE = /(fuck|bastard|bloody idiot|useless|stupid bot|chor|scam|cheat|harami|bakwas)/i;
const WANTS_HUMAN = /(human|real person|manager|talk to (someone|a person)|call me back|customer care|insaan|executive)/i;
const GOODBYE = /(bye|that'?s all|nothing else|no more|thank you|thanks|dhanyavad|shukriya|that will be all)/i;

const MAX_INPUT = 400;

// Returns { reply?, flag?, escalate?, text? }. If reply is set, skip the LLM.
function checkInput(raw, session) {
  const text = String(raw || "").replace(/\s+/g, " ").trim().slice(0, MAX_INPUT);
  if (text.length < 2) return { flag: "empty", reply: "Sorry, I didn't catch that. Could you say it once more?" };
  if (INJECTION.test(text)) return { flag: "injection", reply: "I'm here to help with your Snapdeal sales, so let's stay on that. What would you like to know about your account?" };
  if (WANTS_HUMAN.test(text) || ABUSE.test(text)) return { flag: "escalate", escalate: true };
  if (session.turns >= 25) return { flag: "turn_limit", reply: "We've covered a lot, so let me wrap up with a summary.", forceEnd: true };
  return { text, goodbye: GOODBYE.test(text) };
}

// Numbers the bot is allowed to say = every number present in tool outputs.
function allowedNumbers() {
  const blob = JSON.stringify([getSalesMetrics(), getOutOfStockItems(), getCancellationReasons(), seller.assumptions]);
  const set = new Set((blob.match(/\d[\d.]*/g) || []).map((n) => n.replace(/\.$/, "")));
  ["32.5", "32", "130", "136", "4000", "500"].forEach((n) => set.add(n));
  return set;
}

const SAFE = "Let me stick to what I can see on your account. Your orders are down about thirty two percent, mainly because of stock-outs and cancellations. Shall I walk you through what to do?";
const PROMISE = /(guarantee|100 percent sure|definitely (increase|double)|will double|assured (sales|growth))/i;

function checkOutput(text) {
  let t = String(text || "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return { text: "Sorry, could you repeat that?", flag: "empty_output" };
  if (PROMISE.test(t)) return { text: SAFE, flag: "overpromise" };
  // Hallucination check: any number > 10 that is not in the tool data
  const ok = allowedNumbers();
  const bad = (t.match(/\d[\d,]*\.?\d*/g) || []).map((n) => n.replace(/,/g, "").replace(/\.$/, "")).filter((n) => parseFloat(n) > 10 && !ok.has(n));
  if (bad.length) return { text: SAFE, flag: "unknown_number:" + bad.join(",") };
  // Keep it short for voice: max 80 words, cut at a sentence boundary
  const words = t.split(" ");
  if (words.length > 80) {
    const cut = words.slice(0, 80).join(" ");
    const end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("?"), cut.lastIndexOf("!"));
    t = end > 20 ? cut.slice(0, end + 1) : cut;
  }
  return { text: t };
}

module.exports = { checkInput, checkOutput };
