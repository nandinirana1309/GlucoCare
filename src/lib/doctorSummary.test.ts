import { describe, it, expect } from "vitest";
import { AI_OVERVIEW_LABEL, buildDoctorSummary, summaryToText, SUMMARY_LABEL } from "./doctorSummary";
import { runAssessment } from "./assessmentEngine";
import { measurementsFromAssessment, sanitizeAssessmentInput } from "./healthRecords";
import { emptyAssessment } from "../types/assessment";
import type { AssessmentData } from "../types/assessment";
import type { HealthHistory, Measurement, StoredAssessment } from "../types/health";

function snap(id: string, date: string, o: Partial<AssessmentData>): { a: StoredAssessment; m: Measurement[] } {
  const data = { ...emptyAssessment, ...o };
  const input = sanitizeAssessmentInput(data);
  const a: StoredAssessment = { id, clientId: id, createdAt: `${date}T09:00:00Z`, assessedOn: date, engineVersion: "1.1.0", input, result: runAssessment(data) };
  const m = measurementsFromAssessment(input, date).map((x, i) => ({ ...x, id: `${id}-${i}`, recordedAt: a.createdAt, assessmentId: id }));
  return { a, m };
}

function history(...parts: { a: StoredAssessment; m: Measurement[] }[]): HealthHistory {
  return { assessments: parts.map((p) => p.a), measurements: parts.flatMap((p) => p.m), reports: [] };
}

const A1 = snap("a1", "2026-08-01", { age: "52", gender: "Female", glucose: "132", glucoseContext: "fasting", hba1c: "6.4", activityLevel: "Sedentary" });
const A2 = snap("a2", "2026-09-01", { age: "52", gender: "Female", glucose: "151", glucoseContext: "fasting", hba1c: "7.1", activityLevel: "Sedentary" });
const A3 = snap("a3", "2026-10-01", { age: "52", gender: "Female", glucose: "158", glucoseContext: "fasting", hba1c: "7.6", activityLevel: "Sedentary", symptoms: ["Fatigue"], otherConditions: "Thyroid" });
const H = history(A1, A2, A3);

const section = (s: ReturnType<typeof buildDoctorSummary>, id: string) => s.sections.find((x) => x.id === id)!;

describe("buildDoctorSummary", () => {
  const s = buildDoctorSummary(H, { generatedOn: "2026-10-06" });

  it("is labelled as a user-generated summary, not a diagnosis", () => {
    expect(s.label).toBe(SUMMARY_LABEL);
    expect(s.disclaimer).toMatch(/not a diagnosis and not a treatment recommendation/);
  });

  it("copies the latest assessment exactly as stored", () => {
    const a = section(s, "assessment").rows;
    expect(a.find((r) => r.label === "Date")?.value).toBe("01 Oct 2026");
    expect(a.find((r) => r.label.startsWith("Concern level"))?.value).toBe(A3.a.result.concernLevel);
    expect(a.find((r) => r.label === "Score")?.value).toBe(`${A3.a.result.concernScore} of 18 points`);
  });

  it("lists contributing factors with their stored values and points", () => {
    const f = section(s, "factors").rows;
    expect(f[0]).toMatchObject({ label: "HbA1c", value: "7.6 % (+3)" });
    expect(f.map((x) => x.label)).toEqual(expect.arrayContaining(["Blood glucose", "Physical activity"]));
  });

  it("measurements, trends and changes are traceable to stored data", () => {
    expect(section(s, "measurements").rows.find((r) => r.label === "HbA1c")).toMatchObject({ value: "7.6 %", note: expect.stringMatching(/^01 Oct 2026 · Entered by you/) });
    expect(section(s, "trends").rows.find((r) => r.label === "HbA1c")?.value).toMatch(/increased across your 3 measurements \(6\.4 % on 01 Aug 2026 to 7\.6 % on 01 Oct 2026\)/);
    expect(section(s, "changes").rows.some((r) => r.value === "HbA1c: 7.1 % → 7.6 % (no change in points).")).toBe(true);
  });

  it("includes user-entered information, marked as such", () => {
    expect(section(s, "patient").rows.find((r) => r.label === "Other conditions")).toMatchObject({ value: "Thyroid", note: "Free text entered by the user" });
    expect(section(s, "symptoms").rows).toEqual([{ label: "Symptom", value: "Fatigue" }]);
  });

  it("leaves the name out unless the user includes it", () => {
    expect(section(s, "patient").rows.some((r) => r.label === "Name")).toBe(false);
    const named = buildDoctorSummary(H, { generatedOn: "2026-10-06", displayName: " Asha " });
    expect(section(named, "patient").rows[0]).toEqual({ label: "Name", value: "Asha" });
  });

  it("questions are templates with the user's own values; no diagnosis or treatment advice", () => {
    expect(s.questions[0]).toBe("My recorded HbA1c was 7.6 %. What does this mean for me, and when should it be checked again?");
    expect(s.questions).toContain("My recorded blood glucose was 158 mg/dL (fasting). Would repeat or confirmatory testing be appropriate?");
    expect(s.questions.length).toBeLessThanOrEqual(7);
    for (const q of s.questions) {
      expect(q.endsWith("?")).toBe(true);
      expect(q).not.toMatch(/you have|diagnos(ed|is) with|metformin|insulin|dose|\bmg\b(?!\/)|should take|prescri/i);
    }
  });

  it("safety warning becomes the first question and is listed with its evidence", () => {
    const u = buildDoctorSummary(history(snap("u", "2026-10-01", { glucose: "320" })), { generatedOn: "2026-10-06" });
    expect(u.questions[0]).toMatch(/^GlucoCare showed a safety warning \(The blood glucose value entered is very high/);
    expect(section(u, "safety").rows[0]).toEqual({ label: "The blood glucose value entered is very high (300 mg/dL or above).", value: "Blood glucose entered: 320 mg/dL" });
    expect(section(u, "assessment").rows.find((r) => r.label.startsWith("Concern"))?.note).toMatch(/Set to High by a safety rule/);
  });

  it("empty history gives empty sections with explanations, not invented data", () => {
    const e = buildDoctorSummary({ assessments: [], measurements: [], reports: [] }, { generatedOn: "2026-10-06" });
    for (const sec of e.sections) {
      expect(sec.rows).toEqual([]);
      expect(sec.empty.length).toBeGreaterThan(0);
    }
    expect(e.questions).toEqual(["Are there any tests you would recommend based on this information?"]);
  });

  it("plain text export contains the label, every section and numbered questions", () => {
    const text = summaryToText(s);
    expect(text).toContain(SUMMARY_LABEL);
    for (const sec of s.sections) expect(text).toContain(sec.title.toUpperCase());
    expect(text).toMatch(/\n {2}1\. My recorded HbA1c/);
    expect(text).not.toContain("Asha");
  });

  it("the AI overview is only included when added, clearly labelled", () => {
    expect(summaryToText(s)).not.toContain(AI_OVERVIEW_LABEL.toUpperCase());
    const withAi = summaryToText({ ...s, aiOverview: "Your HbA1c of 7.6 % added 3 points." });
    expect(withAi).toContain(AI_OVERVIEW_LABEL.toUpperCase());
    expect(withAi).toContain("Your HbA1c of 7.6 % added 3 points.");
  });
});
