const test = require("node:test");
const assert = require("node:assert");
process.env.LLM_PROVIDER = "mock";
const { newSession, handleTurn } = require("../src/session");

test("full mock conversation reaches a summary", async () => {
  const s = newSession();
  const say = async (t) => handleTurn(s, t);
  await say("My sales dropped a lot this month");
  await say("No I did not change prices");
  await say("Yes some products are out of stock");
  await say("Maybe because of stock");
  const rec = await say("Yes please share");
  assert.match(rec.reply, /restock/i);
  const end = await say("No that's all, thank you");
  assert.equal(end.ended, true);
  assert.equal(end.summary.actions.length, 3);
});

test("escalation ends the call with a callback", async () => {
  const s = newSession();
  const r = await handleTurn(s, "I want to speak to your manager");
  assert.equal(r.ended, true);
  assert.equal(r.escalated, true);
});

test("turns after the call ended are refused", async () => {
  const s = newSession();
  await handleTurn(s, "get me a human");
  const r = await handleTurn(s, "hello?");
  assert.match(r.reply, /ended/);
});
