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
 */

import type { AiExplanation, AiExplanationRequest } from "../types/ai";

const FUNCTION_URL = import.meta.env.VITE_AI_FUNCTION_URL as string | undefined;

export const isAiConfigured = Boolean(FUNCTION_URL);

const BASE_DISCLAIMER =
  "This is an AI-generated educational summary, not medical advice or a diagnosis. Always confirm anything important with a qualified healthcare professional.";

export async function explainResults(
  request: AiExplanationRequest,
): Promise<AiExplanation> {
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
      headers: { "Content-Type": "application/json" },
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
