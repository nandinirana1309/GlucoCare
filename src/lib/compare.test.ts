import { describe, it, expect } from "vitest";
import { compareAssessments, describeComparison } from "./compare";
import type { ComparableAssessment } from "./compare";
import { runAssessment } from "./assessmentEngine";
import { sanitizeAssessmentInput } from "./healthRecords";
import { emptyAssessment } from "../types/assessment";
import type { AssessmentData } from "../types/assessment";

function a(overrides: Partial<AssessmentData>, assessedOn = "2026-09-01"): ComparableAssessment {
  const data = { ...emptyAssessment, ...overrides };
  return { id: assessedOn, assessedOn, input: sanitizeAssessmentInput(data), result: runAssessment(data) };
}

const BASE: Partial<AssessmentData> = { age: "52", glucose: "132", hba1c: "5.8", height: "170", weight: "80", systolic: "128", diastolic: "82" };

describe("compareAssessments", () => {
  it("no changes", () => {
    const c = compareAssessments(a(BASE), a(BASE, "2026-10-01"));
    expect(c.scoreChange).toBe(0);
    expect(c.levelChanged).toBe(false);
    expect(c.changes).toEqual([]);
    expect(c.unchanged).toHaveLength(11);
    expect(c.safety.change).toBe("normal-both");
    expect(c.daysBetween).toBe(30);
    expect(describeComparison(c).slice(0, 2)).toEqual(["The score stayed at 6.", "The concern indicator stayed High."]);
  });

  it("score increase with points-increased factor (HbA1c 5.8 -> 6.8 = +2)", () => {
    const c = compareAssessments(a(BASE), a({ ...BASE, hba1c: "6.8" }, "2026-10-01"));
    expect(c.scoreChange).toBe(2);
    const hb = c.changes[0];
    expect(hb).toMatchObject({ id: "hba1c", status: "increased", pointChange: 2 });
    expect(hb.before).toMatchObject({ displayValue: "5.8 %", points: 1 });
    expect(hb.after).toMatchObject({ displayValue: "6.8 %", points: 3 });
    expect(describeComparison(c)).toContain("HbA1c: 5.8 % → 6.8 % (+2 points).");
  });

  it("score decrease and level change", () => {
    const before = a({ hba1c: "6.8", familyHistory: "Yes" });
    const after = a({ hba1c: "5.5", familyHistory: "Yes" }, "2026-10-01");
    const c = compareAssessments(before, after);
    expect(c.scoreChange).toBe(-3);
    expect(c.levelChanged).toBe(true);
    expect(c.previous.level).toBe("Moderate");
    expect(c.current.level).toBe("Low");
    expect(c.changes[0]).toMatchObject({ id: "hba1c", status: "removed", pointChange: -3 });
    expect(describeComparison(c)).toContain("The concern indicator changed from Moderate to Low.");
  });

  it("factor added (newly contributing) and removed (no longer contributing)", () => {
    const c = compareAssessments(
      a({ ...BASE, activityLevel: "Sedentary" }),
      a({ ...BASE, activityLevel: "Very active", smoking: "Yes" }, "2026-10-01"),
    );
    const byId = Object.fromEntries(c.changes.map((x) => [x.id, x]));
    expect(byId.smoking).toMatchObject({ status: "added", pointChange: 1, providedChange: "newly-provided" });
    expect(byId.activity).toMatchObject({ status: "removed", pointChange: -1 });
    expect(c.scoreChange).toBe(0);
  });

  it("value changed without a points change", () => {
    const c = compareAssessments(a(BASE), a({ ...BASE, glucose: "140" }, "2026-10-01"));
    expect(c.changes).toHaveLength(1);
    expect(c.changes[0]).toMatchObject({ id: "glucose", status: "value-changed", pointChange: 0 });
  });

  it("safety changes are reported with the new rules and reasons", () => {
    const became = compareAssessments(a(BASE), a({ ...BASE, warningSigns: ["Fruity-smelling breath"] }, "2026-10-01"));
    expect(became.safety).toMatchObject({ change: "became-urgent", rulesAdded: ["warning-signs"], rulesRemoved: [] });
    expect(became.safety.reasonsAdded[0]).toMatch(/serious warning signs/);
    expect(became.inputChanges.warningSignsAdded).toEqual(["Fruity-smelling breath"]);
    expect(became.scoreChange).toBe(0); // safety never adds points

    const cleared = compareAssessments(a({ glucose: "320" }), a({ glucose: "150" }, "2026-10-01"));
    expect(cleared.safety).toMatchObject({ change: "no-longer-urgent", rulesRemoved: ["glucose-very-high"] });
  });

  it("missing values: provided -> not provided is reported", () => {
    const c = compareAssessments(a(BASE), a({ ...BASE, systolic: "", diastolic: "" }, "2026-10-01"));
    const bp = c.changes.find((x) => x.id === "bloodPressure")!;
    // 128/82 is in the stage 1 band (diastolic 80-89 -> +1), so leaving it out removes that point.
    expect(bp).toMatchObject({ providedChange: "no-longer-provided", status: "removed", pointChange: -1 });
    expect(bp.after?.displayValue).toBeNull();
    expect(describeComparison(c)).toContain("Blood pressure: 128/82 mmHg → not provided (-1 point).");

    // A value that scored 0 and then went missing: points unchanged, still reported.
    const age = compareAssessments(a({ age: "30" }), a({ age: "" }, "2026-10-01")).changes[0];
    expect(age).toMatchObject({ id: "age", status: "value-changed", pointChange: 0, providedChange: "no-longer-provided" });
  });

  it("symptom names added/removed come from the stored input", () => {
    const c = compareAssessments(a({ symptoms: ["Fatigue", "Blurred vision"] }), a({ symptoms: ["Fatigue", "Excessive thirst"] }, "2026-10-01"));
    expect(c.inputChanges).toMatchObject({ symptomsAdded: ["Excessive thirst"], symptomsRemoved: ["Blurred vision"] });
  });

  it("different engine versions are flagged and the old result is NOT recalculated", () => {
    const old = a(BASE);
    old.result = { ...old.result, engineVersion: "1.0.0", factors: [], legacy: true, concernScore: 4 };
    const c = compareAssessments(old, a(BASE, "2026-10-01"));
    expect(c.engineVersionDiffers).toBe(true);
    expect(c.breakdownAvailable).toBe(false);
    expect(c.previous.score).toBe(4); // as stored, not re-scored to 6
    expect(describeComparison(c).at(-1)).toMatch(/different GlucoCare engine versions \(1\.0\.0 and 1\.1\.0\)/);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const x = a(BASE);
    const y = a({ ...BASE, hba1c: "7" }, "2026-10-01");
    const snapshot = JSON.stringify([x, y]);
    expect(compareAssessments(x, y)).toEqual(compareAssessments(x, y));
    expect(JSON.stringify([x, y])).toBe(snapshot);
  });
});
