// STEP 5 - Offline fallback brain (rule-based). Used when LLM_PROVIDER=mock,
// when no API key is set, or when the LLM call fails/times out.
const { defaultSummary } = require("./tools");
const has = (t, words) => words.some((w) => t.includes(w));

function reply(session, raw, opts = {}) {
  const t = raw.toLowerCase();
  const negative = has(t, ["no ", "nahi", "not ", "haven", "didn"]);
  if (opts.goodbye && session.step >= 5) {
    session.ended = true;
    session.summary = defaultSummary();
    return "Glad I could help, Ravi ji. The key issue is stock-outs and cancellations. Restock the top five items, fix cancellations, then run a small promotion. I will check in on Friday. Goodbye!";
  }
  switch (session.step) {
    case 0:
      session.step = 1;
      return "I have checked your account. Sales are down about thirty two percent, and orders went from 400 to 270. Have you changed any prices recently?";
    case 1:
      session.step = 2;
      return (has(t, ["yes", "haan", "reduc", "increas", "chang"]) && !negative
        ? "Noted. Your average price still shows 500 rupees, so I doubt price is the main cause. "
        : "Good, that matches what I see, your average price is steady at 500 rupees. ") + "Are some of your best selling products out of stock right now?";
    case 2:
      session.step = 3;
      return "That fits the data. Out-of-stock products went from 5 to 18, and the top five missing items used to bring about 136 orders a month. Why do you think orders are getting cancelled?";
    case 3:
      session.step = 4;
      return "Understood. Cancellations went from 8 to 14 percent, and about 62 percent of them are because stock was not available, which also dropped your rating to 3.9. Shall I share my recommendations?";
    case 4:
      session.step = 5;
      return "First, restock the steel bottle, tawa, spatula set, lunch box and jar set. Second, update inventory daily and set a realistic dispatch time to bring cancellations under 8 percent. Third, once restocked, run a small 4000 rupee promotion to win back visibility. Anything else I can help with?";
    default:
      return "Sure. Is there anything else, or shall I wrap up the call with a summary?";
  }
}

module.exports = { reply };
