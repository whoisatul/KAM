// STEP 9 - Voice client. Browser SpeechRecognition (STT) + speechSynthesis (TTS);
// all intelligence stays on the server. The call stays open until the seller ends it.
const $ = (id) => document.getElementById(id);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const inr = (n) => "₹" + n.toLocaleString("en-IN");
const pct = (a, b) => Math.round(((b - a) / a) * 1000) / 10;
const VOICE_KEY = "kam-voice";

let sessionId = null, live = false, busy = false, speaking = false, rec = null, voice = null;
let micStream = null, recPause = null, pendingSpeech = "", lastSpoken = "";
let sttLang = "en-IN", emptyListens = 0, thinkClock = null, meterRaf = 0, audioCtx = null, analyser = null;

/* ---------- UI helpers ---------- */
function setState(cls, status, sub) {
  $("orb").className = (live ? "live " : "") + cls;
  $("status").textContent = status;
  if (sub) $("sub").textContent = sub;
  if (!live) $("orb").textContent = "Call KAM";
  else if (cls.includes("listen")) $("orb").textContent = "Listening";
  else if (cls.includes("think")) $("orb").textContent = "Working";
  else if (cls.includes("speak")) $("orb").textContent = "Speaking";
  else $("orb").textContent = "Tap to talk";
}
function bubble(who, text) {
  hideTyping();
  const l = $("log"); const e = l.querySelector(".empty"); if (e) e.remove();
  const d = document.createElement("div"); d.className = "b " + who;
  const s = document.createElement("small"); s.textContent = who === "bot" ? "Virtual KAM" : "You";
  d.append(s, document.createTextNode(text)); l.append(d); l.scrollTop = l.scrollHeight;
}
function showTyping() {
  hideTyping();
  const l = $("log"); const e = l.querySelector(".empty"); if (e) e.remove();
  const d = document.createElement("div"); d.id = "typing"; d.className = "b bot typing";
  d.innerHTML = "<small>Virtual KAM</small><span class='dots' aria-hidden='true'><i></i><i></i><i></i></span>";
  l.append(d); l.scrollTop = l.scrollHeight;
}
function hideTyping() { $("typing")?.remove(); }
function startThinkClock() {
  clearInterval(thinkClock);
  const t0 = Date.now();
  const tick = () => {
    if (!busy) return;
    const s = Math.round((Date.now() - t0) / 1000);
    $("sub").textContent = s < 3 ? "Checking your account…" : s < 8 ? "Looking at sales and stock…" : "Still working — this can take a few seconds… (" + s + "s)";
  };
  tick();
  thinkClock = setInterval(tick, 700);
}
function stopThinkClock() { clearInterval(thinkClock); thinkClock = null; }
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

