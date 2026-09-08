/**
 * GlucoCare - local AI proxy server (Stage 8)
 * =============================================================
 * A tiny backend so the AI-assisted explanation works on your machine during
 * development and demos, WITHOUT putting an API key in the browser.
 *
 * Works with several providers - pick whichever you can get for FREE:
 *
 *   AI_PROVIDER=gemini     GEMINI_API_KEY=...     free tier, no card
 *                          https://aistudio.google.com/apikey
 *   AI_PROVIDER=groq       GROQ_API_KEY=...       free tier, no card, very fast
 *                          https://console.groq.com/keys
 *   AI_PROVIDER=ollama     (no key)              100% free, runs on your PC
 *                          https://ollama.com  ->  ollama pull llama3.2
 *   AI_PROVIDER=anthropic  ANTHROPIC_API_KEY=... paid (Claude)
 *
 * If AI_PROVIDER is not set, the server auto-picks based on which key is
 * present (or Ollama if it is running).
 *
 * Requirements: Node 18+ (built-in fetch + --env-file). No npm packages.
 *
 * Run:
 *   1. Put your choice in .env  (see .env.example)
 *   2. npm run server        (and, separately, npm run dev)
 *      or: npm run dev:all
 */

import { createServer } from "node:http";

const PORT = Number(process.env.AI_PROXY_PORT ?? 8787);

/* ---------- provider config ---------------------------------------- */

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

function pickProvider() {
  const explicit = (process.env.AI_PROVIDER ?? "").toLowerCase();
  if (explicit) return explicit;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "ollama"; // last resort - checked for reachability at call time
}

const PROVIDER = pickProvider();

const MODELS = {
  gemini: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  groq: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  ollama: process.env.OLLAMA_MODEL ?? "llama3.2",
  anthropic: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
};

/* ---------- shared prompt + safety -------------------------------- */

const SYSTEM_PROMPT = `
You are an educational assistant for GlucoCare, a diabetes health-support tool.
You are given an ALREADY-COMPUTED assessment summary. Your only job is to
explain it in plain, calm language for a non-medical reader.

STRICT RULES - never break these:
- Do NOT diagnose. Never say the person "has" or "does not have" any condition.
- Do NOT name specific medications or give any dosage.
- Do NOT tell the person to start, stop or change treatment.
- Do encourage seeing a qualified healthcare professional.
- If red flags are present, clearly and early advise seeking prompt medical care.
- Keep it short. No headings. Simple words.

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "summary": "3-5 sentence plain-language overview",
  "termNotes": [{ "term": "HbA1c", "meaning": "..." }],
  "suggestions": ["general lifestyle suggestion", "..."],
  "whoToSee": "e.g. a general physician; an endocrinologist manages diabetes"
}
`.trim();

const DISCLAIMER =
  "This is an AI-generated educational summary, not medical advice or a diagnosis. Always confirm anything important with a qualified healthcare professional.";

/* ---------- provider calls --------------------------------------- */

function userMessage(payload) {
  return (
    "Explain this GlucoCare assessment summary as JSON only:\n\n" +
    JSON.stringify(payload, null, 2)
  );
}

async function callGemini(payload) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in .env");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userMessage(payload) }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 900 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return body?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

async function callGroq(payload) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set in .env");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODELS.groq,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage(payload) },
      ],
      response_format: { type: "json_object" },
      max_tokens: 900,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return body?.choices?.[0]?.message?.content ?? "{}";
}

async function callOllama(payload) {
  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELS.ollama,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage(payload) },
        ],
      }),
    });
  } catch {
    throw new Error(
      `Cannot reach Ollama at ${OLLAMA_URL}. Install it from ollama.com, then run: ollama pull ${MODELS.ollama}`,
    );
  }
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return body?.message?.content ?? "{}";
}

async function callAnthropic(payload) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set in .env");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELS.anthropic,
      max_tokens: 900,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage(payload) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return body?.content?.[0]?.text ?? "{}";
}

const PROVIDERS = {
  gemini: callGemini,
  groq: callGroq,
  ollama: callOllama,
  anthropic: callAnthropic,
};

/* ---------- parse model output safely --------------------------- */

function extractJson(text) {
  const cleaned = String(text).replace(/```json\s*|\s*```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return { summary: cleaned };
  }
}

function shape(parsed) {
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    termNotes: Array.isArray(parsed.termNotes) ? parsed.termNotes : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    whoToSee: typeof parsed.whoToSee === "string" ? parsed.whoToSee : "",
    disclaimer: DISCLAIMER,
  };
}

/* ---------- http server ----------------------------------------- */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function send(res, status, data) {
  res.writeHead(status, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("Body too large"));
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    send(res, 200, { ok: true, provider: PROVIDER, model: MODELS[PROVIDER] });
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/api/explain-results")) {
    send(res, 404, { error: "Not found" });
    return;
  }

  const call = PROVIDERS[PROVIDER];
  if (!call) {
    send(res, 500, {
      error: `Unknown AI_PROVIDER "${PROVIDER}". Use gemini, groq, ollama or anthropic.`,
    });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    send(res, 400, { error: "Invalid JSON body." });
    return;
  }

  try {
    const raw = await call(payload);
    send(res, 200, shape(extractJson(raw)));
  } catch (error) {
    send(res, 502, {
      error: error instanceof Error ? error.message : "Unknown server error",
    });
  }
});

server.listen(PORT, () => {
  console.log(`GlucoCare AI proxy on http://localhost:${PORT}`);
  console.log(`  provider: ${PROVIDER}`);
  console.log(`  model:    ${MODELS[PROVIDER]}`);
  console.log(`  frontend: set VITE_AI_FUNCTION_URL=http://localhost:${PORT}/api/explain-results`);
});
