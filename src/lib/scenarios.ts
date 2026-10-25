/**
 * GlucoCare - educational "What-If" scenarios (Phase 12)
 * -------------------------------------------------------------
 * NOT a prediction engine. A scenario copies the user's latest saved input,
 * changes ONLY lifestyle answers (activity, eating pattern, smoking) or a
 * hypothetical weight, and runs the SAME rule-based engine on the copy. The
 * output shows which existing scoring factors would change.
 *
 * Never changed, never simulated: glucose, HbA1c, blood pressure, symptoms,
 * warning signs, history, age, height. GlucoCare does not model how those
 * would respond to a lifestyle change, so it does not pretend to.
 *
 * Nothing here is saved: these are pure functions over copies.
 */

import type { ActivityLevel, AssessmentData, DietPattern, SmokingStatus } from "../types/assessment";
import { emptyAssessment } from "../types/assessment";
import type { AssessmentInputs } from "../types/health";
import type { AssessmentResult, FactorId } from "../types/results";
import { runAssessment } from "./assessmentEngine";
import { calculateBMI } from "./bmi";
import { compareAssessments } from "./compare";
import type { AssessmentComparison } from "./compare";
import { validateField } from "./validation";

export const SCENARIO_LABEL = "Educational scenario - not a prediction.";
export const SCENARIO_DISCLAIMER =
  "This scenario represents an educational exploration and does not predict your actual future health outcome.";
export const LOCKED_MEASUREMENTS_NOTE =
  "Your recorded blood glucose, HbA1c and blood pressure are kept exactly as recorded. GlucoCare does not predict how they would change.";

/** The only inputs a scenario may change. */
export interface ScenarioChoice {
  activityLevel?: ActivityLevel;
  dietPattern?: DietPattern;
  smoking?: SmokingStatus;
  /** Hypothetical weight in kg (as typed). */
  weight?: string;
}

/** Fields a scenario is NEVER allowed to change (checked in tests). */
export const LOCKED_FIELDS = [
  "glucose", "glucoseContext", "hba1c", "systolic", "diastolic", "height",
  "symptoms", "otherSymptoms", "warningSigns", "age", "gender",
  "diabetesStatus", "diabetesType", "familyHistory", "otherConditions", "assessedOn",
] as const satisfies readonly (keyof AssessmentInputs)[];

export interface ScenarioChange {
  field: "activityLevel" | "dietPattern" | "smoking" | "weight";
  label: string;
  actual: string;
  scenario: string;
}

export interface ScenarioResult {
  baseline: AssessmentResult;
  hypothetical: AssessmentResult;
  comparison: AssessmentComparison;
  changes: ScenarioChange[];
  /** Plain-language lines, built only from the factor comparison. */
  explanation: string[];
  error: string | null;
}

const FIELD_LABEL: Record<ScenarioChange["field"], string> = {
  activityLevel: "Physical activity",
  dietPattern: "Usual eating pattern",
  smoking: "Smoking",
  weight: "Weight (hypothetical)",
};

const toData = (input: AssessmentInputs): AssessmentData => ({ ...emptyAssessment, ...input, name: "", locality: "", report: null });

/** Returns a NEW input with only the allowed fields changed. Never mutates. */
export function applyScenario(input: AssessmentInputs, choice: ScenarioChoice): AssessmentInputs {
  return {
    ...input,
    symptoms: [...input.symptoms],
    warningSigns: [...input.warningSigns],
    ...(choice.activityLevel !== undefined ? { activityLevel: choice.activityLevel } : {}),
    ...(choice.dietPattern !== undefined ? { dietPattern: choice.dietPattern } : {}),
    ...(choice.smoking !== undefined ? { smoking: choice.smoking } : {}),
    ...(choice.weight !== undefined ? { weight: choice.weight } : {}),
  };
}

/**
 * Runs a scenario. The baseline is the CURRENT rules applied to the actual
 * input, so the only difference shown is the one caused by the scenario.
 */
export function runScenario(input: AssessmentInputs, choice: ScenarioChoice): ScenarioResult {
  let error: string | null = null;
  const safeChoice = { ...choice };
  if (choice.weight !== undefined) {
    const msg = choice.weight.trim() === "" ? "Enter a weight." : validateField("weight", choice.weight);
    if (msg) {
      error = msg;
      delete safeChoice.weight;
    } else if (calculateBMI(input.height, choice.weight) === null) {
      error = "A height is needed to work out BMI. Add your height in an assessment first.";
      delete safeChoice.weight;
    }
  }

  const scenarioInput = applyScenario(input, safeChoice);
  const baseline = runAssessment(toData(input));
  const hypothetical = runAssessment(toData(scenarioInput));
  const comparison = compareAssessments({ result: baseline, input }, { result: hypothetical, input: scenarioInput });

  const changes: ScenarioChange[] = (["activityLevel", "dietPattern", "smoking", "weight"] as const)
    .filter((f) => scenarioInput[f] !== input[f])
    .map((f) => ({
      field: f,
      label: FIELD_LABEL[f],
      actual: (f === "weight" ? (input.weight ? `${input.weight} kg` : "") : input[f]) || "Not provided",
      scenario: f === "weight" ? `${scenarioInput.weight} kg` : scenarioInput[f] || "Not provided",
    }));

  return { baseline, hypothetical, comparison, changes, explanation: explainScenario(comparison, changes.length), error };
}

/** Sentences describe changes to the INDICATOR'S FACTORS - never to health. */
export function explainScenario(cmp: AssessmentComparison, changeCount: number): string[] {
  if (changeCount === 0) return ["No answers have been changed yet - this is your profile as recorded."];
  const lines: string[] = [];
  for (const f of cmp.changes) {
    const pts = (n: number) => `${n} ${n === 1 ? "point" : "points"}`;
    if (f.status === "removed") lines.push(`In this scenario, ${f.label} would no longer add ${pts(f.before?.points ?? 0)} to the indicator.`);
    else if (f.status === "added") lines.push(`In this scenario, ${f.label} would add ${pts(f.after?.points ?? 0)} to the indicator.`);
    else if (f.status === "increased" || f.status === "decreased") lines.push(`In this scenario, ${f.label} would add ${pts(f.after?.points ?? 0)} instead of ${pts(f.before?.points ?? 0)}.`);
  }
  if (lines.length === 0) lines.push("These changes do not affect any of the indicator's scoring factors.");
  lines.push(
    cmp.levelChanged
      ? `The educational indicator would be ${cmp.current.level} instead of ${cmp.previous.level} (score ${cmp.current.score} instead of ${cmp.previous.score}).`
      : `The educational indicator would stay ${cmp.current.level} (score ${cmp.current.score} instead of ${cmp.previous.score}).`,
  );
  return lines;
}

/** Factors a scenario can never move (measurements) - shown as "kept as recorded". */
export const UNTOUCHED_FACTORS: FactorId[] = ["glucose", "hba1c", "bloodPressure"];
