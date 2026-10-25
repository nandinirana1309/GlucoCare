/**
 * GlucoCare - assessment engine
 * -------------------------------------------------------------
 * ONE place that turns raw assessment input into an educational result.
 * Pure functions, no React, unit-tested in Stage 9.
 *
 * This is NOT a diagnostic algorithm. It produces:
 *   - a plain-language status for each indicator (vs. published reference
 *     criteria - see src/data/referenceRanges.ts)
 *   - an overall "concern" indicator (Low / Moderate / High) from a simple
 *     transparent point score
 *   - an EXPLAINABLE breakdown of that score: one ScoreFactor per scoring
 *     rule, saying which input was used, which band matched, the points and
 *     why (engine 1.1.0). concernScore is always the sum of factor points.
 *   - the risk factors that contributed
 *   - a safety status (src/lib/safety.ts, rules in src/lib/redFlags.ts),
 *     evaluated FIRST and independently of the score; urgent forces "High"
 *   - general educational recommendations
 *
 * The UI always labels the output as educational and points the user to a
 * qualified healthcare professional.
 */

import type { AssessmentData } from "../types/assessment";
import type {
  AssessmentResult,
  ConcernLevel,
  FactorCategory,
  FactorId,
  FactorSeverity,
  IndicatorResult,
  LevelBasis,
  Recommendation,
  RedFlag,
  RiskFactor,
  ScoreFactor,
} from "../types/results";
import {
  GLUCOSE_REFERENCE,
  HBA1C_REFERENCE,
  BMI_REFERENCE,
  BLOOD_PRESSURE_REFERENCE,
  classify,
} from "../data/referenceRanges";
import { calculateBMI } from "./bmi";
import { evaluateSafety } from "./safety";
import type { SafetyStatus } from "../types/safety";

/**
 * 1.0.0 - original rules.
 * 1.1.0 - adds the explainable factor breakdown. Scores and levels are
 *         IDENTICAL to 1.0.0 (locked by src/lib/scoreLock.test.ts).
 */
export const ENGINE_VERSION = "1.1.0";

function toNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/*  Indicators                                                         */
/* ------------------------------------------------------------------ */

function glucoseIndicator(value: number | null): IndicatorResult {
  if (value === null) {
    return notProvided("glucose", GLUCOSE_REFERENCE.label, GLUCOSE_REFERENCE.unit, GLUCOSE_REFERENCE.referenceText, GLUCOSE_REFERENCE.citation);
  }
  const band = classify(GLUCOSE_REFERENCE, value);
  return {
    key: "glucose",
    label: GLUCOSE_REFERENCE.label,
    value: String(value),
    unit: GLUCOSE_REFERENCE.unit,
    rating: band.rating,
    statusText: band.statusText,
    referenceText: GLUCOSE_REFERENCE.referenceText,
    citation: GLUCOSE_REFERENCE.citation,
  };
}

function hba1cIndicator(value: number | null): IndicatorResult {
  if (value === null) {
    return notProvided("hba1c", HBA1C_REFERENCE.label, HBA1C_REFERENCE.unit, HBA1C_REFERENCE.referenceText, HBA1C_REFERENCE.citation);
  }
  const band = classify(HBA1C_REFERENCE, value);
  return {
    key: "hba1c",
    label: HBA1C_REFERENCE.label,
    value: String(value),
    unit: HBA1C_REFERENCE.unit,
    rating: band.rating,
    statusText: band.statusText,
    referenceText: HBA1C_REFERENCE.referenceText,
    citation: HBA1C_REFERENCE.citation,
  };
}

function bmiIndicator(bmi: number | null): IndicatorResult {
  if (bmi === null) {
    return notProvided("bmi", BMI_REFERENCE.label, "", BMI_REFERENCE.referenceText, BMI_REFERENCE.citation);
  }
  const band = classify(BMI_REFERENCE, bmi);
  return {
    key: "bmi",
    label: BMI_REFERENCE.label,
    value: bmi.toFixed(1),
    unit: "",
    rating: band.rating,
    statusText: band.statusText,
    referenceText: BMI_REFERENCE.referenceText,
    citation: BMI_REFERENCE.citation,
  };
}

