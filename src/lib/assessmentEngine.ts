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
 *   - the risk factors that contributed
 *   - conservative red-flag checks (src/lib/redFlags.ts)
 *   - general educational recommendations
 *
 * The UI always labels the output as educational and points the user to a
 * qualified healthcare professional.
 */

import type { AssessmentData } from "../types/assessment";
import type {
  AssessmentResult,
  ConcernLevel,
  IndicatorResult,
  Recommendation,
  RiskFactor,
} from "../types/results";
import {
  GLUCOSE_REFERENCE,
  HBA1C_REFERENCE,
  BMI_REFERENCE,
  BLOOD_PRESSURE_REFERENCE,
  classify,
} from "../data/referenceRanges";
import { calculateBMI } from "./bmi";
import { checkRedFlags } from "./redFlags";

export const ENGINE_VERSION = "1.0.0";

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
/*  Concern score                                                      */
/* ------------------------------------------------------------------ */

function scoreConcern(
  data: AssessmentData,
  glucose: number | null,
  hba1c: number | null,
  systolic: number | null,
  diastolic: number | null,
  bmi: number | null,
): number {
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

  const age = toNumber(data.age);
  if (age !== null && age >= 45) score += 1;

  if (data.activityLevel === "Sedentary") score += 1;
  if (data.smoking === "Yes") score += 1;
  if (data.dietPattern === "Often high in sugary food or drinks") score += 1;

  return score;
}

function concernFromScore(score: number, hasRedFlags: boolean): ConcernLevel {
  if (hasRedFlags || score >= 6) return "High";
  if (score >= 3) return "Moderate";
  return "Low";
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

  const redFlags = checkRedFlags(data);
  const concernScore = scoreConcern(data, glucose, hba1c, systolic, diastolic, bmi);
  const concernLevel = concernFromScore(concernScore, redFlags.length > 0);

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
    concernSummary: CONCERN_SUMMARY[concernLevel],
    indicators,
    riskFactors,
    redFlags,
    recommendations,
    hasUsableInput,
  };
}
