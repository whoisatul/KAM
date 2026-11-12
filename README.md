# Snapdeal Virtual KAM

A voice-first AI account manager. A seller calls because sales dropped; the bot interviews them, diagnoses the cause from account data, and recommends what to fix. Built on Node, Gemini function calling, and the browser's speech APIs.

**Live demo:** `<your-render-link>` (free tier sleeps; first load can take a minute)

## Architecture

```
Browser                                   Server (Express)
────────                                  ──────────────────────────────────────
Web Speech API (STT) ──text──► POST /api/chat
                                          1. checkInput()    injection, abuse/human, empty, length, turn cap
                                          2. llm.chat()      Gemini generateContent + function calling (max 4 tool rounds)
                                                ├─ get_sales_metrics()          ┐
                                                ├─ get_out_of_stock_items()     │ pure functions over
                                                ├─ get_cancellation_reasons()   │ src/data/seller.js
                                                ├─ escalate_to_human()          │
                                                └─ end_call(summary)            ┘
                                          3. checkOutput()   strip markdown, trim to 80 words, block unknown numbers
speechSynthesis (TTS) ◄──reply + summary── 4. respond { reply, brain, ended, summary }
```

If Gemini errors or times out (12 s), `fallback.js` answers that turn from a scripted flow and the response is tagged `brain: fallback`, so the UI can show it. The call never dies on a model failure.

## Design decisions

- **Tools do the maths, not the model.** `getSalesMetrics()` returns percent changes, lost orders and a ranked diagnosis. The model narrates; it doesn't calculate.
- **Hallucination guard.** Every number above 10 in a reply is checked against the numbers present in tool output. Unknown figure means the reply is replaced with a safe, on-data response.
- **Key stays server-side.** The browser only talks to `/api/*`.
- **One file to swap the model.** `src/llm.js` exposes `chat(session, text)`; changing provider touches nothing else.
- **Voice UX in the client.** Continuous recognition with a 1.4 s pause detector, so users can finish sentences. Silence handling is time-based (reprompt at 20 s, end at 45 s). Low-confidence transcripts trigger a "please repeat". STT is paused while TTS plays to avoid the bot hearing itself.
- **Gemini 2.5 note.** Thinking tokens count against `maxOutputTokens`, so `thinkingBudget` is set to 0; otherwise replies can come back empty.

## Run locally

Requires Node 18+, Chrome or Edge, and a [Gemini API key](https://aistudio.google.com).

```bash
git clone <your-repo-url> && cd virtual-kam
npm install
cp .env.example .env        # set GEMINI_API_KEY
npm run dev                 # http://localhost:3000
```

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | `gemini` or `mock` (offline scripted flow, no key) |
| `GEMINI_API_KEY` | none | Required for `gemini` |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Any Gemini model that supports function calling |
| `PORT` | `3000` | Server port |

## API

| Route | Description |
|---|---|
| `POST /api/session` | Creates a session, returns `{ sessionId, greeting }` |
| `POST /api/chat` | Body `{ sessionId, text }`, returns `{ reply, brain, ended, summary, escalated }` |
| `GET /api/data` | Mock seller data for the dashboard |
| `GET /api/health` | Server status and configured brain |
| `GET /api/llm-check` | Makes one live Gemini call; returns the exact error if it fails |

Sessions are in-memory with a 1 hour TTL. Rate limit: 40 requests per minute per IP.

## Mock data

`src/data/seller.js`. The five metrics come from the brief (sales ₹2,00,000 to ₹1,35,000; orders 400 to 270; cancellations 8% to 14%; price flat at ₹500; out-of-stock 5 to 18). Assumptions added: seller rating 4.3 to 3.9, ad spend ₹4,000 to ₹0, competitor prices within 3%, five named out-of-stock SKUs (136 orders a month combined), and a cancellation-reason split.

Reading of the data: price is flat, so this is a volume problem. Stock-outs explain the lost orders, and cancellations plus ad spend dropping to zero explain the lost visibility.

## Tests

```bash
npm test
```

13 tests with no network or key needed: guardrails (injection, escalation, truncation, markdown stripping, unknown numbers, over-promising) and a full mock conversation through to the summary.

## Structure

```
server.js            routes, rate limit, session store
src/data/seller.js   mock data and assumptions
src/tools.js         tool functions, diagnosis, default summary
src/prompt.js        system prompt: persona, flow, guardrail rules
src/guardrails.js    input and output checks
src/llm.js           Gemini function-calling loop
src/fallback.js      offline scripted brain
src/session.js       per-turn orchestration
public/              index.html, style.css, app.js (voice client)
tests/               guardrail and flow tests
```

## Deploy

Any always-on Node host (Render, Railway): build `npm install`, start `npm start`, set the env vars above, and set `app.set("trust proxy", 1)` behind a proxy. HTTPS is required for microphone access. Serverless platforms need the in-memory session store moved to Redis first.

## Limitations and next steps

- Browser STT/TTS: Chrome or Edge only, robotic voice, English-India only. Next: ElevenLabs or Gemini TTS, streaming, and Hindi/Hinglish.
- In-memory sessions reset on restart. Next: Redis.
- Single mock seller. Next: a seller-lookup tool against real account data, WhatsApp delivery of the summary, and proactive outbound calls when stock-outs or cancellations spike.