function bloodPressureIndicator(
  systolic: number | null,
  diastolic: number | null,
): IndicatorResult {
  if (systolic === null || diastolic === null) {
    return notProvided(
      "bloodPressure",
      BLOOD_PRESSURE_REFERENCE.label,
      BLOOD_PRESSURE_REFERENCE.unit,
      BLOOD_PRESSURE_REFERENCE.referenceText,
      BLOOD_PRESSURE_REFERENCE.citation,
    );
  }

  let rating: IndicatorResult["rating"] = "within-reference";
  let statusText = "Within the reference range";

  if (systolic >= 140 || diastolic >= 90) {
    rating = "above-reference";
    statusText = "In the stage 2 range or above";
  } else if (systolic >= 130 || diastolic >= 80) {
    rating = "borderline";
    statusText = "In the stage 1 range";
  } else if (systolic >= 120) {
    rating = "borderline";
    statusText = "In the elevated range";
  }

  return {
    key: "bloodPressure",
    label: BLOOD_PRESSURE_REFERENCE.label,
    value: `${systolic}/${diastolic}`,
    unit: BLOOD_PRESSURE_REFERENCE.unit,
    rating,
    statusText,
    referenceText: BLOOD_PRESSURE_REFERENCE.referenceText,
    citation: BLOOD_PRESSURE_REFERENCE.citation,
  };
}

function notProvided(
  key: IndicatorResult["key"],
  label: string,
  unit: string,
  referenceText: string,
  citation: string,
): IndicatorResult {
  return {
    key,
    label,
    value: "--",
    unit,
    rating: "not-provided",
    statusText: "Not provided",
    referenceText,
    citation,
  };
}

/* ------------------------------------------------------------------ */
/*  Concern score - explainable rules                                  */
/* ------------------------------------------------------------------ */
/*
 * Each scoring rule below reads specific input fields, finds which band the
 * value falls in and returns a ScoreFactor. The concern score is simply the
 * sum of the factors' points, so every point can be traced to one input.
 *
 * The bands and point values are exactly those of engine 1.0.0 - they were
 * not changed in this refactor (see scoreLock.test.ts). `severity` is only a
 * display grouping of each band, not a clinical grade.
 */

/** Values parsed once and shared by every rule. */
interface ParsedInputs {
  glucose: number | null;
  hba1c: number | null;
  systolic: number | null;
  diastolic: number | null;
  bmi: number | null;
  age: number | null;
}

/** The fixed description of a factor (what it is and what it reads). */
interface FactorMeta {
  id: FactorId;
  label: string;
  category: FactorCategory;
  maxPoints: number;
  sourceFields: (keyof AssessmentData)[];
  citation?: string;
}

/** The band that matched for this user's value. */
interface Band {
  ruleId: string;
  points: number;
  severity: FactorSeverity;
  reason: string;
}

type ScoringRule = (data: AssessmentData, n: ParsedInputs) => ScoreFactor;

function provided(meta: FactorMeta, displayValue: string, band: Band): ScoreFactor {
  return {
    ...meta,
    provided: true,
    displayValue,
    points: band.points,
    severity: band.severity,
    ruleId: band.ruleId,
    reason: band.reason,
    provenance: "assessment-form",
  };
}

function notGiven(meta: FactorMeta, reason: string): ScoreFactor {
  return {
    ...meta,
    provided: false,
    displayValue: null,
    points: 0,
    severity: "none",
    ruleId: `${meta.id}.not-provided`,
    reason,
  };
}

/** Thresholds that turn the score into a level (unchanged from 1.0.0). */
export const LEVEL_THRESHOLDS = { moderate: 3, high: 6 } as const;

