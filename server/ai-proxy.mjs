/**
 * GlucoCare - local AI proxy server (Stage 8, hardened in Project-II Phase 9)
 * =============================================================
 * A tiny backend so the AI-assisted explanation works on your machine during
 * development and demos, WITHOUT putting an API key in the browser.
 *
 * Works with several providers - pick whichever you can get for FREE:
 *
 *   AI_PROVIDER=gemini     GEMINI_API_KEY=...     free tier, no card
 *   AI_PROVIDER=groq       GROQ_API_KEY=...       free tier, no card, very fast
 *   AI_PROVIDER=ollama     (no key)              100% free, runs on your PC
 *   AI_PROVIDER=anthropic  ANTHROPIC_API_KEY=... paid (Claude)
 *
 * Two request formats:
 *   v2 (Project-II): { task: "explain-assessment", promptVersion: "2.0", evidence }
 *       - the evidence is the deterministic engine output (see src/lib/aiEvidence.ts)
 *       - the browser validates every reply with src/lib/aiGuard.ts
 *   v1 (legacy):     { concernLevel, indicators, riskFactors, redFlags, context }
 *
 * Protections (Phase 9):
 *   - API keys only in .env on this machine (never VITE_ prefixed)
 *   - only browser origins listed in AI_ALLOWED_ORIGINS may call it
 *   - per-client rate limit, 32 KB request limit, 25 s provider timeout
 *   - refuses to explain an assessment whose safety status is urgent
 *   - reply is re-shaped (types, lengths) before it is returned
 *
 * Requirements: Node 18+ (built-in fetch + --env-file). No npm packages.
 * Run: npm run server   (and, separately, npm run dev)  or  npm run dev:all
 */

import { createServer } from "node:http";

const PORT = Number(process.env.AI_PROXY_PORT ?? 8787);
const MAX_BODY_BYTES = 32 * 1024;
const PROVIDER_TIMEOUT_MS = Number(process.env.AI_PROVIDER_TIMEOUT_MS ?? 25_000);
const RATE_LIMIT = { max: Number(process.env.AI_RATE_LIMIT ?? 20), windowMs: 10 * 60 * 1000 };
const ALLOWED_ORIGINS = (process.env.AI_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
  gemini: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
  groq: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  ollama: process.env.OLLAMA_MODEL ?? "llama3.2",
  anthropic: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
};

/* ---------- prompts ------------------------------------------------ */

const SYSTEM_PROMPT_V1 = `
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

const SYSTEM_PROMPT_V2 = `
You are an educational assistant inside GlucoCare, a diabetes health-support tool.
You receive STRUCTURED EVIDENCE produced by GlucoCare's deterministic assessment
engine. Your only job is to EXPLAIN that evidence in plain, calm language.

The concern level, score, factors, points and safety status are FINAL. Never
recalculate, change, question or contradict them.

STRICT RULES - a separate validator removes any sentence that breaks them:
- Only explain factors listed in "factors" with points greater than 0, using their exact "id".
- Only use numbers that appear in the evidence. Do not add new numbers, targets, thresholds or time frames.
- Mention the concern level and the score only exactly as given in evidence.assessment.
- Do NOT diagnose. Never say the person has, or does not have, any condition.
- Do NOT name medicines, give doses, or tell the person to start, stop or change any treatment.
- Do NOT predict future values or guarantee any outcome.
- Do NOT reassure in a way that discourages seeing a professional.
- Encourage discussing the results with a qualified healthcare professional.
- Short, simple words. No headings, no markdown.

