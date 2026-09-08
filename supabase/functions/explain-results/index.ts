// GlucoCare - "explain-results" Supabase Edge Function (Stage 8)
// =============================================================
// Runs on Supabase's servers (Deno). The API key lives ONLY here, as a
// function secret - it never reaches the browser.
//
// Supports Gemini (free tier), Groq (free tier) or Anthropic (paid). Set:
//   supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY=...
//   supabase secrets set AI_PROVIDER=groq   GROQ_API_KEY=...
//   supabase secrets set AI_PROVIDER=anthropic ANTHROPIC_API_KEY=...
//
// Deploy:  supabase functions deploy explain-results --no-verify-jwt
// Then set VITE_AI_FUNCTION_URL to this function's URL in the frontend .env.
//
// SAFETY: the system prompt forbids diagnosis, medication names and dosages,
// and requires recommending professional care. A fixed disclaimer is always
// attached regardless of model output. See docs/AI-SETUP.md.

const PROVIDER = (Deno.env.get("AI_PROVIDER") ?? autoProvider()).toLowerCase();

function autoProvider(): string {
  if (Deno.env.get("GEMINI_API_KEY")) return "gemini";
  if (Deno.env.get("GROQ_API_KEY")) return "groq";
  if (Deno.env.get("ANTHROPIC_API_KEY")) return "anthropic";
  return "none";
}

const MODELS: Record<string, string> = {
  gemini: Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash",
  groq: Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile",
  anthropic: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5",
};

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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function userMessage(payload: unknown): string {
  return (
    "Explain this GlucoCare assessment summary as JSON only:\n\n" +
    JSON.stringify(payload, null, 2)
  );
}

async function callGemini(payload: unknown): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY secret is not set");
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${key}`;
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

async function callGroq(payload: unknown): Promise<string> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY secret is not set");
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

async function callAnthropic(payload: unknown): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY secret is not set");
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

const PROVIDERS: Record<string, (p: unknown) => Promise<string>> = {
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

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);

  const call = PROVIDERS[PROVIDER];
  if (!call) {
    return json(
      { error: `No AI provider configured. Set AI_PROVIDER + its key as function secrets.` },
      500,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  try {
    const raw = await call(payload);
    const parsed = extractJson(raw);
    return json({
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      termNotes: Array.isArray(parsed.termNotes) ? parsed.termNotes : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      whoToSee: typeof parsed.whoToSee === "string" ? parsed.whoToSee : "",
      disclaimer: DISCLAIMER,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 502);
  }
});