const SCORING_RULES: ScoringRule[] = [
  /* Blood glucose: >=200 -> 3, 126-199 -> 2, 100-125 -> 1, otherwise 0 */
  (_d, n) => {
    const meta: FactorMeta = {
      id: "glucose",
      label: "Blood glucose",
      category: "measurement",
      maxPoints: 3,
      sourceFields: ["glucose"],
      citation: GLUCOSE_REFERENCE.citation,
    };
    if (n.glucose === null) return notGiven(meta, "No blood glucose value was entered.");
    const g = n.glucose;
    const value = `${g} mg/dL`;
    if (g >= 200)
      return provided(meta, value, {
        ruleId: "glucose.gte-200",
        points: 3,
        severity: "high",
        reason: "200 mg/dL or above - the highest glucose scoring band.",
      });
    if (g >= 126)
      return provided(meta, value, {
        ruleId: "glucose.126-199",
        points: 2,
        severity: "moderate",
        reason: "126 mg/dL or above - elevated compared with the fasting reference range.",
      });
    if (g >= 100)
      return provided(meta, value, {
        ruleId: "glucose.100-125",
        points: 1,
        severity: "mild",
        reason: "100-125 mg/dL - borderline (prediabetes fasting range).",
      });
    return provided(meta, value, {
      ruleId: "glucose.below-100",
      points: 0,
      severity: "none",
      reason: `${classify(GLUCOSE_REFERENCE, g).statusText}. Values below 100 mg/dL do not add points (very low values are checked by the safety warnings).`,
    });
  },

  /* HbA1c: >=6.5 -> 3, 5.7-6.4 -> 1, otherwise 0 */
  (_d, n) => {
    const meta: FactorMeta = {
      id: "hba1c",
      label: "HbA1c",
      category: "measurement",
      maxPoints: 3,
      sourceFields: ["hba1c"],
      citation: HBA1C_REFERENCE.citation,
    };
    if (n.hba1c === null) return notGiven(meta, "No HbA1c value was entered.");
    const value = `${n.hba1c} %`;
    if (n.hba1c >= 6.5)
      return provided(meta, value, {
        ruleId: "hba1c.gte-6.5",
        points: 3,
        severity: "high",
        reason: "6.5% or above - elevated compared with the reference range.",
      });
    if (n.hba1c >= 5.7)
      return provided(meta, value, {
        ruleId: "hba1c.5.7-6.4",
        points: 1,
        severity: "mild",
        reason: "5.7-6.4% - borderline (prediabetes range).",
      });
    return provided(meta, value, {
      ruleId: "hba1c.below-5.7",
      points: 0,
      severity: "none",
      reason: "Below 5.7% - within the reference range.",
    });
  },

  /* Blood pressure (needs both numbers): >=140 or >=90 -> 2, >=130 or >=80 -> 1 */
  (_d, n) => {
    const meta: FactorMeta = {
      id: "bloodPressure",
      label: "Blood pressure",
      category: "measurement",
      maxPoints: 2,
      sourceFields: ["systolic", "diastolic"],
      citation: BLOOD_PRESSURE_REFERENCE.citation,
    };
    if (n.systolic === null || n.diastolic === null) {
      const partial = n.systolic !== null || n.diastolic !== null;
      return notGiven(
        meta,
        partial
          ? "Only one blood pressure number was entered - both systolic and diastolic are needed."
          : "No blood pressure reading was entered.",
      );
    }
    const s = n.systolic;
    const d = n.diastolic;
    const value = `${s}/${d} mmHg`;
    if (s >= 140 || d >= 90)
      return provided(meta, value, {
        ruleId: "bp.stage2",
        points: 2,
        severity: "moderate",
        reason: "Systolic 140+ or diastolic 90+ - in the stage 2 range or above.",
      });
    if (s >= 130 || d >= 80)
      return provided(meta, value, {
        ruleId: "bp.stage1",
        points: 1,
        severity: "mild",
        reason: "Systolic 130-139 or diastolic 80-89 - in the stage 1 range.",
      });
    if (s >= 120)
      return provided(meta, value, {
        ruleId: "bp.elevated",
        points: 0,
        severity: "none",
        reason: "Systolic 120-129 - in the elevated range. This range does not add points.",
      });
    return provided(meta, value, {
      ruleId: "bp.below-120-80",
      points: 0,
      severity: "none",
      reason: "Below 120/80 - within the reference range.",
    });
  },

  /* BMI (from height + weight): >=30 -> 2, 25-29.9 -> 1, otherwise 0 */
  (_d, n) => {
    const meta: FactorMeta = {
      id: "bmi",
      label: "BMI",
      category: "measurement",
      maxPoints: 2,
      sourceFields: ["height", "weight"],
      citation: BMI_REFERENCE.citation,
    };
    if (n.bmi === null)
      return notGiven(meta, "BMI needs both height and weight to be entered.");
    const value = n.bmi.toFixed(1);
    if (n.bmi >= 30)
      return provided(meta, value, {
        ruleId: "bmi.gte-30",
        points: 2,
        severity: "moderate",
        reason: "30 or above - well above the healthy-weight range (WHO).",
      });
    if (n.bmi >= 25)
      return provided(meta, value, {
        ruleId: "bmi.25-29.9",
        points: 1,
        severity: "mild",
        reason: "25-29.9 - above the healthy-weight range (WHO).",
      });
    return provided(meta, value, {
      ruleId: "bmi.below-25",
      points: 0,
      severity: "none",
      reason: `${classify(BMI_REFERENCE, n.bmi).statusText}. BMI below 25 does not add points.`,
    });
  },

  /*
   * Symptoms: 4+ -> 2, 2-3 -> 1. The checklist is always part of the form, so
   * "none selected" is treated as an answer (provided), not as missing data.
   * Free-text "other symptoms" are shown to the user but never scored.
   */
  (d) => {
    const meta: FactorMeta = {
      id: "symptoms",
      label: "Symptoms",
      category: "symptom",
      maxPoints: 2,
      sourceFields: ["symptoms"],
    };
    const count = d.symptoms.length;
    const value = count === 0 ? "None selected" : `${count} selected`;
    if (count >= 4)
      return provided(meta, value, {
        ruleId: "symptoms.gte-4",
        points: 2,
        severity: "moderate",
        reason: "4 or more diabetes-related symptoms selected.",
      });
    if (count >= 2)
      return provided(meta, value, {
        ruleId: "symptoms.2-3",
        points: 1,
        severity: "mild",
        reason: "2-3 diabetes-related symptoms selected.",
      });
    return provided(meta, value, {
      ruleId: "symptoms.0-1",
      points: 0,
      severity: "none",
      reason: "Fewer than 2 symptoms selected - this does not add points.",
    });
  },

  /* Family history: "Yes" -> 1 */
  (d) =>
    answerRule(
      {
        id: "familyHistory",
        label: "Family history",
        category: "history",
        maxPoints: 1,
        sourceFields: ["familyHistory"],
      },
      d.familyHistory,
      d.familyHistory === "Yes",
      "A close relative with diabetes can increase risk.",
    ),

  /* Diabetes status: "Yes" or "Not sure" -> 1 */
  (d) =>
    answerRule(
      {
        id: "diabetesStatus",
        label: "Existing diabetes",
        category: "history",
        maxPoints: 1,
        sourceFields: ["diabetesStatus"],
      },
      d.diabetesStatus,
      d.diabetesStatus === "Yes" || d.diabetesStatus === "Not sure",
      d.diabetesStatus === "Yes"
        ? "You reported an existing diabetes diagnosis."
        : "You were not sure whether you have been told you have diabetes.",
    ),

  /* Age: 45 or above -> 1 */
  (_d, n) => {
    const meta: FactorMeta = {
      id: "age",
      label: "Age",
      category: "demographic",
      maxPoints: 1,
      sourceFields: ["age"],
    };
    if (n.age === null) return notGiven(meta, "Age was not entered.");
    const value = `${n.age} years`;
    return n.age >= 45
      ? provided(meta, value, {
          ruleId: "age.gte-45",
          points: 1,
          severity: "mild",
          reason: "Age 45 or above - type 2 diabetes risk rises with age.",
        })
      : provided(meta, value, {
          ruleId: "age.below-45",
          points: 0,
          severity: "none",
          reason: "Under 45 - age does not add points.",
        });
  },

  /* Activity: "Sedentary" -> 1 */
  (d) =>
    answerRule(
      {
        id: "activity",
        label: "Physical activity",
        category: "lifestyle",
        maxPoints: 1,
        sourceFields: ["activityLevel"],
      },
      d.activityLevel,
      d.activityLevel === "Sedentary",
      "A sedentary activity level - regular activity supports healthy glucose management.",
    ),

  /* Smoking: "Yes" -> 1 (former smokers score 0, as in 1.0.0) */
  (d) =>
    answerRule(
      {
        id: "smoking",
        label: "Smoking",
        category: "lifestyle",
        maxPoints: 1,
        sourceFields: ["smoking"],
      },
      d.smoking,
      d.smoking === "Yes",
      "Current smoking is linked to a higher risk of type 2 diabetes and its complications.",
    ),

  /* Diet: "Often high in sugary food or drinks" -> 1 */
  (d) =>
    answerRule(
      {
        id: "diet",
        label: "Diet pattern",
        category: "lifestyle",
        maxPoints: 1,
        sourceFields: ["dietPattern"],
      },
      d.dietPattern,
      d.dietPattern === "Often high in sugary food or drinks",
      "A diet often high in sugary food or drinks.",
    ),
];

