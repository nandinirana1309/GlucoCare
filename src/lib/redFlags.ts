/**
 * Red-flag checks.
 * -------------------------------------------------------------
 * If any rule matches, the Results page shows the red "seek medical care"
 * banner. These rules are deliberately conservative and are NOT a diagnosis -
 * every `reason` is phrased as "this may need prompt attention", never
 * "you have X".
 *
 * Thresholds are commonly published safety reference points:
 *   - very high glucose (>= 300 mg/dL) [R2]
 *   - very low glucose (< 54 mg/dL), the ADA "level 2 hypoglycaemia" mark [R2]
 *   - blood pressure >= 180/120 mmHg, the ACC/AHA "hypertensive crisis" mark [R3]
 *   - any serious warning sign the user ticked
 */

import type { AssessmentData } from "../types/assessment";
import type { RedFlag } from "../types/results";

type Rule = {
  id: string;
  test: (d: AssessmentData, n: ParsedNumbers) => boolean;
  reason: string;
};

interface ParsedNumbers {
  glucose: number | null;
  systolic: number | null;
  diastolic: number | null;
}

function toNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const RULES: Rule[] = [
  {
    id: "glucose-very-high",
    test: (_d, n) => n.glucose !== null && n.glucose >= 300,
    reason:
      "The blood glucose value entered is very high (300 mg/dL or above).",
  },
  {
    id: "glucose-very-low",
    test: (_d, n) => n.glucose !== null && n.glucose > 0 && n.glucose < 54,
    reason:
      "The blood glucose value entered is very low (below 54 mg/dL).",
  },
  {
    id: "bp-crisis",
    test: (_d, n) =>
      (n.systolic !== null && n.systolic >= 180) ||
      (n.diastolic !== null && n.diastolic >= 120),
    reason:
      "The blood pressure value entered is very high (180/120 mmHg or above).",
  },
  {
    id: "warning-signs",
    test: (d) => d.warningSigns.length > 0,
    reason: "You reported one or more serious warning signs.",
  },
];

export function checkRedFlags(data: AssessmentData): RedFlag[] {
  const numbers: ParsedNumbers = {
    glucose: toNumber(data.glucose),
    systolic: toNumber(data.systolic),
    diastolic: toNumber(data.diastolic),
  };

  return RULES.filter((rule) => rule.test(data, numbers)).map((rule) => ({
    id: rule.id,
    reason: rule.reason,
  }));
}
