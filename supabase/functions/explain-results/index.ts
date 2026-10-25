// GlucoCare - "explain-results" Supabase Edge Function (Stage 8, hardened in Phase 9)
// =============================================================
// Runs on Supabase's servers (Deno). The API key lives ONLY here, as a
// function secret - it never reaches the browser.
//
// Supports Gemini (free tier), Groq (free tier) or Anthropic (paid). Set:
//   supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY=...
//   supabase secrets set AI_ALLOWED_ORIGINS=https://your-site.example
//
// Deploy WITH JWT verification (the default) so only signed-in / anonymous
// GlucoCare users can call it - the frontend sends the user's token:
//   supabase functions deploy explain-results
// Then set VITE_AI_FUNCTION_URL to this function's URL in the frontend .env.
//
// Request formats:
//   v2: { task: "explain-assessment", promptVersion: "2.0", evidence }  (Project-II)
//   v1: { concernLevel, indicators, riskFactors, redFlags, context }     (legacy)
//
// SAFETY: the prompts forbid diagnosis, medicines, doses, predictions and
// false reassurance; urgent assessments are refused; the browser validates
// every v2 reply against the evidence (src/lib/aiGuard.ts). A fixed
// disclaimer is always attached. See docs/AI-SETUP.md.

const PROVIDER = (Deno.env.get("AI_PROVIDER") ?? autoProvider()).toLowerCase();
const MAX_BODY_BYTES = 32 * 1024;
const PROVIDER_TIMEOUT_MS = 25_000;
const ALLOWED_ORIGINS = (Deno.env.get("AI_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function autoProvider(): string {
  if (Deno.env.get("GEMINI_API_KEY")) return "gemini";
  if (Deno.env.get("GROQ_API_KEY")) return "groq";
  if (Deno.env.get("ANTHROPIC_API_KEY")) return "anthropic";
  return "none";
}

const MODELS: Record<string, string> = {
  gemini: Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash",
  groq: Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile",
  anthropic: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5",
};

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

function cors(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const timeout = () => AbortSignal.timeout(PROVIDER_TIMEOUT_MS);

/** An error from the AI provider, with its HTTP status (details stay in the function log). */
class ProviderError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Primary model first; on retired / overloaded / rate limited, try the fallbacks. */
const GEMINI_FALLBACKS = (Deno.env.get("GEMINI_FALLBACK_MODELS") ?? "gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-flash-latest")
  .split(",")
  .map((s) => s.trim())
  .filter((m) => m && m !== MODELS.gemini);
const RETRYABLE = new Set([404, 429, 500, 503]);

/** Longest a single model attempt may take, so a hung model cannot use up the whole budget. */
const PER_MODEL_TIMEOUT_MS = Number(Deno.env.get("GEMINI_PER_MODEL_TIMEOUT_MS") ?? 12_000);

async function callGemini(system: string, user: string): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new ProviderError(500, "GEMINI_API_KEY secret is not set");
  const deadline = Date.now() + PROVIDER_TIMEOUT_MS;
  let lastError: Error | undefined;
  for (const model of [MODELS.gemini, ...GEMINI_FALLBACKS]) {
    const remaining = deadline - Date.now();
    if (remaining < 1500) break;
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        // API key in a header (not the URL) so it can never appear in URLs or logs.
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        signal: AbortSignal.timeout(Math.min(PER_MODEL_TIMEOUT_MS, remaining)),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 4096 },
        }),
      });
    } catch (error) {
      // A model that hangs is treated like a busy one: try the next model.
      if (!(error instanceof DOMException) || (error.name !== "TimeoutError" && error.name !== "AbortError")) throw error;
      lastError = error;
      continue;
    }
    if (res.ok) {
      const body = await res.json();
      const parts: { text?: string; thought?: boolean }[] = body?.candidates?.[0]?.content?.parts ?? [];
      return parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("") || "{}";
    }
    lastError = new ProviderError(res.status, `Gemini model ${model} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    if (!RETRYABLE.has(res.status)) break;
  }
  throw lastError ?? new DOMException("AI provider time budget used up", "TimeoutError");
}

async function callGroq(system: string, user: string): Promise<string> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY secret is not set");
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

async function callAnthropic(system: string, user: string): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY secret is not set");
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

const PROVIDERS: Record<string, (system: string, user: string) => Promise<string>> = {
  gemini: callGemini,
  groq: callGroq,
  anthropic: callAnthropic,
};

function extractJson(text: string): Record<string, unknown> {
  const cleaned = String(text).replace(/```json\s*|\s*```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch { /* ignore */ }
    }
    return { summary: cleaned };
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const arr = (v: unknown, n: number): unknown[] => (Array.isArray(v) ? v.slice(0, n) : []);
type Obj = Record<string, unknown>;

function shapeV1(p: Obj) {
  return {
    summary: str(p.summary, 1200),
    termNotes: arr(p.termNotes, 8),
    suggestions: arr(p.suggestions, 8),
    whoToSee: str(p.whoToSee, 300),
    disclaimer: DISCLAIMER,
  };
}

/** Shape only - CONTENT is validated in the browser by src/lib/aiGuard.ts. */
function shapeV2(p: Obj) {
  return {
    summary: str(p.summary, 1200),
    factorExplanations: arr(p.factorExplanations, 11)
      .filter((f): f is Obj => Boolean(f) && typeof f === "object")
      .map((f) => ({ factorId: str(f.factorId, 40), text: str(f.text, 600) })),
    changeExplanation: typeof p.changeExplanation === "string" ? p.changeExplanation.slice(0, 600) : null,
    generalTips: arr(p.generalTips, 6).map((t) => str(t, 600)),
    questionsForClinician: arr(p.questionsForClinician, 6).map((t) => str(t, 600)),
    terms: arr(p.terms, 6)
      .filter((t): t is Obj => Boolean(t) && typeof t === "object")
      .map((t) => ({ term: str(t.term, 80), meaning: str(t.meaning, 600) })),
  };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...cors(origin) } });

  if (origin && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: "Origin not allowed" }, 403);
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);

  const call = PROVIDERS[PROVIDER];
  if (!call) {
    return json({ error: `No AI provider configured. Set AI_PROVIDER + its key as function secrets.` }, 500);
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json({ error: "Request too large." }, 413);

  let payload: Obj;
  try {
    payload = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const isV2 = payload?.task === "explain-assessment" && payload?.promptVersion === "2.0";
  if (isV2) {
    const evidence = payload.evidence as Obj | undefined;
    if (!evidence || typeof evidence !== "object" || !evidence.assessment || !Array.isArray(evidence.factors)) {
      return json({ error: "Invalid evidence." }, 400);
    }
    if ((evidence.safety as Obj | undefined)?.urgent) {
      return json({ error: "AI explanation is not available while a safety warning is active." }, 422);
    }
  }

  try {
    const raw = isV2
      ? await call(SYSTEM_PROMPT_V2, "Explain this GlucoCare evidence as JSON only:\n\n" + JSON.stringify(payload.evidence, null, 2))
      : await call(SYSTEM_PROMPT_V1, "Explain this GlucoCare assessment summary as JSON only:\n\n" + JSON.stringify(payload, null, 2));
    const parsed = extractJson(raw);
    return json(isV2 ? shapeV2(parsed) : shapeV1(parsed));
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    // Details stay in the function log; the browser gets a short, safe message.
    console.error("explain-results:", timedOut ? "provider timeout" : error instanceof Error ? error.message : error);
    const status = error instanceof ProviderError ? error.status : 0;
    const message = timedOut
      ? "The AI provider took too long to respond. Please try again."
      : status === 401 || status === 403 || status === 400
        ? "The AI service is not configured correctly."
        : status === 429 || status === 503
          ? "The AI provider is busy right now. Please try again in a minute."
          : status === 404
            ? "The configured AI model is not available."
            : "The AI provider returned an error. Please try again later.";
    return json({ error: message }, timedOut ? 504 : 502);
  }
});