/**
 * Shared rule for one-point multiple-choice answers.
 * Blank answer -> not provided; the scored answer -> 1 point; anything else -> 0.
 */
function answerRule(
  meta: FactorMeta,
  answer: string,
  scores: boolean,
  scoredReason: string,
): ScoreFactor {
  if (answer === "") return notGiven(meta, `${meta.label} was not answered.`);
  const slug = answer.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return provided(
    meta,
    answer,
    scores
      ? { ruleId: `${meta.id}.${slug}`, points: 1, severity: "mild", reason: scoredReason }
      : {
          ruleId: `${meta.id}.${slug}`,
          points: 0,
          severity: "none",
          reason: `"${answer}" does not add points.`,
        },
  );
}

/** Run every scoring rule. Exported so later features (history, what-if) reuse it. */
export function scoreFactors(data: AssessmentData): ScoreFactor[] {
  const parsed: ParsedInputs = {
    glucose: toNumber(data.glucose),
    hba1c: toNumber(data.hba1c),
    systolic: toNumber(data.systolic),
    diastolic: toNumber(data.diastolic),
    bmi: calculateBMI(data.height, data.weight),
    age: toNumber(data.age),
  };
  return SCORING_RULES.map((rule) => rule(data, parsed));
}

function concernFromScore(score: number): ConcernLevel {
  if (score >= LEVEL_THRESHOLDS.high) return "High";
  if (score >= LEVEL_THRESHOLDS.moderate) return "Moderate";
  return "Low";
}

