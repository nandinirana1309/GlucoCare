/**
 * Score-locking (characterisation) tests
 * -------------------------------------------------------------
 * Written BEFORE the explainable-engine refactor, against engine v1.0.0, to
 * prove that the refactor does not change any score or concern level.
 *
 * Three layers of protection:
 *  1. LEGACY ORACLE - a frozen, verbatim copy of the v1.0.0 scoring logic.
 *     runAssessment() must agree with it on thousands of generated inputs.
 *  2. THRESHOLD TABLES - every scoring boundary checked on both sides.
 *  3. LEVEL BOUNDARIES - Low/Moderate/High cut-offs and red-flag override.
 *
 * Do NOT "fix" the oracle if a test fails - a failure means the engine's
 * scoring behaviour changed, which must be a deliberate, versioned decision.
 */

import { describe, it, expect } from "vitest";
import { runAssessment } from "./assessmentEngine";
import { calculateBMI } from "./bmi";
import { checkRedFlags } from "./redFlags";
import { emptyAssessment } from "../types/assessment";
import type { AssessmentData } from "../types/assessment";
import type { ConcernLevel } from "../types/results";

function make(overrides: Partial<AssessmentData>): AssessmentData {
  return { ...emptyAssessment, ...overrides };
}

/* ------------------------------------------------------------------ */
/*  1. Legacy oracle - frozen copy of engine v1.0.0 scoreConcern()     */
/* ------------------------------------------------------------------ */

function legacyToNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function legacyScore(data: AssessmentData): number {
  const glucose = legacyToNumber(data.glucose);
  const hba1c = legacyToNumber(data.hba1c);
  const systolic = legacyToNumber(data.systolic);
  const diastolic = legacyToNumber(data.diastolic);
  const bmi = calculateBMI(data.height, data.weight);

  let score = 0;

  if (glucose !== null) {
    if (glucose >= 200) score += 3;
    else if (glucose >= 126) score += 2;
    else if (glucose >= 100) score += 1;
  }

  if (hba1c !== null) {
    if (hba1c >= 6.5) score += 3;
    else if (hba1c >= 5.7) score += 1;
  }

  if (systolic !== null && diastolic !== null) {
    if (systolic >= 140 || diastolic >= 90) score += 2;
    else if (systolic >= 130 || diastolic >= 80) score += 1;
  }

  if (bmi !== null) {
    if (bmi >= 30) score += 2;
    else if (bmi >= 25) score += 1;
  }

  const symptomCount = data.symptoms.length;
  if (symptomCount >= 4) score += 2;
  else if (symptomCount >= 2) score += 1;

  if (data.familyHistory === "Yes") score += 1;
  if (data.diabetesStatus === "Yes" || data.diabetesStatus === "Not sure") score += 1;

  const age = legacyToNumber(data.age);
  if (age !== null && age >= 45) score += 1;

  if (data.activityLevel === "Sedentary") score += 1;
  if (data.smoking === "Yes") score += 1;
  if (data.dietPattern === "Often high in sugary food or drinks") score += 1;

  return score;
}

function legacyLevel(data: AssessmentData): ConcernLevel {
  const score = legacyScore(data);
  const hasRedFlags = checkRedFlags(data).length > 0;
  if (hasRedFlags || score >= 6) return "High";
  if (score >= 3) return "Moderate";
  return "Low";
}

/* ------------------------------------------------------------------ */
/*  Seeded generator over boundary-heavy value pools                   */
/* ------------------------------------------------------------------ */

