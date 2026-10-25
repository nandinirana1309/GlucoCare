/**
 * GlucoCare - safety status types
 * -------------------------------------------------------------
 * Produced by evaluateSafety() in src/lib/safety.ts and carried on every
 * AssessmentResult as `result.safety` - the ONE authoritative safety
 * evaluation the UI and AI gate read from.
 */

import type { AssessmentData } from "./assessment";

export type SafetyLevel = "normal" | "urgent";

export type SafetyCategory =
  | "glucose-high"
  | "glucose-low"
  | "blood-pressure"
  | "warning-sign";

/** One rule that matched, with the input that made it match. */
export interface SafetyTrigger {
  ruleId: string;
  category: SafetyCategory;
  /** Plain-language reason from the rule (never a diagnosis). */
  reason: string;
  /** What the user entered that matched, e.g. "Blood glucose entered: 320 mg/dL". */
  evidence: string;
  /** The AssessmentData fields the rule reads - for traceability. */
  sourceFields: (keyof AssessmentData)[];
}

export interface SafetyStatus {
  level: SafetyLevel;
  isUrgent: boolean;
  /** Rule ids that matched, in rule order. */
  triggeredRules: string[];
  /** Reasons for those rules, same order. */
  reasons: string[];
  /** Full detail for each matched rule. */
  triggers: SafetyTrigger[];
  /** False whenever the status is urgent - AI explanations are blocked. */
  aiAllowed: boolean;
}