/**
 * Final level. An urgent safety status ALWAYS forces "High", whatever the
 * score - the basis records this so the UI can say why. The score itself is
 * never changed by a safety trigger (no extra points).
 */
function decideLevel(
  score: number,
  safety: SafetyStatus,
): { level: ConcernLevel; basis: LevelBasis } {
  const scoreLevel = concernFromScore(score);
  const thresholds = { ...LEVEL_THRESHOLDS };
  if (safety.isUrgent) {
    return {
      level: "High",
      basis: {
        type: "red-flag",
        thresholds,
        ruleIds: [...safety.triggeredRules],
        scoreLevel,
      },
    };
  }
  return { level: scoreLevel, basis: { type: "score", thresholds } };
}

const CONCERN_SUMMARY: Record<ConcernLevel, string> = {
  Low: "The information entered does not show many diabetes-related risk indicators. Keep up general healthy habits and routine check-ups.",
  Moderate:
    "Some diabetes-related indicators or risk factors were noted. Consider discussing these with a healthcare professional at your next visit.",
  High: "Several diabetes-related indicators or risk factors were noted, or a warning sign was reported. Please arrange to speak with a qualified healthcare professional.",
};

/* ------------------------------------------------------------------ */
/*  Risk factors                                                       */
/* ------------------------------------------------------------------ */