/** Small deterministic PRNG (mulberry32) so failures are reproducible. */
function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOLS = {
  glucose: ["", "0", "45", "53.9", "54", "69", "70", "99", "99.9", "100", "125", "125.9", "126", "199", "199.9", "200", "299", "300", "450"],
  hba1c: ["", "4.8", "5.6", "5.69", "5.7", "6.0", "6.4", "6.49", "6.5", "7.8", "12"],
  systolic: ["", "95", "119", "120", "129", "130", "139", "140", "179", "180"],
  diastolic: ["", "60", "79", "80", "89", "90", "119", "120"],
  // height 100 cm makes BMI == weight, so these hit the BMI boundaries exactly
  height: ["", "100", "160", "175", "40"],
  weight: ["", "18.4", "18.5", "24.9", "25", "29.9", "30", "82", "500"],
  age: ["", "18", "44", "44.9", "45", "46", "80", "abc"],
  symptomCount: [0, 1, 2, 3, 4, 5, 8],
  warningCount: [0, 0, 0, 0, 1],
  familyHistory: ["", "Yes", "No", "Not sure"],
  diabetesStatus: ["", "Yes", "No", "Not sure"],
  activityLevel: ["", "Sedentary", "Lightly active", "Moderately active", "Very active"],
  smoking: ["", "No", "Former smoker", "Yes"],
  dietPattern: ["", "Generally balanced", "Often high in sugary food or drinks", "Irregular / skipped meals", "Not sure"],
} as const;

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function generate(rand: () => number): AssessmentData {
  return make({
    glucose: pick(rand, POOLS.glucose),
    hba1c: pick(rand, POOLS.hba1c),
    systolic: pick(rand, POOLS.systolic),
    diastolic: pick(rand, POOLS.diastolic),
    height: pick(rand, POOLS.height),
    weight: pick(rand, POOLS.weight),
    age: pick(rand, POOLS.age),
    symptoms: Array.from({ length: pick(rand, POOLS.symptomCount) }, (_, i) => `S${i}`),
    warningSigns: Array.from({ length: pick(rand, POOLS.warningCount) }, (_, i) => `W${i}`),
    familyHistory: pick(rand, POOLS.familyHistory) as AssessmentData["familyHistory"],
    diabetesStatus: pick(rand, POOLS.diabetesStatus) as AssessmentData["diabetesStatus"],
    activityLevel: pick(rand, POOLS.activityLevel) as AssessmentData["activityLevel"],
    smoking: pick(rand, POOLS.smoking) as AssessmentData["smoking"],
    dietPattern: pick(rand, POOLS.dietPattern) as AssessmentData["dietPattern"],
  });
}

