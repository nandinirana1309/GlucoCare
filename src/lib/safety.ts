/**
 * GlucoCare - safety layer
 * -------------------------------------------------------------
 * A deterministic check that answers ONE question: "does anything the user
 * entered suggest they may need prompt medical attention?"
 *
 * Design decisions (important for review / viva):
 *
 *  1. NO NEW THRESHOLDS. The conditions live in ONE place - the RULES list in
 *     src/lib/redFlags.ts - and this module calls checkRedFlags(). The safety
 *     layer adds structure (level, evidence, AI policy), never new medicine.
 *     Current rules, unchanged:
 *       glucose-very-high  glucose >= 300 mg/dL                      [R2]
 *       glucose-very-low   0 < glucose < 54 mg/dL (ADA level 2)       [R2]
 *       bp-crisis          systolic >= 180 OR diastolic >= 120 mmHg   [R3]
 *                          (either number alone is enough)
 *       warning-signs      any "serious warning sign" ticked
 *
 *  2. INDEPENDENT OF THE SCORE. It reads the raw input, not the concern
 *     score, so a score of 0 can still be urgent and a score of 18 with no
 *     red flag is not urgent.
 *
 *  3. NO LLM. Plain rules only - safety must not depend on generative AI.
 *
 *  4. AI POLICY. When the status is urgent, `aiAllowed` is false: the
 *     emergency guidance must not be diluted or contradicted by generated
 *     text. Callers must check `aiAllowed` before requesting an explanation.
 *
 *  5. NO DIAGNOSIS. Reasons say what was ENTERED ("the value entered is very
 *     high"), never what it means ("you have ...").
 */

import type { AssessmentData } from "../types/assessment";
import type { SafetyCategory, SafetyStatus, SafetyTrigger } from "../types/safety";
import { checkRedFlags } from "./redFlags";

// Types live in src/types (project convention); re-exported for convenience.
export type { SafetyCategory, SafetyLevel, SafetyStatus, SafetyTrigger } from "../types/safety";

/**
 * How each existing red-flag rule is described. Only labels and evidence
 * formatting live here - the matching thresholds stay in redFlags.ts.
 */
export const SAFETY_RULE_INFO: Record<
  string,
  {
    category: SafetyCategory;
    sourceFields: (keyof AssessmentData)[];
    evidence: (data: AssessmentData) => string;
  }
> = {
  "glucose-very-high": {
    category: "glucose-high",
    sourceFields: ["glucose"],
    evidence: (d) => `Blood glucose entered: ${d.glucose.trim()} mg/dL`,
  },
  "glucose-very-low": {
    category: "glucose-low",
    sourceFields: ["glucose"],
    evidence: (d) => `Blood glucose entered: ${d.glucose.trim()} mg/dL`,
  },
  "bp-crisis": {
    category: "blood-pressure",
    sourceFields: ["systolic", "diastolic"],
    evidence: (d) =>
      `Blood pressure entered: ${d.systolic.trim() || "--"}/${d.diastolic.trim() || "--"} mmHg`,
  },
  "warning-signs": {
    category: "warning-sign",
    sourceFields: ["warningSigns"],
    evidence: (d) => `Warning signs reported: ${d.warningSigns.join(", ")}`,
  },
};

/** Evaluate the safety rules for one assessment. Pure and deterministic. */
export function evaluateSafety(data: AssessmentData): SafetyStatus {
  const triggers: SafetyTrigger[] = checkRedFlags(data).map((flag) => {
    const info = SAFETY_RULE_INFO[flag.id];
    // A rule without description info still counts as urgent - fail safe.
    return {
      ruleId: flag.id,
      category: info?.category ?? "warning-sign",
      reason: flag.reason,
      evidence: info ? info.evidence(data) : flag.reason,
      sourceFields: info?.sourceFields ?? [],
    };
  });

  const isUrgent = triggers.length > 0;

  return {
    level: isUrgent ? "urgent" : "normal",
    isUrgent,
    triggeredRules: triggers.map((t) => t.ruleId),
    reasons: triggers.map((t) => t.reason),
    triggers,
    aiAllowed: !isUrgent,
  };
}
