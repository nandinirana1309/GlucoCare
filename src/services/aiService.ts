/**
 * GlucoCare - AI-assisted explanation service (Stage 8)
 * -------------------------------------------------------------
 * The AI feature EXPLAINS an already-computed result in plain language. It
 * never diagnoses, never prescribes, never gives dosages.
 *
 * How it is wired:
 *   - The API key lives ONLY on a server, never in the browser. Two options,
 *     same request/response shape:
 *       local dev  -> `npm run server` (server/ai-proxy.mjs)
 *       deployed   -> Supabase Edge Function (supabase/functions/explain-results/)
 *   - The frontend calls whichever URL is in `.env` as VITE_AI_FUNCTION_URL.
 *     If it is not set, this returns status "not-configured" and the UI shows
 *     an honest "not connected" note.
 *   - Only NON-IDENTIFYING fields are sent (no name, no locality, no report).
 *   - Never called when result.safety.aiAllowed is false (safety gate).
 */

import type { AiEvidence, AiExplanation, AiExplanationRequest, AiExplanationV2 } from "../types/ai";
import type { SafetyStatus } from "../types/safety";
import { validateAiResponse } from "../lib/aiGuard";
import { supabase } from "./supabaseClient";

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

/**
 * Picks the AI endpoint. A localhost URL (the dev proxy) is unreachable from a
 * deployed site, so when the page itself is NOT on localhost and Supabase is
 * configured, the deployed Edge Function is used instead. This keeps a
 * hosting setup that copied the local .env working.
 */
export function resolveAiUrl(
  configured: string | undefined,
  supabaseUrl: string | undefined,
  pageHost: string | undefined,
): string | undefined {
  const edge = supabaseUrl ? `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/explain-results` : undefined;
  if (!configured) return undefined;
  let host: string;
  try {
    host = new URL(configured).hostname;
  } catch {
    return configured;
  }
  const pageIsLocal = pageHost === undefined || LOCAL_HOST.test(pageHost);
  return LOCAL_HOST.test(host) && !pageIsLocal && edge ? edge : configured;
}

const FUNCTION_URL = resolveAiUrl(
  import.meta.env.VITE_AI_FUNCTION_URL as string | undefined,
  import.meta.env.VITE_SUPABASE_URL as string | undefined,
  typeof window === "undefined" ? undefined : window.location.hostname,
);

export const isAiConfigured = Boolean(FUNCTION_URL);

const BASE_DISCLAIMER =
  "This is an AI-generated educational summary, not medical advice or a diagnosis. Always confirm anything important with a qualified healthcare professional.";

export async function explainResults(
  request: AiExplanationRequest,
): Promise<AiExplanation> {
  // SAFETY GATE - checked before anything else. When the assessment's safety
  // status is urgent, nothing is sent to the AI and no generated text can
  // appear next to (or contradict) the emergency warning. The Results page
  // also hides the button; this is the second line of defence.
  if (!request.result.safety.aiAllowed) {
    return {
      status: "blocked-by-safety",
      summary: "",
      termNotes: [],
      suggestions: [],
      whoToSee: "",
      disclaimer: BASE_DISCLAIMER,
    };
  }

  if (!FUNCTION_URL) {
    return {
      status: "not-configured",
      summary: "",
      termNotes: [],
      suggestions: [],
      whoToSee: "",
      disclaimer: BASE_DISCLAIMER,
    };
  }

  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({
        concernLevel: request.result.concernLevel,
        indicators: request.result.indicators.map((i) => ({
          label: i.label,
          value: i.value,
          unit: i.unit,
          statusText: i.statusText,
        })),
        riskFactors: request.result.riskFactors.map((r) => r.label),
        redFlags: request.result.redFlags.map((r) => r.reason),
        context: request.context,
      }),
    });

    if (!response.ok) {
      let detail = `Server responded with ${response.status}`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) detail = body.error;
      } catch {
        // keep the generic message
      }
      return errorResult(detail);
    }

    const payload = (await response.json()) as Partial<AiExplanation>;
    return {
      status: "ok",
      summary: payload.summary ?? "",
      termNotes: payload.termNotes ?? [],
      suggestions: payload.suggestions ?? [],
      whoToSee: payload.whoToSee ?? "",
      disclaimer: payload.disclaimer ?? BASE_DISCLAIMER,
    };
  } catch {
    return errorResult(
      "Could not reach the AI service. If you are running it locally, make sure 'npm run server' is running.",
    );
  }
}

function errorResult(message: string): AiExplanation {
  return {
    status: "error",
    summary: "",
    termNotes: [],
    suggestions: [],
    whoToSee: "",
    disclaimer: BASE_DISCLAIMER,
    errorMessage: message,
  };
}

/* ================================================================== */
/*  AI v2 - evidence-based explanation (Project-II, Phase 9)           */
/* ================================================================== */
/*
 * The AI receives ONLY structured evidence (lib/aiEvidence.ts) and its reply
 * is ALWAYS validated by lib/aiGuard.ts before anything is shown. The
 * deterministic result (score, level, factors, safety) is never changed by
 * the AI - it is only explained.
 */

const AI_TIMEOUT_MS = 30_000;

let signInPromise: Promise<string | undefined> | null = null;

async function authHeader(): Promise<Record<string, string>> {
  // When deployed as a Supabase Edge Function, the function verifies this
  // (anonymous or signed-in) user token - so a visitor without a session yet
  // gets one anonymous sign-in (shared by concurrent calls). The local proxy
  // ignores the header.
  const client = supabase;
  if (!client) return {};
  try {
    const { data } = await client.auth.getSession();
    let token = data.session?.access_token;
    if (!token) {
      signInPromise ??= client.auth
        .signInAnonymously()
        .then(({ data: d }) => d.session?.access_token)
        .finally(() => (signInPromise = null));
      token = await signInPromise;
    }
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

const v2 = (status: AiExplanationV2["status"], extra: Partial<AiExplanationV2> = {}): AiExplanationV2 => ({
  status,
  content: null,
  issues: [],
  disclaimer: BASE_DISCLAIMER,
  ...extra,
});

export async function explainWithEvidence(
  evidence: AiEvidence,
  safety: SafetyStatus,
): Promise<AiExplanationV2> {
  // 1. SAFETY GATE - deterministic, before any network call.
  if (!safety.aiAllowed || evidence.safety.urgent) return v2("blocked-by-safety");
  // 2. Not configured -> honest "not connected" state.
  if (!FUNCTION_URL) return v2("not-configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ task: evidence.task, promptVersion: evidence.promptVersion, evidence }),
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = `Server responded with ${response.status}`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) detail = body.error;
      } catch {
        // keep the generic message
      }
      return v2("error", { errorMessage: detail });
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return v2("blocked", { issues: [{ field: "*", rule: "invalid-shape", text: "not JSON" }] });
    }
    // 3. GUARD - every reply is validated against the evidence.
    const guarded = validateAiResponse(payload, evidence);
    return v2(guarded.status, { content: guarded.content, issues: guarded.issues });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return v2("error", {
      errorMessage: aborted
        ? "The AI service took too long to respond."
        : "Could not reach the AI service. If you are running it locally, make sure 'npm run server' is running.",
    });
  } finally {
    clearTimeout(timer);
  }
}
