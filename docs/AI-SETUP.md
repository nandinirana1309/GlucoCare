# AI-assisted explanation - setup

The **AI-assisted explanation** on the Results page turns the numbers into a
short, plain-language summary, explains medical terms, and suggests what kind of
professional to see. It **never diagnoses, prescribes, or gives dosages** - a
system prompt on the server and a fixed disclaimer enforce this.

The app works fine without this. Turn it on only when you want it.

---

## You do NOT need to buy credits

Pick any one of these. The local proxy (`server/ai-proxy.mjs`) supports all of
them - you only change `.env`.

| Provider | Cost | Card needed? | Get a key |
|---|---|---|---|
| **Google Gemini** | Free tier | No | <https://aistudio.google.com/apikey> |
| **Groq** | Free tier (fast) | No | <https://console.groq.com/keys> |
| **Ollama** (runs on your PC) | 100% free | No key at all | <https://ollama.com> |
| Anthropic Claude | Paid | Yes | <https://console.anthropic.com> |

Free tiers have rate limits (a few requests per minute) - fine for a demo,
since each explanation is one button click.

---

## Option A - Google Gemini (recommended, easiest)

### 1. Get a free key
Go to <https://aistudio.google.com/apikey>, sign in with a Google account,
click **Create API key**. No card, no billing.

### 2. Create `.env`
In the `gluco-care` folder, copy `.env.example` to `.env` and set:

```
VITE_AI_FUNCTION_URL=http://localhost:8787/api/explain-results
AI_PROVIDER=gemini
GEMINI_API_KEY=AIza...your-key...
```

### 3. Run the site + the AI server together
```bash
npm run dev:all
```
You should see `provider: gemini` in the output.

### 4. Try it
Complete an assessment -> **Results** -> scroll to **AI-assisted explanation**
-> **Explain my results**.

Check the server any time: <http://localhost:8787/health>

---

## Option B - Groq (free, very fast)

Same as above, but in `.env`:

```
VITE_AI_FUNCTION_URL=http://localhost:8787/api/explain-results
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...your-key...
```

Get the key at <https://console.groq.com/keys> (sign in, create key, no card).

---

## Option C - Ollama (no key, no internet needed, no cost ever)

Best if you do not want to sign up for anything. Needs ~4 GB free disk and a
reasonably modern laptop (it runs the model on your own machine).

### 1. Install and pull a model
Download from <https://ollama.com>, then in a terminal:
```bash
ollama pull llama3.2
```

### 2. `.env`
```
VITE_AI_FUNCTION_URL=http://localhost:8787/api/explain-results
AI_PROVIDER=ollama
```
(no key line needed)

### 3. Run
Make sure Ollama is running (it usually starts on install), then:
```bash
npm run dev:all
```

First response may take 10-30 seconds while the model loads into memory.

---

## Option D - Deployed site (Supabase Edge Function)

For a hosted site, use a Supabase Edge Function so there is no separate server.
It supports **Gemini, Groq or Anthropic** (not Ollama - that is local only).

```bash
cd gluco-care
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy explain-results --no-verify-jwt
# set ONE of these:
supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY=AIza...
# or: supabase secrets set AI_PROVIDER=groq GROQ_API_KEY=gsk_...
```

Then set in `.env` (and your host's env vars):
```
VITE_AI_FUNCTION_URL=https://<your-project-ref>.functions.supabase.co/explain-results
```

---

## How it stays safe

| Concern | How it is handled |
|---|---|
| Key exposure | Key is only in `.env` / a Supabase secret. Never `VITE_`-prefixed, never bundled. |
| Diagnosis / prescriptions | System prompt forbids naming conditions, medications and dosages. |
| Bad model output | The server always attaches its own fixed "not medical advice" disclaimer. |
| Privacy | Only non-identifying fields are sent (age, gender, history flags, symptoms, computed statuses). No name, no locality, no report file. |

## Troubleshooting

| Message on the Results page | Fix |
|---|---|
| "Could not reach the AI service..." | Start the server: `npm run server` (or `npm run dev:all`). |
| "GEMINI_API_KEY is not set" / "GROQ_API_KEY is not set" | Add the key to `.env`, restart the server. |
| "Cannot reach Ollama at ..." | Install Ollama and run `ollama pull llama3.2`; make sure it is running. |
| "... 429" | Free-tier rate limit - wait a minute and try again. |
| Button doesn't appear at all | `VITE_AI_FUNCTION_URL` is empty - set it and restart `npm run dev`. |