/* ---------- Speech output + voice picker ---------- */
function voices() { return "speechSynthesis" in window ? speechSynthesis.getVoices() : []; }
function fillVoices() {
  const list = voices();
  if (!list.length) return;
  const sel = $("voiceSel");
  const saved = localStorage.getItem(VOICE_KEY);
  const prev = sel.value;
  sel.innerHTML = list.map((v) => {
    const id = v.name + "|" + v.lang;
    return `<option value="${id.replace(/"/g, "")}">${v.name} (${v.lang})</option>`;
  }).join("");
  const want = saved || prev;
  let match = [...sel.options].find((o) => o.value === want);
  if (!match) match = [...sel.options].find((o) => /en-IN/i.test(o.value)) || [...sel.options].find((o) => /\|en/i.test(o.value)) || sel.options[0];
  if (match) sel.value = match.value;
  applyVoice();
}
function applyVoice() {
  const id = $("voiceSel").value;
  voice = voices().find((v) => v.name + "|" + v.lang === id) || null;
  if (voice) localStorage.setItem(VOICE_KEY, voice.name + "|" + voice.lang);
}
if ("speechSynthesis" in window) {
  fillVoices();
  speechSynthesis.onvoiceschanged = fillVoices;
}
function isEcho(text) {
  const a = String(text || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const b = lastSpoken.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!a || a.length < 8 || !b) return false;
  if (b.includes(a) || a.includes(b.slice(0, Math.min(48, b.length)))) return true;
  const aw = a.split(" ").filter((w) => w.length > 3);
  if (!aw.length) return false;
  const hit = aw.filter((w) => b.includes(w)).length;
  return hit / aw.length >= 0.6;
}
function speak(text) {
  lastSpoken = text;
  return new Promise((res) => {
    if (!("speechSynthesis" in window)) { speaking = false; return res(); }
    speaking = true;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-IN";
    u.rate = 1;
    let settled = false;
    const done = () => {
      const wait = () => {
        if (speechSynthesis.speaking) return setTimeout(wait, 80);
        if (settled) return;
        settled = true;
        speaking = false;
        res();
      };
      setTimeout(wait, 120);
    };
    u.onend = done;
    u.onerror = done;
    setState("speak", "Speaking…", "Tap the orb to interrupt.");
    setTimeout(() => { try { speechSynthesis.speak(u); } catch (e) { done(); } }, 80);
    setTimeout(done, 60000);
  });
}
async function say(text, ended) {
  hideTyping(); bubble("bot", text); stopListen(); await speak(text);
  if (ended) return finish();
  if (live) setTimeout(() => { if (live && !busy && !speaking) listen(); }, 400);
}

/* ---------- Speech input ---------- */
function abortRec() {
  clearTimeout(recPause); recPause = null;
  if (rec) { rec.onend = null; rec.onerror = null; try { rec.abort(); } catch (e) {} rec = null; }
}
function stopListen() { pendingSpeech = ""; abortRec(); }
function releaseMic() {
  cancelAnimationFrame(meterRaf);
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  const meter = $("meter"); if (meter) meter.hidden = true;
}
function startMeter() {
  const meter = $("meter");
  if (!micStream || !meter) return;
  meter.hidden = false;
  try {
    audioCtx = audioCtx || new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    if (!analyser) {
      const src = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
    }
  } catch (e) { return; }
  const data = new Uint8Array(analyser.fftSize);
  const bars = [...meter.querySelectorAll("i")];
  const draw = () => {
    meterRaf = requestAnimationFrame(draw);
    if (!analyser) return;
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
    const level = Math.min(1, peak / 40);
    bars.forEach((b, i) => { b.style.height = 4 + level * (6 + i * 3) + "px"; });
  };
  cancelAnimationFrame(meterRaf); draw();
}
async function holdMic() {
  if (micStream || !navigator.mediaDevices?.getUserMedia) return !!micStream;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    startMeter();
    return true;
  } catch (e) {
    setState(live ? "live" : "", "Microphone blocked", "Allow the mic, or type below. The call stays open.");
    return false;
  }
}
function listen() {
  if (!live || !SR || busy || speaking) return;
  abortRec();
  rec = new SR();
  rec.lang = sttLang;
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 1;
  rec.onstart = () => setState("listen", "Listening…", "Speak now — bars should move when you talk.");
  rec.onresult = (e) => {
    emptyListens = 0;
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) pendingSpeech += t + " ";
      else interim += t;
    }
    const shown = (pendingSpeech + " " + interim).trim();
    if (shown) $("sub").textContent = "“" + shown + "”";
    clearTimeout(recPause);
    if (!pendingSpeech.trim() && !interim.trim()) return;
    recPause = setTimeout(() => {
      const text = (pendingSpeech || interim).trim();
      pendingSpeech = "";
      if (!text || !live || busy || speaking || isEcho(text)) return;
      handle(text);
    }, pendingSpeech.trim() ? 800 : 1600);
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      setState("live", "Microphone blocked", "Allow the mic in the browser, or type below. The call stays open.");
    }
    if (e.error === "language-not-supported") sttLang = "en-US";
  };
  rec.onend = () => {
    rec = null;
    if (!live || busy || speaking) return;
    if (pendingSpeech.trim()) return;
    emptyListens++;
    if (emptyListens >= 2 && sttLang === "en-IN") sttLang = "en-US";
    setTimeout(() => { if (live && !busy && !speaking) listen(); }, 280);
  };
  try { rec.start(); } catch (e) {
    rec = null;
    setTimeout(() => { if (live && !busy && !speaking) listen(); }, 800);
  }
}