Return ONLY valid JSON with exactly this shape:
{
  "summary": "2-4 sentences",
  "factorExplanations": [{ "factorId": "<id from evidence>", "text": "1-2 sentences" }],
  "changeExplanation": "1-2 sentences about evidence.changes, or null if changes is null",
  "generalTips": ["general, non-medical lifestyle tip", "..."],
  "questionsForClinician": ["question the person could ask", "..."],
  "terms": [{ "term": "HbA1c", "meaning": "plain explanation" }]
}
`.trim();

const DISCLAIMER =
  "This is an AI-generated educational summary, not medical advice or a diagnosis. Always confirm anything important with a qualified healthcare professional.";

/* ---------- provider calls --------------------------------------- */

/** An error from the AI provider, with its HTTP status (details are server-side only). */
class ProviderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function userMessage(payload, v2) {
  return v2
    ? "Explain this GlucoCare evidence as JSON only:\n\n" + JSON.stringify(payload, null, 2)
    : "Explain this GlucoCare assessment summary as JSON only:\n\n" + JSON.stringify(payload, null, 2);
}

const timeout = () => AbortSignal.timeout(PROVIDER_TIMEOUT_MS);

/**
 * Gemini models are retired and renamed over time, and busy models return
 * 503. The primary model is tried first; on "retired / overloaded / rate
 * limited" (404, 429, 500, 503) the fallback models are tried in order.
 */
const GEMINI_FALLBACKS = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-flash-latest")
  .split(",")
  .map((s) => s.trim())
  .filter((m) => m && m !== MODELS.gemini);
const RETRYABLE = new Set([404, 429, 500, 503]);

/** Longest a single model attempt may take, so a hung model cannot use up the whole budget. */
const PER_MODEL_TIMEOUT_MS = Number(process.env.GEMINI_PER_MODEL_TIMEOUT_MS ?? 12_000);

async function callGemini(system, user) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ProviderError(500, "GEMINI_API_KEY is not set in .env");
  const deadline = Date.now() + PROVIDER_TIMEOUT_MS; // overall budget for all attempts
  let lastError;
  for (const model of [MODELS.gemini, ...GEMINI_FALLBACKS]) {
    const remaining = deadline - Date.now();
    if (remaining < 1500) break; // not enough time left for another attempt
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        // API key in a header (not the URL) so it can never appear in URLs or logs.
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        signal: AbortSignal.timeout(Math.min(PER_MODEL_TIMEOUT_MS, remaining)),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          // Newer models spend part of this budget on internal reasoning.
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 4096 },
        }),
      });
    } catch (error) {
      // A model that hangs is treated like a busy one: try the next model.
      if (error?.name !== "TimeoutError" && error?.name !== "AbortError") throw error;
      lastError = error;
      console.warn(`[ai-proxy] ${model} did not answer in time; trying the next model`);
      continue;
    }
    if (res.ok) {
      const body = await res.json();
      const parts = body?.candidates?.[0]?.content?.parts ?? [];
      return parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("") || "{}";
    }
    lastError = new ProviderError(res.status, `Gemini model ${model} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    if (!RETRYABLE.has(res.status)) break;
    console.warn(`[ai-proxy] ${model} unavailable (${res.status}); trying the next model`);
  }
  throw lastError ?? Object.assign(new Error("AI provider time budget used up"), { name: "TimeoutError" });
}

async function callGroq(system, user) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set in .env");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    signal: timeout(),
    body: JSON.stringify({
      model: MODELS.groq,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1200,
    }),
  });
  if (!res.ok) throw new ProviderError(res.status, `Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return body?.choices?.[0]?.message?.content ?? "{}";
}

async function callOllama(system, user) {
  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: timeout(),
      body: JSON.stringify({
        model: MODELS.ollama,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (error) {
    // A timeout is reported as a timeout, not as "cannot reach".
    if (error?.name === "TimeoutError" || error?.name === "AbortError") throw error;
    throw new Error(
      `Cannot reach Ollama at ${OLLAMA_URL}. Install it from ollama.com, then run: ollama pull ${MODELS.ollama}`,
    );
  }
  if (!res.ok) throw new ProviderError(res.status, `Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return body?.message?.content ?? "{}";
}

