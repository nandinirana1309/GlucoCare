import { describe, it, expect } from "vitest";
import { applyScenario, explainScenario, LOCKED_FIELDS, runScenario, SCENARIO_DISCLAIMER } from "./scenarios";
import { sanitizeAssessmentInput } from "./healthRecords";
import { emptyAssessment } from "../types/assessment";
import type { AssessmentData } from "../types/assessment";
import type { AssessmentInputs } from "../types/health";

const input = (o: Partial<AssessmentData>): AssessmentInputs => sanitizeAssessmentInput({ ...emptyAssessment, ...o });

const ACTUAL = input({
  age: "52", glucose: "156", glucoseContext: "fasting", hba1c: "6.8", systolic: "134", diastolic: "86",
  height: "170", weight: "92", activityLevel: "Sedentary", smoking: "Yes", dietPattern: "Often high in sugary food or drinks",
  symptoms: ["Fatigue"], familyHistory: "Yes",
});

function deepFreeze<T>(o: T): T {
  Object.freeze(o);
  for (const v of Object.values(o as object)) if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
  return o;
}

const PREDICTION = /your (blood )?(glucose|sugar|hba1c|a1c|blood pressure|bp) (will|would) (be|become|drop|fall|rise|go)|will (drop|fall|improve|reduce|lower|cure|prevent)|you will (be|become|develop|not)|guarantee/i;

describe("applyScenario", () => {
  it("never mutates the actual input and never changes locked fields", () => {
    const frozen = deepFreeze(structuredClone(ACTUAL));
    const s = applyScenario(frozen, { activityLevel: "Very active", dietPattern: "Generally balanced", smoking: "No", weight: "80" });
    expect(frozen).toEqual(ACTUAL);
    for (const f of LOCKED_FIELDS) expect(s[f]).toEqual(ACTUAL[f]);
    expect(s).toMatchObject({ activityLevel: "Very active", dietPattern: "Generally balanced", smoking: "No", weight: "80" });
  });
});

describe("runScenario", () => {
  it("more activity: the activity factor no longer adds its point; measurements untouched", () => {
    const r = runScenario(ACTUAL, { activityLevel: "Moderately active" });
    expect(r.comparison.scoreChange).toBe(-1);
    expect(r.comparison.changes.map((c) => c.id)).toEqual(["activity"]);
    expect(r.explanation[0]).toBe("In this scenario, Physical activity would no longer add 1 point to the indicator.");
    for (const id of ["glucose", "hba1c", "bloodPressure"] as const) {
      expect(r.hypothetical.factors.find((f) => f.id === id)).toEqual(r.baseline.factors.find((f) => f.id === id));
    }
  });

  it("weight scenario changes only BMI (glucose, HbA1c, BP stay as recorded)", () => {
    const r = runScenario(ACTUAL, { weight: "70" }); // BMI 31.8 -> 24.2
    expect(r.changes).toEqual([{ field: "weight", label: "Weight (hypothetical)", actual: "92 kg", scenario: "70 kg" }]);
    expect(r.comparison.changes.map((c) => [c.id, c.pointChange])).toEqual([["bmi", -2]]);
  });

  it("combined lifestyle scenario can change the level, described as the indicator only", () => {
    const r = runScenario(ACTUAL, { activityLevel: "Very active", dietPattern: "Generally balanced", smoking: "No", weight: "70" });
    expect(r.comparison.scoreChange).toBe(-5);
    expect(r.explanation.at(-1)).toMatch(/^The educational indicator would (be|stay) /);
  });

  it("monitoring / no changes: nothing changes and it says so", () => {
    const r = runScenario(ACTUAL, {});
    expect(r.comparison.scoreChange).toBe(0);
    expect(r.explanation).toEqual(["No answers have been changed yet - this is your profile as recorded."]);
  });

  it("invalid hypothetical weight is rejected, not used", () => {
    expect(runScenario(ACTUAL, { weight: "4000" }).error).toMatch(/between 10 and 400/);
    expect(runScenario(ACTUAL, { weight: "4000" }).comparison.scoreChange).toBe(0);
    expect(runScenario(input({ weight: "80" }), { weight: "70" }).error).toMatch(/height is needed/);
  });

  it("safety status cannot be changed by a scenario", () => {
    const urgent = input({ glucose: "320", activityLevel: "Sedentary" });
    const r = runScenario(urgent, { activityLevel: "Very active" });
    expect(r.hypothetical.safety).toEqual(r.baseline.safety);
    expect(r.hypothetical.concernLevel).toBe("High");
  });

  it("is deterministic", () => {
    expect(runScenario(ACTUAL, { smoking: "No" }).hypothetical.concernScore).toBe(runScenario(ACTUAL, { smoking: "No" }).hypothetical.concernScore);
  });

  it("never generates prediction language or future measurement values", () => {
    const choices = [
      { activityLevel: "Very active" as const },
      { dietPattern: "Generally balanced" as const },
      { smoking: "No" as const },
      { weight: "70" },
      { weight: "110" },
      {},
    ];
    for (const c of choices) {
      const r = runScenario(ACTUAL, c);
      for (const line of r.explanation) {
        expect(line, line).not.toMatch(PREDICTION);
        expect(line, line).not.toMatch(/mg\/dL|%|mmHg/);
      }
    }
    expect(SCENARIO_DISCLAIMER).toMatch(/does not predict your actual future health outcome/);
  });

  it("explainScenario never mentions measurements as changing", () => {
    const r = runScenario(ACTUAL, { weight: "110" });
    expect(r.explanation.join(" ")).not.toMatch(/glucose|HbA1c|blood pressure/i);
    expect(explainScenario(r.comparison, 1).length).toBeGreaterThan(0);
  });
});
