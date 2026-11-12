// STEP 9 - Voice client. Browser SpeechRecognition (STT) + speechSynthesis (TTS);
// all intelligence stays on the server. Handles silence, mic denial, low confidence, network errors.
const $ = (id) => document.getElementById(id);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const inr = (n) => "₹" + n.toLocaleString("en-IN");
const pct = (a, b) => Math.round(((b - a) / a) * 1000) / 10;

let sessionId = null, live = false, busy = false, speaking = false, rec = null, voice = null, silence = 0;

/* ---------- UI helpers ---------- */
function setState(cls, status, sub) { $("orb").className = (live ? "live " : "") + cls; $("status").textContent = status; if (sub) $("sub").textContent = sub; }
function bubble(who, text) {
  const l = $("log"); const e = l.querySelector(".empty"); if (e) e.remove();
  const d = document.createElement("div"); d.className = "b " + who;
  const s = document.createElement("small"); s.textContent = who === "bot" ? "Virtual KAM" : "You";
  d.append(s, document.createTextNode(text)); l.append(d); l.scrollTop = l.scrollHeight;
}
function renderTable(data) {
  const m = data.metrics, a = data.assumptions;
  $("who").textContent = "Seller account · " + data.seller.store;
  const sign = (n) => (n > 0 ? "+" : "") + n;
  const rows = [
    ["Sales", inr(m.sales.last), inr(m.sales.now), sign(pct(m.sales.last, m.sales.now)) + "%", 1],
    ["Orders", m.orders.last, m.orders.now, sign(pct(m.orders.last, m.orders.now)) + "%", 1],
    ["Cancellation rate", m.cancellationRatePct.last + "%", m.cancellationRatePct.now + "%", sign(m.cancellationRatePct.now - m.cancellationRatePct.last) + " pts", 1],
    ["Avg selling price", inr(m.avgSellingPrice.last), inr(m.avgSellingPrice.now), "0%", 0],
    ["Out-of-stock products", m.outOfStock.last, m.outOfStock.now, sign(m.outOfStock.now - m.outOfStock.last), 1],
  ];
  $("tbl").innerHTML = "<tr><th></th><th>Last month</th><th>This month</th><th>Change</th></tr>" +
    rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="${r[4] ? "bad" : ""}">${r[3]}</td></tr>`).join("");
  $("assume").textContent = `Assumed (mock): rating ${a.sellerRating.last} → ${a.sellerRating.now}, ad spend ${inr(a.adSpend.last)} → ${inr(a.adSpend.now)}, competitor prices ${a.competitorPriceGap}.`;
}
function showSummary(s) {
  const box = $("sum"); box.style.display = "block"; box.innerHTML = "<h2>Call summary</h2>";
  [["Key issues", s.issues], ["Recommended actions", s.actions], ["Next steps", s.nextSteps]].forEach(([title, items]) => {
    const h = document.createElement("h3"); h.textContent = title; const ul = document.createElement("ul");
    (items || []).forEach((t) => { const li = document.createElement("li"); li.textContent = t; ul.append(li); });
    box.append(h, ul);
  });
}

/* ---------- Speech output ---------- */
function pickVoice() { const v = speechSynthesis.getVoices(); voice = v.find((x) => /en-IN/i.test(x.lang)) || v.find((x) => /^en/i.test(x.lang)) || null; }
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  return new Promise((res) => {
    if (!("speechSynthesis" in window)) return res();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice; u.lang = voice ? voice.lang : "en-IN"; u.rate = 1.02;
    u.onend = u.onerror = () => { speaking = false; res(); };
    speaking = true; setState("speak", "Speaking…", "Tap the orb to interrupt."); speechSynthesis.speak(u);
  });
}
async function say(text, ended) {
  bubble("bot", text); stopListen(); await speak(text);
  if (ended) return finish(); if (live) listen();
}

/* ---------- Speech input (with edge cases) ---------- */
function stopListen() { if (rec) { rec.onend = null; try { rec.abort(); } catch (e) {} rec = null; } }
function listen() {
  if (!live || !SR || busy || speaking) return;
  rec = new SR(); rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = false; let got = false;
  rec.onstart = () => setState("listen", "Listening…", "Speak naturally. I'll reply when you pause.");
  rec.onresult = (e) => {
    let fin = "", tmp = "", conf = 1;
    for (const r of e.results) { if (r.isFinal) { fin += r[0].transcript; conf = r[0].confidence || 1; } else tmp += r[0].transcript; }
    if (tmp) $("sub").textContent = "“" + tmp + "”";
    if (fin && !got) { got = true; silence = 0; conf < 0.4 ? say("Sorry, the line is unclear. Could you repeat that?") : handle(fin.trim()); }
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") { live = false; setState("", "Microphone blocked", "Allow the mic in your browser settings, or type below."); }
  };
  rec.onend = () => {
    if (!live || busy || speaking || got) return;
    silence++;                                   // no speech heard
    if (silence === 2) return say("Are you still there? Take your time, I'm listening.");
    if (silence >= 4) return say("I haven't heard anything, so I'll end the call for now. You can call me anytime.", true);
    setTimeout(listen, 300);
  };
  try { rec.start(); } catch (e) {}
}

/* ---------- Server calls ---------- */
async function api(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  if (!r.ok && r.status !== 500) throw new Error((await r.json().catch(() => ({}))).error || "Request failed");
  return r.json();
}
async function handle(text) {
  if (!text || busy) return; busy = true; bubble("me", text); stopListen(); setState("", "Thinking…", "Checking the account data.");
  let out;
  try { out = await api("/api/chat", { sessionId, text }); }
  catch (e) { out = { reply: "Sorry, I'm having a connection problem. Please say that again in a moment.", ended: false }; }
  busy = false; await say(out.reply, out.ended); if (out.ended && out.summary) showSummary(out.summary);
}
async function startCall() {
  if (live) return;
  try {
    const s = await api("/api/session"); sessionId = s.sessionId;
    live = true; busy = false; silence = 0; $("log").innerHTML = ""; $("sum").style.display = "none"; $("end").disabled = false; $("orb").textContent = "Tap to interrupt";
    await say(s.greeting);
  } catch (e) { setState("", "Can't connect", "Check that the server is running."); }
}
async function finish() {
  live = false; stopListen(); speechSynthesis.cancel(); setState("", "Call ended", "Summary on the right."); $("orb").textContent = "Call KAM"; $("end").disabled = true;
  if ($("sum").style.display === "none") {
    try { const o = await api("/api/chat", { sessionId, text: "that's all, thank you, bye" }); if (o.summary) showSummary(o.summary); } catch (e) {}
  }
}

$("orb").onclick = () => { if (!live) startCall(); else if (speaking) speechSynthesis.cancel(); };
$("end").onclick = finish;
$("send").onclick = async () => { const v = $("txt").value.trim(); if (!v) return; $("txt").value = ""; if (!live) await startCall(); handle(v); };
$("txt").onkeydown = (e) => { if (e.key === "Enter") $("send").click(); };

fetch("/api/data").then((r) => r.json()).then(renderTable);
fetch("/api/health").then((r) => r.json()).then((h) => {
  $("chips").innerHTML = "";
  [SR ? "Speech input: browser" : "Speech input: unavailable (type instead)", "Voice output: browser TTS", "Brain: " + h.brain].forEach((t) => { const c = document.createElement("span"); c.className = "chip"; c.textContent = t; $("chips").append(c); });
});