async function callAnthropic(system, user) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set in .env");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    signal: timeout(),
    body: JSON.stringify({
      model: MODELS.anthropic,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new ProviderError(res.status, `Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return body?.content?.[0]?.text ?? "{}";
}

const PROVIDERS = {
  gemini: callGemini,
  groq: callGroq,
  ollama: callOllama,
  anthropic: callAnthropic,
};

/* ---------- parse + shape model output --------------------------- */

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

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);

function shapeV1(parsed) {
  return {
    summary: str(parsed.summary, 1200),
    termNotes: arr(parsed.termNotes, 8),
    suggestions: arr(parsed.suggestions, 8),
    whoToSee: str(parsed.whoToSee, 300),
    disclaimer: DISCLAIMER,
  };
}

/** Shape only - CONTENT is validated in the browser by src/lib/aiGuard.ts. */
function shapeV2(parsed) {
  return {
    summary: str(parsed.summary, 1200),
    factorExplanations: arr(parsed.factorExplanations, 11)
      .filter((f) => f && typeof f === "object")
      .map((f) => ({ factorId: str(f.factorId, 40), text: str(f.text, 600) })),
    changeExplanation: typeof parsed.changeExplanation === "string" ? parsed.changeExplanation.slice(0, 600) : null,
    generalTips: arr(parsed.generalTips, 6).map((t) => str(t, 600)),
    questionsForClinician: arr(parsed.questionsForClinician, 6).map((t) => str(t, 600)),
    terms: arr(parsed.terms, 6)
      .filter((t) => t && typeof t === "object")
      .map((t) => ({ term: str(t.term, 80), meaning: str(t.meaning, 600) })),
  };
}

/* ---------- http helpers ----------------------------------------- */

function corsHeaders(origin) {
  return origin && ALLOWED_ORIGINS.includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "content-type, authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

function send(res, status, data, origin) {
  res.writeHead(status, { "content-type": "application/json", ...corsHeaders(origin) });
  res.end(JSON.stringify(data));
}

/**
 * Reads the body up to MAX_BODY_BYTES. A larger body is drained (discarded,
 * not kept in memory) so the client receives a proper 413 response; beyond
 * 1 MB the connection is simply closed.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        req.destroy();
        return;
      }
      if (size <= MAX_BODY_BYTES) raw += chunk;
    });
    req.on("end", () =>
      size > MAX_BODY_BYTES ? reject(Object.assign(new Error("Request too large"), { status: 413 })) : resolve(raw),
    );
    req.on("error", reject);
  });
}

/** Simple fixed-window rate limit per client address (in memory). */
const hits = new Map();
function rateLimited(key) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.start > RATE_LIMIT.windowMs) {
    hits.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

/* ---------- http server ----------------------------------------- */

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;

  // Browsers always send Origin on cross-origin requests; unknown origins are refused.
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    send(res, 403, { error: "Origin not allowed" }, undefined);
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    send(res, 200, { ok: true, provider: PROVIDER, model: MODELS[PROVIDER] }, origin);
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/api/explain-results")) {
    send(res, 404, { error: "Not found" }, origin);
    return;
  }

  if (rateLimited(req.socket.remoteAddress ?? "unknown")) {
    send(res, 429, { error: "Too many requests. Please wait a few minutes and try again." }, origin);
    return;
  }

  const call = PROVIDERS[PROVIDER];
  if (!call) {
    send(res, 500, { error: `Unknown AI_PROVIDER "${PROVIDER}". Use gemini, groq, ollama or anthropic.` }, origin);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    send(res, error?.status === 413 ? 413 : 400, { error: error?.status === 413 ? "Request too large." : "Invalid JSON body." }, origin);
    return;
  }

  const isV2 = payload?.task === "explain-assessment" && payload?.promptVersion === "2.0";
  if (isV2) {
    const evidence = payload.evidence;
    if (!evidence || typeof evidence !== "object" || !evidence.assessment || !Array.isArray(evidence.factors)) {
      send(res, 400, { error: "Invalid evidence." }, origin);
      return;
    }
    // Server-side safety check too: urgent assessments are never explained by AI.
    if (evidence.safety?.urgent) {
      send(res, 422, { error: "AI explanation is not available while a safety warning is active." }, origin);
      return;
    }
  }

  try {
    const raw = isV2
      ? await call(SYSTEM_PROMPT_V2, userMessage(payload.evidence, true))
      : await call(SYSTEM_PROMPT_V1, userMessage(payload, false));
    const parsed = extractJson(raw);
    send(res, 200, isV2 ? shapeV2(parsed) : shapeV1(parsed), origin);
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    // Full details stay in the server log; the browser gets a short, safe message.
    console.error("[ai-proxy]", timedOut ? "provider timeout" : error instanceof Error ? error.message : error);
    send(res, timedOut ? 504 : 502, { error: clientMessage(error, timedOut) }, origin);
  }
});

function clientMessage(error, timedOut) {
  if (timedOut) return "The AI provider took too long to respond. Please try again.";
  const status = error instanceof ProviderError ? error.status : 0;
  if (status === 401 || status === 403 || status === 400) return "The AI service is not configured correctly (check the API key on the server).";
  if (status === 429 || status === 503) return "The AI provider is busy right now. Please try again in a minute.";
  if (status === 404) return "The configured AI model is not available. Check GEMINI_MODEL on the server.";
  return "The AI provider returned an error. Please try again later.";
}

server.listen(PORT, () => {
  console.log(`GlucoCare AI proxy on http://localhost:${PORT}`);
  console.log(`  provider: ${PROVIDER}`);
  console.log(`  model:    ${MODELS[PROVIDER]}`);
  console.log(`  allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
  console.log(`  frontend: set VITE_AI_FUNCTION_URL=http://localhost:${PORT}/api/explain-results`);
});
