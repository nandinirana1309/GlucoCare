import { describe, it, expect, vi, afterEach } from "vitest";
import { runAssessment } from "../lib/assessmentEngine";
import { buildAiEvidence } from "../lib/aiEvidence";
import { sanitizeAssessmentInput } from "../lib/healthRecords";
import { emptyAssessment } from "../types/assessment";
import type { AssessmentData } from "../types/assessment";

function setup(overrides: Partial<AssessmentData>) {
  const data = { ...emptyAssessment, ...overrides };
  const result = runAssessment(data);
  return { result, evidence: buildAiEvidence({ input: sanitizeAssessmentInput(data), result }) };
}

/** Loads aiService with the AI URL configured (module reads env at import). */
async function configured() {
  vi.resetModules();
  vi.stubEnv("VITE_AI_FUNCTION_URL", "http://ai.test/api/explain-results");
  return import("./aiService");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("explainWithEvidence (AI v2)", () => {
  it("urgent safety: blocked before any request, even when configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { explainWithEvidence } = await configured();
    const { result, evidence } = setup({ glucose: "320" });
    const out = await explainWithEvidence(evidence, result.safety);
    expect(out.status).toBe("blocked-by-safety");
    expect(out.content).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("not configured: honest not-configured status, no request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.resetModules();
    vi.stubEnv("VITE_AI_FUNCTION_URL", "");
    const { explainWithEvidence } = await import("./aiService");
    const { result, evidence } = setup({ glucose: "130" });
    expect((await explainWithEvidence(evidence, result.safety)).status).toBe("not-configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends only the evidence, and the reply goes through the guard", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ summary: "Your score is 1. You have diabetes. Please talk to a healthcare professional." }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const { explainWithEvidence } = await configured();
    const { result, evidence } = setup({ name: "Asha", locality: "Vellore", glucose: "130", age: "50" });
    const out = await explainWithEvidence(evidence, result.safety);

    const body = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(Object.keys(body).sort()).toEqual(["evidence", "promptVersion", "task"]);
    expect(JSON.stringify(body)).not.toMatch(/Asha|Vellore/);

    // two of three sentences are invalid -> blocked, nothing shown
    expect(out.status).toBe("blocked");
    expect(out.content).toBeNull();
    expect(out.issues.map((i) => i.rule)).toEqual(expect.arrayContaining(["wrong-score", "diagnosis"]));
  });

  it("server error and network failure are reported as errors", async () => {
    const { explainWithEvidence } = await configured();
    const { result, evidence } = setup({ glucose: "130" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "rate limited" }), { status: 429 })));
    expect(await explainWithEvidence(evidence, result.safety)).toMatchObject({ status: "error", errorMessage: "rate limited" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect((await explainWithEvidence(evidence, result.safety)).status).toBe("error");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oops</html>", { status: 200 })));
    expect((await explainWithEvidence(evidence, result.safety)).status).toBe("blocked");
  });
});

describe("resolveAiUrl", () => {
  const LOCAL = "http://localhost:8787/api/explain-results";
  const SB = "https://abc.supabase.co";
  const EDGE = "https://abc.supabase.co/functions/v1/explain-results";

  it("deployed site with a localhost AI URL uses the Supabase Edge Function", async () => {
    const { resolveAiUrl } = await import("./aiService");
    expect(resolveAiUrl(LOCAL, SB, "gluco-care-nu.vercel.app")).toBe(EDGE);
    expect(resolveAiUrl(LOCAL, `${SB}/`, "example.com")).toBe(EDGE);
  });

  it("keeps the localhost proxy during local development", async () => {
    const { resolveAiUrl } = await import("./aiService");
    expect(resolveAiUrl(LOCAL, SB, "localhost")).toBe(LOCAL);
    expect(resolveAiUrl(LOCAL, SB, "127.0.0.1")).toBe(LOCAL);
    expect(resolveAiUrl(LOCAL, SB, undefined)).toBe(LOCAL);
  });

  it("keeps an explicit non-local URL, and stays unconfigured when nothing is set", async () => {
    const { resolveAiUrl } = await import("./aiService");
    expect(resolveAiUrl(EDGE, SB, "example.com")).toBe(EDGE);
    expect(resolveAiUrl(LOCAL, undefined, "example.com")).toBe(LOCAL);
    expect(resolveAiUrl(undefined, SB, "example.com")).toBeUndefined();
  });
});