function collectRiskFactors(
  data: AssessmentData,
  indicators: IndicatorResult[],
): RiskFactor[] {
  const factors: RiskFactor[] = [];
  const byKey = Object.fromEntries(indicators.map((i) => [i.key, i]));

  if (data.familyHistory === "Yes") {
    factors.push({
      label: "Family history of diabetes",
      detail: "A close relative with diabetes can increase risk.",
    });
  }

  const age = toNumber(data.age);
  if (age !== null && age >= 45) {
    factors.push({
      label: "Age 45 or above",
      detail: "Type 2 diabetes risk rises with age.",
    });
  }

  if (byKey.bmi && (byKey.bmi.rating === "borderline" || byKey.bmi.rating === "above-reference")) {
    factors.push({
      label: "BMI above the healthy-weight range",
      detail: `Your BMI (${byKey.bmi.value}) is ${byKey.bmi.statusText.toLowerCase()}.`,
    });
  }

  if (byKey.bloodPressure && (byKey.bloodPressure.rating === "borderline" || byKey.bloodPressure.rating === "above-reference")) {
    factors.push({
      label: "Blood pressure above the reference range",
      detail: `Recorded ${byKey.bloodPressure.value} mmHg (${byKey.bloodPressure.statusText.toLowerCase()}).`,
    });
  }

  if (byKey.glucose && (byKey.glucose.rating === "borderline" || byKey.glucose.rating === "above-reference")) {
    factors.push({
      label: "Blood glucose above the reference range",
      detail: `Recorded ${byKey.glucose.value} mg/dL (${byKey.glucose.statusText.toLowerCase()}).`,
    });
  }

  if (byKey.hba1c && (byKey.hba1c.rating === "borderline" || byKey.hba1c.rating === "above-reference")) {
    factors.push({
      label: "HbA1c above the reference range",
      detail: `Recorded ${byKey.hba1c.value}% (${byKey.hba1c.statusText.toLowerCase()}).`,
    });
  }

  if (data.symptoms.length >= 2) {
    factors.push({
      label: "Multiple diabetes-related symptoms reported",
      detail: `${data.symptoms.length} symptoms selected.`,
    });
  }

  if (data.activityLevel === "Sedentary") {
    factors.push({
      label: "Low physical activity",
      detail: "Regular activity supports healthy glucose management.",
    });
  }

  if (data.smoking === "Yes") {
    factors.push({
      label: "Current smoking",
      detail: "Smoking is linked to a higher risk of type 2 diabetes and its complications.",
    });
  }

  if (data.dietPattern === "Often high in sugary food or drinks") {
    factors.push({
      label: "Diet often high in sugary food or drinks",
      detail: "See the Nutrition page for balanced-eating guidance.",
    });
  }

  return factors;
}

/* ------------------------------------------------------------------ */
/*  Recommendations                                                    */
/* ------------------------------------------------------------------ */