/* ---------- Server calls ---------- */
async function api(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  if (!r.ok && r.status !== 500) throw new Error((await r.json().catch(() => ({}))).error || "Request failed");
  return r.json();
}
function wantsEnd(text) {
  return /\b(bye|goodbye|that's all|thats all|nothing else|no more|end (the )?call|that will be all)\b/i.test(text);
}
function showBrain(brain) {
  const el = $("chips");
  if (!el || !brain) return;
  let chip = el.querySelector("[data-brain]");
  if (!chip) { chip = document.createElement("span"); chip.className = "chip"; chip.dataset.brain = "1"; el.append(chip); }
  chip.textContent = "Brain: " + brain;
}
async function handle(text) {
  if (!text || busy) return;
  busy = true; bubble("me", text); stopListen(); showTyping();
  setState("think", "Thinking…", "Checking your account…");
  startThinkClock();
  let out;
  try { out = await api("/api/chat", { sessionId, text }); }
  catch (e) { out = { reply: "Sorry, I'm having a connection problem. Please say that again in a moment.", ended: false }; }
  stopThinkClock(); showBrain(out.brain); hideTyping();
  busy = false;
  const hangup = !!(out.ended && wantsEnd(text));
  await say(out.reply, hangup);
  if (out.ended && out.summary && hangup) showSummary(out.summary);
}
async function startCall() {
  if (live) return;
  try {
    await holdMic();
    const s = await api("/api/session"); sessionId = s.sessionId;
    live = true; busy = false; pendingSpeech = ""; emptyListens = 0; $("log").innerHTML = ""; $("sum").style.display = "none"; $("end").disabled = false;
    await say(s.greeting);
  } catch (e) { setState("", "Can't connect", "Check that the server is running."); }
}
async function finish() {
  live = false; stopThinkClock(); hideTyping(); stopListen(); releaseMic(); if ("speechSynthesis" in window) speechSynthesis.cancel();
  setState("", "Call ended", "Summary on the right. Tap Call KAM to start again."); $("end").disabled = true;
  if ($("sum").style.display === "none") {
    try { const o = await api("/api/chat", { sessionId, text: "that's all, thank you, bye" }); if (o.summary) showSummary(o.summary); } catch (e) {}
  }
}

$("orb").onclick = () => {
  if (!live) startCall();
  else if (speaking) { speechSynthesis.cancel(); speaking = false; setState("live", "Your turn", "Tap the orb, then speak."); }
  else if (!busy) listen();
};
$("end").onclick = finish;
$("send").onclick = async () => { const v = $("txt").value.trim(); if (!v) return; $("txt").value = ""; if (!live) await startCall(); handle(v); };
$("txt").onkeydown = (e) => { if (e.key === "Enter") $("send").click(); };
$("voiceSel").onchange = applyVoice;
$("preview").onclick = () => {
  applyVoice();
  speak("Namaste, I'm your Snapdeal Virtual KAM. How can I help you today?");
};

fetch("/api/data").then((r) => r.json()).then(renderTable);
fetch("/api/health").then((r) => r.json()).then((h) => {
  $("chips").innerHTML = "";
  [SR ? "Speech input: browser" : "Speech input: unavailable (type instead)", "Voice output: browser TTS", "Brain: " + h.brain].forEach((t) => { const c = document.createElement("span"); c.className = "chip"; c.textContent = t; $("chips").append(c); });
});