describe("score lock: legacy oracle agreement", () => {
  it("matches the v1.0.0 score and level on 5000 generated assessments", () => {
    const rand = prng(20261005);
    for (let i = 0; i < 5000; i++) {
      const data = generate(rand);
      const result = runAssessment(data);
      const context = JSON.stringify(data);
      expect(result.concernScore, context).toBe(legacyScore(data));
      expect(result.concernLevel, context).toBe(legacyLevel(data));
      // Added with engine 1.1.0: the score must be the sum of its factors.
      const sum = result.factors.reduce((total, f) => total + f.points, 0);
      expect(result.concernScore, context).toBe(sum);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  2. Threshold tables - each factor in isolation                     */
/* ------------------------------------------------------------------ */

type Case = [Partial<AssessmentData>, number];

function expectScores(cases: Case[]) {
  for (const [input, expected] of cases) {
    expect(runAssessment(make(input)).concernScore, JSON.stringify(input)).toBe(expected);
  }
}

describe("score lock: per-factor thresholds", () => {
  it("blank assessment scores 0", () => {
    expectScores([[{}, 0]]);
  });

  it("glucose: <100 = 0, 100-125.x = 1, 126-199.x = 2, >=200 = 3", () => {
    expectScores([
      [{ glucose: "0" }, 0],
      [{ glucose: "69" }, 0],
      [{ glucose: "99" }, 0],
      [{ glucose: "99.9" }, 0],
      [{ glucose: "100" }, 1],
      [{ glucose: "125" }, 1],
      [{ glucose: "125.9" }, 1],
      [{ glucose: "126" }, 2],
      [{ glucose: "199.9" }, 2],
      [{ glucose: "200" }, 3],
      [{ glucose: "299" }, 3],
    ]);
  });

  it("HbA1c: <5.7 = 0, 5.7-6.4x = 1, >=6.5 = 3 (no 2-point band)", () => {
    expectScores([
      [{ hba1c: "5.6" }, 0],
      [{ hba1c: "5.69" }, 0],
      [{ hba1c: "5.7" }, 1],
      [{ hba1c: "6.4" }, 1],
      [{ hba1c: "6.49" }, 1],
      [{ hba1c: "6.5" }, 3],
      [{ hba1c: "9" }, 3],
    ]);
  });

  it("blood pressure: needs both numbers; >=130 or >=80 = 1; >=140 or >=90 = 2", () => {
    expectScores([
      [{ systolic: "150" }, 0], // diastolic missing -> not scored
      [{ diastolic: "95" }, 0], // systolic missing -> not scored
      [{ systolic: "119", diastolic: "79" }, 0],
      [{ systolic: "125", diastolic: "79" }, 0], // "elevated" range scores 0
      [{ systolic: "129", diastolic: "79" }, 0],
      [{ systolic: "130", diastolic: "70" }, 1],
      [{ systolic: "110", diastolic: "80" }, 1],
      [{ systolic: "139", diastolic: "89" }, 1],
      [{ systolic: "140", diastolic: "70" }, 2],
      [{ systolic: "110", diastolic: "90" }, 2],
      [{ systolic: "179", diastolic: "119" }, 2],
    ]);
  });

  it("BMI: <25 = 0, 25-29.9 = 1, >=30 = 2; implausible inputs not scored", () => {
    expectScores([
      [{ height: "100", weight: "18.4" }, 0],
      [{ height: "100", weight: "24.9" }, 0],
      [{ height: "100", weight: "25" }, 1],
      [{ height: "100", weight: "29.9" }, 1],
      [{ height: "100", weight: "30" }, 2],
      [{ height: "160", weight: "82" }, 2], // BMI 32.0
      [{ height: "40", weight: "82" }, 0], // height outside plausible range
      [{ height: "160" }, 0], // weight missing
    ]);
  });

  it("symptoms: 0-1 = 0, 2-3 = 1, >=4 = 2", () => {
    const withSymptoms = (n: number) => ({ symptoms: Array.from({ length: n }, (_, i) => `S${i}`) });
    expectScores([
      [withSymptoms(0), 0],
      [withSymptoms(1), 0],
      [withSymptoms(2), 1],
      [withSymptoms(3), 1],
      [withSymptoms(4), 2],
      [withSymptoms(8), 2],
    ]);
  });

  it("history, age and lifestyle: one point each for the scored answer only", () => {
    expectScores([
      [{ familyHistory: "Yes" }, 1],
      [{ familyHistory: "No" }, 0],
      [{ familyHistory: "Not sure" }, 0],
      [{ diabetesStatus: "Yes" }, 1],
      [{ diabetesStatus: "Not sure" }, 1],
      [{ diabetesStatus: "No" }, 0],
      [{ age: "44" }, 0],
      [{ age: "44.9" }, 0],
      [{ age: "45" }, 1],
      [{ age: "80" }, 1],
      [{ activityLevel: "Sedentary" }, 1],
      [{ activityLevel: "Lightly active" }, 0],
      [{ smoking: "Yes" }, 1],
      [{ smoking: "Former smoker" }, 0],
      [{ smoking: "No" }, 0],
      [{ dietPattern: "Often high in sugary food or drinks" }, 1],
      [{ dietPattern: "Irregular / skipped meals" }, 0],
    ]);
  });

  it("maximum possible score is 18", () => {
    expectScores([
      [
        {
          glucose: "250",
          hba1c: "9",
          systolic: "150",
          diastolic: "95",
          height: "160",
          weight: "90",
          symptoms: ["a", "b", "c", "d"],
          familyHistory: "Yes",
          diabetesStatus: "Yes",
          age: "60",
          activityLevel: "Sedentary",
          smoking: "Yes",
          dietPattern: "Often high in sugary food or drinks",
        },
        18,
      ],
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  3. Concern-level boundaries and red-flag override                  */
/* ------------------------------------------------------------------ */

describe("score lock: concern level", () => {
  it("score 2 is Low, 3 is Moderate, 5 is Moderate, 6 is High", () => {
    const score2 = make({ familyHistory: "Yes", smoking: "Yes" });
    const score3 = make({ familyHistory: "Yes", smoking: "Yes", age: "50" });
    const score5 = make({ glucose: "130", familyHistory: "Yes", smoking: "Yes", age: "50" });
    const score6 = make({ glucose: "130", familyHistory: "Yes", smoking: "Yes", age: "50", activityLevel: "Sedentary" });

    expect(runAssessment(score2)).toMatchObject({ concernScore: 2, concernLevel: "Low" });
    expect(runAssessment(score3)).toMatchObject({ concernScore: 3, concernLevel: "Moderate" });
    expect(runAssessment(score5)).toMatchObject({ concernScore: 5, concernLevel: "Moderate" });
    expect(runAssessment(score6)).toMatchObject({ concernScore: 6, concernLevel: "High" });
  });

  it("any red flag forces High regardless of a low score", () => {
    const cases: Partial<AssessmentData>[] = [
      { warningSigns: ["Fruity-smelling breath"] }, // score 0
      { glucose: "50" }, // very low glucose, score 0
      { glucose: "300" }, // very high glucose, score 3
      { systolic: "180", diastolic: "70" }, // BP crisis, score 2
      { systolic: "120", diastolic: "120" }, // BP crisis via diastolic
    ];
    for (const input of cases) {
      const result = runAssessment(make(input));
      expect(result.redFlags.length, JSON.stringify(input)).toBeGreaterThan(0);
      expect(result.concernScore, JSON.stringify(input)).toBeLessThan(6);
      expect(result.concernLevel, JSON.stringify(input)).toBe("High");
    }
  });

  it("glucose 54 and 299 do not trigger a red flag (boundaries are exclusive / inclusive as before)", () => {
    expect(runAssessment(make({ glucose: "54" })).redFlags).toEqual([]);
    expect(runAssessment(make({ glucose: "299" })).redFlags).toEqual([]);
    expect(runAssessment(make({ glucose: "0" })).redFlags).toEqual([]);
  });
});