function buildRecommendations(
  data: AssessmentData,
  indicators: IndicatorResult[],
  concern: ConcernLevel,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const byKey = Object.fromEntries(indicators.map((i) => [i.key, i]));
  const elevated = (key: string) =>
    byKey[key] && (byKey[key].rating === "borderline" || byKey[key].rating === "above-reference");

  if (concern !== "Low") {
    recs.push({
      id: "talk-to-professional",
      icon: "Stethoscope",
      title: "Speak with a healthcare professional",
      detail:
        "Share these results and your history with a doctor. They can arrange proper testing and advice.",
    });
  }

  if (elevated("glucose") || elevated("hba1c")) {
    recs.push({
      id: "confirm-testing",
      icon: "FlaskConical",
      title: "Ask about confirmatory blood tests",
      detail:
        "A single reading is not enough. A clinician may repeat fasting glucose or HbA1c under proper conditions.",
    });
  }

  if (elevated("bmi")) {
    recs.push({
      id: "weight",
      icon: "Activity",
      title: "Work towards a healthy weight",
      detail:
        "Even a modest, gradual weight change can improve glucose control. A dietitian can help set realistic goals.",
    });
  }

  if (elevated("bloodPressure")) {
    recs.push({
      id: "bp-monitor",
      icon: "HeartPulse",
      title: "Monitor your blood pressure",
      detail:
        "Keep a simple log of readings and share it with your clinician. Reducing salt and staying active can help.",
    });
  }

  recs.push({
    id: "nutrition",
    icon: "Salad",
    title: "Focus on balanced nutrition",
    detail:
      "Vegetables, whole grains, sensible portions and fewer sugary drinks. See the Nutrition page for details.",
  });

  recs.push({
    id: "activity",
    icon: "Activity",
    title: "Stay physically active",
    detail:
      "Aim for regular movement most days, at a level appropriate for you and cleared by your clinician if needed.",
  });

  if (data.smoking === "Yes") {
    recs.push({
      id: "smoking",
      icon: "ShieldCheck",
      title: "Consider support to stop smoking",
      detail: "Stopping smoking lowers the risk of diabetes complications. Ask your clinician about available support.",
    });
  }

  recs.push({
    id: "medication-safety",
    icon: "Pill",
    title: "Medication safety",
    detail:
      "Do not start, stop or change any medication based on this assessment. GlucoCare never provides dosages.",
  });

  return recs;
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

export function runAssessment(data: AssessmentData): AssessmentResult {
  const glucose = toNumber(data.glucose);
  const hba1c = toNumber(data.hba1c);
  const systolic = toNumber(data.systolic);
  const diastolic = toNumber(data.diastolic);
  const bmi = calculateBMI(data.height, data.weight);

  const indicators: IndicatorResult[] = [
    glucoseIndicator(glucose),
    hba1cIndicator(hba1c),
    bloodPressureIndicator(systolic, diastolic),
    bmiIndicator(bmi),
  ];

  // 1. Safety first - evaluated from the raw input, independent of the score.
  //    This is the ONE safety evaluation; everything else reads from it.
  const safety = evaluateSafety(data);
  const redFlags: RedFlag[] = safety.triggers.map((t) => ({ id: t.ruleId, reason: t.reason }));

  // 2. Scoring. The score is DEFINED as the sum of the factors.
  const factors = scoreFactors(data);
  const concernScore = factors.reduce((sum, f) => sum + f.points, 0);
  const maxScore = factors.reduce((sum, f) => sum + f.maxPoints, 0);

  // 3. Final level: safety override, otherwise the score thresholds.
  const { level: concernLevel, basis: levelBasis } = decideLevel(concernScore, safety);

  const riskFactors = collectRiskFactors(data, indicators);
  const recommendations = buildRecommendations(data, indicators, concernLevel);

  const hasUsableInput = Boolean(
    glucose !== null ||
      hba1c !== null ||
      systolic !== null ||
      bmi !== null ||
      data.symptoms.length > 0 ||
      data.warningSigns.length > 0,
  );

  return {
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    concernLevel,
    concernScore,
    maxScore,
    concernSummary: CONCERN_SUMMARY[concernLevel],
    factors,
    levelBasis,
    safety,
    indicators,
    riskFactors,
    redFlags,
    recommendations,
    hasUsableInput,
  };
}
