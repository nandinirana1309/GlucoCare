/**
 * GlucoCare - AI evidence builder (Phase 9)
 * -------------------------------------------------------------
 * Builds the ONLY payload the AI ever receives. Everything in it was already
 * calculated by deterministic code (engine, safety, compare, trends); the AI
 * is asked to EXPLAIN it, never to compute it.
 *
 * Data minimisation (whitelist, not blacklist):
 *  - no name, locality, report file name or report text
 *  - no free text (other conditions / other symptoms could contain anything,
 *    including instructions aimed at the AI)
 *  - age as a 10-year band, no dates at all
 *  - multiple-choice answers only if they are one of the form's own options
 *  - symptoms only if they are on the fixed checklist
 */

import type { AiEvidence } from "../types/ai";
import type { AssessmentInputs, Measurement } from "../types/health";
import type { AssessmentResult } from "../types/results";
import type { AssessmentComparison } from "./compare";
import { analyseGlucose, analyseKind } from "./trends";
import type { TrendSummary } from "./trends";
import { DIABETES_SYMPTOMS } from "../data/symptoms";

const ALLOWED = {
  sex: ["Female", "Male", "Other", "Prefer not to say"],
  diabetesStatus: ["Yes", "No", "Not sure"],
  diabetesType: ["Type 1", "Type 2", "Gestational", "Other", "Not sure"],
  familyHistory: ["Yes", "No", "Not sure"],
  activityLevel: ["Sedentary", "Lightly active", "Moderately active", "Very active"],
  smoking: ["No", "Former smoker", "Yes"],
  dietPattern: ["Generally balanced", "Often high in sugary food or drinks", "Irregular / skipped meals", "Not sure"],
} as const;

function allowed(list: readonly string[], value: string): string | null {
  return list.includes(value) ? value : null;
}

/** "52" -> "50-59"; under 18 -> "under 18"; invalid -> null. */
export function ageBand(age: string): string | null {
  const n = Number(age);
  if (age.trim() === "" || !Number.isFinite(n) || n < 1 || n > 120) return null;
  if (n < 18) return "under 18";
  const lo = Math.floor(n / 10) * 10;
  return `${lo}-${lo + 9}`;
}

function trendEntry(t: TrendSummary): AiEvidence["trends"][number] | null {
  if (t.points.length < 2) return null; // a single value is not a trend
  return {
    measurement: t.label,
    direction: t.direction,
    count: t.points.length,
    first: t.points[0].value,
    latest: t.points[t.points.length - 1].value,
    unit: t.unit,
  };
}

export function buildAiEvidence(args: {
  input: AssessmentInputs;
  result: AssessmentResult;
  comparison?: AssessmentComparison | null;
  measurements?: Measurement[];
}): AiEvidence {
  const { input, result, comparison, measurements = [] } = args;

  const trends: AiEvidence["trends"] = [
    ...analyseGlucose(measurements).summaries,
    analyseKind(measurements, "hba1c"),
    analyseKind(measurements, "systolic"),
    analyseKind(measurements, "diastolic"),
    analyseKind(measurements, "weight"),
    analyseKind(measurements, "bmi"),
  ]
    .map(trendEntry)
    .filter((t): t is NonNullable<typeof t> => t !== null);

  return {
    task: "explain-assessment",
    promptVersion: "2.0",
    assessment: {
      concernLevel: result.concernLevel,
      levelBasis: result.levelBasis.type === "red-flag" ? "red-flag" : "score",
      score: result.concernScore,
      maxScore: result.maxScore,
      thresholds: { ...result.levelBasis.thresholds },
    },
    factors: result.factors.map((f) => ({
      id: f.id,
      label: f.label,
      category: f.category,
      provided: f.provided,
      value: f.displayValue,
      points: f.points,
      maxPoints: f.maxPoints,
      reason: f.reason,
    })),
    safety: { urgent: result.safety.isUrgent },
    changes: comparison && comparison.breakdownAvailable
      ? comparison.changes.map((c) => ({
          factorId: c.id,
          label: c.label,
          before: c.before?.displayValue ?? null,
          after: c.after?.displayValue ?? null,
          pointChange: c.pointChange,
        }))
      : null,
    trends,
    context: {
      ageBand: ageBand(input.age),
      sex: allowed(ALLOWED.sex, input.gender),
      diabetesStatus: allowed(ALLOWED.diabetesStatus, input.diabetesStatus),
      diabetesType: allowed(ALLOWED.diabetesType, input.diabetesType),
      familyHistory: allowed(ALLOWED.familyHistory, input.familyHistory),
      activityLevel: allowed(ALLOWED.activityLevel, input.activityLevel),
      smoking: allowed(ALLOWED.smoking, input.smoking),
      dietPattern: allowed(ALLOWED.dietPattern, input.dietPattern),
      symptoms: input.symptoms.filter((s) => DIABETES_SYMPTOMS.includes(s)),
    },
  };
}

/**
 * Every number the AI is allowed to mention: values, points, score,
 * thresholds and numbers inside the factor reasons / changes / trends.
 * Used by the guard to reject invented numbers.
 */
export function evidenceNumbers(e: AiEvidence): Set<number> {
  const nums = new Set<number>();
  const addFrom = (text: string | null | undefined) => {
    for (const m of (text ?? "").matchAll(/\d+(?:\.\d+)?/g)) nums.add(Number(m[0]));
  };
  [e.assessment.score, e.assessment.maxScore, e.assessment.thresholds.moderate, e.assessment.thresholds.high].forEach((n) => nums.add(n));
  for (const f of e.factors) {
    nums.add(f.points);
    nums.add(f.maxPoints);
    addFrom(f.value);
    addFrom(f.reason);
  }
  for (const c of e.changes ?? []) {
    addFrom(c.before);
    addFrom(c.after);
    nums.add(Math.abs(c.pointChange));
  }
  for (const t of e.trends) {
    [t.count, t.first, t.latest].forEach((n) => nums.add(n));
    nums.add(Math.round(Math.abs(t.latest - t.first) * 10) / 10);
  }
  addFrom(e.context.ageBand);
  addFrom(e.context.diabetesType); // "Type 1" / "Type 2"
  // Small counting words written as digits ("2 factors", "1 point").
  [0, 1, 2, 3].forEach((n) => nums.add(n));
  return nums;
}
