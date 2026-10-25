/**
 * Explainable score (engine 1.1.0) - the factor breakdown.
 * Score/level behaviour itself is locked in scoreLock.test.ts.
 */

import { describe, it, expect } from "vitest";
import { runAssessment, ENGINE_VERSION } from "./assessmentEngine";
import { emptyAssessment } from "../types/assessment";
import type { AssessmentData } from "../types/assessment";
import type { FactorId, ScoreFactor } from "../types/results";

function make(overrides: Partial<AssessmentData>): AssessmentData {
  return { ...emptyAssessment, ...overrides };
}

function factor(data: AssessmentData, id: FactorId): ScoreFactor {
  const found = runAssessment(data).factors.find((f) => f.id === id);
  if (!found) throw new Error(`factor ${id} missing`);
  return found;
}

const ALL_IDS: FactorId[] = [
  "glucose",
  "hba1c",
  "bloodPressure",
  "bmi",
  "symptoms",
  "familyHistory",
  "diabetesStatus",
  "age",
  "activity",
  "smoking",
  "diet",
];

const FULL: AssessmentData = make({
  age: "52",
  diabetesStatus: "Yes",
  familyHistory: "Yes",
  glucose: "156",
  hba1c: "6.8",
  height: "170",
  weight: "78.3", // BMI 27.1
  systolic: "134",
  diastolic: "86",
  symptoms: ["Fatigue", "Blurred vision", "Excessive thirst"],
  activityLevel: "Sedentary",
  smoking: "Former smoker",
  dietPattern: "Generally balanced",
});

describe("factor breakdown shape", () => {
  it("reports engine version 1.1.0", () => {
    expect(runAssessment(FULL).engineVersion).toBe(ENGINE_VERSION);
    expect(ENGINE_VERSION).toBe("1.1.0");
  });

  it("always returns exactly one factor per scoring rule, in a stable order", () => {
    for (const data of [emptyAssessment, FULL]) {
      expect(runAssessment(data).factors.map((f) => f.id)).toEqual(ALL_IDS);
    }
  });

  it("maxScore is 18 and equals the sum of maxPoints", () => {
    const result = runAssessment(FULL);
    expect(result.maxScore).toBe(18);
    expect(result.factors.reduce((s, f) => s + f.maxPoints, 0)).toBe(18);
  });

  it("points never exceed maxPoints and severity is 'none' exactly when points are 0", () => {
    for (const f of runAssessment(FULL).factors) {
      expect(f.points).toBeGreaterThanOrEqual(0);
      expect(f.points).toBeLessThanOrEqual(f.maxPoints);
      expect(f.severity === "none").toBe(f.points === 0);
      expect(f.reason.length).toBeGreaterThan(0);
      expect(f.ruleId.startsWith(`${f.id}.`) || f.ruleId.startsWith("bp.")).toBe(true);
    }
  });
});

describe("concernScore === sum(factors.points)", () => {
  const samples: Partial<AssessmentData>[] = [
    {},
    { glucose: "99" },
    { glucose: "250", hba1c: "9", systolic: "150", diastolic: "95" },
    { height: "160", weight: "82", symptoms: ["a", "b", "c", "d", "e"] },
    { warningSigns: ["Fruity-smelling breath"], familyHistory: "Yes" },
  ];

  it("holds for representative inputs", () => {
    for (const input of [...samples.map(make), FULL]) {
      const result = runAssessment(input);
      expect(result.concernScore).toBe(result.factors.reduce((s, f) => s + f.points, 0));
    }
  });

  it("the worked example: HbA1c 6.8 (+3), glucose 156 (+2), BMI 27.1 (+1)", () => {
    expect(factor(FULL, "hba1c")).toMatchObject({ displayValue: "6.8 %", points: 3, ruleId: "hba1c.gte-6.5", severity: "high" });
    expect(factor(FULL, "glucose")).toMatchObject({ displayValue: "156 mg/dL", points: 2, ruleId: "glucose.126-199" });
    expect(factor(FULL, "bmi")).toMatchObject({ displayValue: "27.1", points: 1, ruleId: "bmi.25-29.9" });
    expect(factor(FULL, "bloodPressure")).toMatchObject({ displayValue: "134/86 mmHg", points: 1, ruleId: "bp.stage1" });
    // 3 + 2 + 1 + 1 (BP) + 1 (3 symptoms) + 1 (family) + 1 (diabetes) + 1 (age) + 1 (sedentary) = 12
    expect(runAssessment(FULL).concernScore).toBe(12);
  });
});

describe("missing inputs", () => {
  it("a blank assessment marks every factor except the symptom checklist as not provided", () => {
    const factors = runAssessment(emptyAssessment).factors;
    for (const f of factors) {
      if (f.id === "symptoms") {
        expect(f).toMatchObject({ provided: true, displayValue: "None selected", points: 0 });
      } else {
        expect(f).toMatchObject({ provided: false, displayValue: null, points: 0, severity: "none" });
        expect(f.ruleId).toBe(`${f.id}.not-provided`);
        expect(f.provenance).toBeUndefined();
      }
    }
  });

  it("blood pressure with only one number is not provided, and says why", () => {
    const f = factor(make({ systolic: "150" }), "bloodPressure");
    expect(f.provided).toBe(false);
    expect(f.reason).toMatch(/both systolic and diastolic/i);
  });

  it("BMI with only height is not provided", () => {
    const f = factor(make({ height: "170" }), "bmi");
    expect(f.provided).toBe(false);
    expect(f.reason).toMatch(/height and weight/i);
  });

  it("a non-scoring answer is provided with 0 points (not confused with missing)", () => {
    expect(factor(FULL, "smoking")).toMatchObject({ provided: true, displayValue: "Former smoker", points: 0 });
    expect(factor(FULL, "diet")).toMatchObject({ provided: true, points: 0 });
    expect(factor(make({ glucose: "60" }), "glucose")).toMatchObject({ provided: true, points: 0, ruleId: "glucose.below-100" });
  });
});

describe("traceability", () => {
  it("every factor names real AssessmentData fields", () => {
    const keys = Object.keys(emptyAssessment);
    for (const f of runAssessment(FULL).factors) {
      expect(f.sourceFields.length).toBeGreaterThan(0);
      for (const field of f.sourceFields) expect(keys).toContain(field);
    }
  });

  it("provided factors carry assessment-form provenance; measurement factors carry a citation", () => {
    for (const f of runAssessment(FULL).factors) {
      expect(f.provenance).toBe("assessment-form");
      if (f.category === "measurement") expect(f.citation).toMatch(/^\[R\d\]$/);
    }
  });
});

describe("level basis and red-flag override", () => {
  it("records the score thresholds when no red flag is present", () => {
    expect(runAssessment(FULL).levelBasis).toEqual({ type: "score", thresholds: { moderate: 3, high: 6 } });
  });

  it("a red flag forces High and records which rule and what the score alone gave", () => {
    const result = runAssessment(make({ warningSigns: ["Fainting or loss of consciousness"] }));
    expect(result.concernScore).toBe(0);
    expect(result.concernLevel).toBe("High");
    expect(result.levelBasis).toEqual({
      type: "red-flag",
      thresholds: { moderate: 3, high: 6 },
      ruleIds: ["warning-signs"],
      scoreLevel: "Low",
    });
  });

  it("very high glucose: High via red flag even though score alone is Moderate", () => {
    const result = runAssessment(make({ glucose: "320" }));
    expect(result.concernScore).toBe(3);
    expect(result.levelBasis).toMatchObject({ type: "red-flag", ruleIds: ["glucose-very-high"], scoreLevel: "Moderate" });
  });
});
