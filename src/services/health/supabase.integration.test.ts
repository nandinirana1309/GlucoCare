/**
 * REAL Supabase integration test (opt-in: npm run test:supabase).
 *
 * Uses the app's own SupabaseRepository against the project in .env with
 * two separate anonymous users, and checks persistence, idempotency and that
 * Row Level Security keeps each user's health data private.
 * All rows created here are deleted at the end (delete_my_data). The two
 * anonymous auth users themselves remain (deleting auth users needs the
 * service-role key, which is never used by the app or its tests).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseRepository } from "./supabaseRepository";
import { runAssessment } from "../../lib/assessmentEngine";
import { newId, sanitizeAssessmentInput } from "../../lib/healthRecords";
import { emptyAssessment } from "../../types/assessment";
import type { AssessmentData } from "../../types/assessment";
import type { NewAssessment, NewReport } from "../../types/health";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const client = (name: string): SupabaseClient =>
  createClient(url, key, {
    auth: { storage: memoryStorage(), storageKey: `glucocare-it-${name}`, persistSession: true, autoRefreshToken: false },
  });

function assessment(o: Partial<AssessmentData>, assessedOn = "2026-09-01"): NewAssessment {
  const data = { ...emptyAssessment, ...o };
  return { clientId: newId(), assessedOn, input: sanitizeAssessmentInput(data), result: runAssessment(data) };
}

const DATA: Partial<AssessmentData> = {
  name: "Integration Test Name",
  locality: "Integration Town",
  age: "52",
  glucose: "156",
  glucoseContext: "fasting",
  hba1c: "6.8",
  height: "170",
  weight: "78.3",
  systolic: "134",
  diastolic: "86",
};

describe.skipIf(!url || !key)("Supabase (real project) - repository + RLS", () => {
  const clientA = client("a");
  const clientB = client("b");
  const repoA = new SupabaseRepository(clientA);
  const repoB = new SupabaseRepository(clientB);
  let userA = "";
  let userB = "";

  beforeAll(async () => {
    // Browsing creates no user: without a session, history is simply empty.
    expect(await repoA.loadHistory()).toEqual({ assessments: [], measurements: [], reports: [] });
    // Sign in each test user anonymously (the app does this on the first save).
    for (const c of [clientA, clientB]) {
      const { error } = await c.auth.signInAnonymously();
      if (error) throw new Error(`Anonymous sign-in failed (${error.status}): ${error.message}`);
    }
    userA = (await clientA.auth.getUser()).data.user!.id;
    userB = (await clientB.auth.getUser()).data.user!.id;
    // start clean (in case an earlier run was interrupted)
    await repoA.deleteMyData();
    await repoB.deleteMyData();
  });

  afterAll(async () => {
    await repoA.deleteMyData().catch(() => {});
    await repoB.deleteMyData().catch(() => {});
  });

  it("anonymous sign-in gives two distinct real user ids", async () => {
    expect(userA).toMatch(/^[0-9a-f-]{36}$/);
    expect(userB).toMatch(/^[0-9a-f-]{36}$/);
    expect(userA).not.toBe(userB);
    const { data } = await clientA.auth.getUser();
    expect(data.user?.is_anonymous).toBe(true);
  });

  it("saves an assessment snapshot with its frozen result and measurements, and reads it back", async () => {
    const a = assessment(DATA);
    const saved = await repoA.saveAssessment(a);
    expect(saved.clientId).toBe(a.clientId);
    expect(saved.result.concernScore).toBe(a.result.concernScore);
    expect(saved.result.factors).toEqual(a.result.factors);
    expect(saved.result.safety).toEqual(a.result.safety);
    expect(saved.engineVersion).toBe("1.1.0");

    const h = await repoA.loadHistory();
    expect(h.assessments).toHaveLength(1);
    expect(h.measurements.map((m) => m.kind).sort()).toEqual(["bmi", "diastolic", "glucose", "hba1c", "height", "systolic", "weight"]);
    expect(h.measurements.find((m) => m.kind === "glucose")).toMatchObject({ value: 156, glucoseContext: "fasting", verification: "manual" });
    expect(h.measurements.find((m) => m.kind === "bmi")?.verification).toBe("calculated");
  });

  it("stores no name, locality or report filename", async () => {
    const { data } = await clientA.from("assessment_snapshots").select("input");
    const text = JSON.stringify(data);
    expect(text).not.toContain("Integration Test Name");
    expect(text).not.toContain("Integration Town");
  });

  it("is idempotent: saving the same clientId again creates no duplicate", async () => {
    const a = assessment({ glucose: "120" }, "2026-09-10");
    const first = await repoA.saveAssessment(a);
    const again = await repoA.saveAssessment(a);
    expect(again.id).toBe(first.id);
    const h = await repoA.loadHistory();
    expect(h.assessments.filter((x) => x.clientId === a.clientId)).toHaveLength(1);
    expect(h.measurements.filter((m) => m.assessmentId === first.id)).toHaveLength(1);
  });

  it("RLS: user B sees none of user A's rows", async () => {
    const hB = await repoB.loadHistory();
    expect(hB).toEqual({ assessments: [], measurements: [], reports: [] });
    for (const table of ["assessment_snapshots", "assessment_results", "measurements", "medical_reports", "extracted_values"]) {
      const { data, error } = await clientB.from(table).select("*").eq("user_id", userA);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
  });

  it("RLS: user B cannot delete, update or attach rows to user A's records", async () => {
    const [aSnap] = (await repoA.loadHistory()).assessments;

    const del = await clientB.from("assessment_snapshots").delete().eq("id", aSnap.id).select();
    expect(del.data ?? []).toEqual([]);
    expect((await repoA.loadHistory()).assessments.some((s) => s.id === aSnap.id)).toBe(true);

    const upd = await clientA.from("assessment_snapshots").update({ assessed_on: "2020-01-01" }).eq("id", aSnap.id).select();
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true); // history is immutable

    const attach = await clientB.from("measurements").insert({
      user_id: userB, assessment_id: aSnap.id, kind: "glucose", value: 100, unit: "mg/dL",
      measured_on: "2026-09-01", source: "assessment", verification: "manual",
    });
    expect(attach.error).not.toBeNull();

    const spoof = await clientB.from("assessment_snapshots").insert({
      user_id: userA, client_id: newId(), assessed_on: "2026-09-01", engine_version: "1.1.0", input: {},
    });
    expect(spoof.error).not.toBeNull();
  });

  it("the database rejects an input containing a name (defence in depth)", async () => {
    const { error } = await clientA.rpc("save_assessment", {
      p: { client_id: newId(), assessed_on: "2026-09-01", engine_version: "1.1.0", input: { name: "x" }, result: assessment({}).result, measurements: [] },
    });
    expect(error).not.toBeNull();
  });

  it("an unauthenticated (signed-out) client cannot read health data", async () => {
    const anonOnly = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await anonOnly.from("measurements").select("*");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it("saves a reviewed report: only confirmed/edited/added values become measurements", async () => {
    const report: NewReport = {
      clientId: newId(), label: "Integration lab report", reportDate: "2026-08-15", fileType: "pdf", pageCount: 1,
      extractionMethod: "pdf_text", parserVersion: "1.0.0",
      values: [
        { kind: "hba1c", extractedValue: 7.1, finalValue: 7.1, confidence: "high", status: "confirmed", matchedLabel: "HbA1c" },
        { kind: "glucose", extractedValue: 162, finalValue: 152, confidence: "medium", status: "edited", glucoseContext: "fasting" },
        { kind: "weight", extractedValue: 801, finalValue: 801, confidence: "low", status: "rejected" },
      ],
    };
    const saved = await repoA.saveReport(report);
    expect(saved.values).toHaveLength(3);
    const rejected = saved.values.find((v) => v.status === "rejected")!;
    expect(rejected.extractedValue).toBeNull();
    const h = await repoA.loadHistory();
    const fromReport = h.measurements.filter((m) => m.reportId === saved.id);
    expect(fromReport.map((m) => [m.kind, m.value, m.verification]).sort()).toEqual([
      ["glucose", 152, "report_edited"],
      ["hba1c", 7.1, "report_confirmed"],
    ]);
    expect((await repoA.saveReport(report)).id).toBe(saved.id); // idempotent
    expect((await repoB.loadHistory()).reports).toEqual([]);
    await repoA.deleteReport(saved.id);
    expect((await repoA.loadHistory()).measurements.some((m) => m.reportId === saved.id)).toBe(false);
  });

  it("deleteAssessment removes it and its measurements", async () => {
    const h = await repoA.loadHistory();
    const target = h.assessments[0];
    await repoA.deleteAssessment(target.id);
    const after = await repoA.loadHistory();
    expect(after.assessments.some((s) => s.id === target.id)).toBe(false);
    expect(after.measurements.some((m) => m.assessmentId === target.id)).toBe(false);
  });

  it("deleteMyData removes only the caller's data", async () => {
    await repoB.saveAssessment(assessment({ glucose: "110" }));
    await repoA.saveAssessment(assessment({ glucose: "130" }));
    await repoA.deleteMyData();
    expect(await repoA.loadHistory()).toEqual({ assessments: [], measurements: [], reports: [] });
    expect((await repoB.loadHistory()).assessments).toHaveLength(1);
  });
});
