/**
 * GlucoCare - AI explanation types (Stage 8)
 */

import type { AssessmentResult } from "./results";
import type { AssessmentData } from "./assessment";

export type AiStatus = "not-configured" | "ok" | "error";

export interface AiExplanation {
  status: AiStatus;
  /** Short, plain-language summary of the results (no diagnosis). */
  summary: string;
  /** Explanations of any medical terms that appeared. */
  termNotes: { term: string; meaning: string }[];
  /** General, non-prescriptive lifestyle suggestions. */
  suggestions: string[];
  /** What kind of professional the user might consider seeing. */
  whoToSee: string;
  /** Always present - reminds the user this is not medical advice. */
  disclaimer: string;
  /** Set when status is "error". */
  errorMessage?: string;
}

export interface AiExplanationRequest {
  result: AssessmentResult;
  /** Only non-identifying fields are sent - see aiService.ts. */
  context: Pick<
    AssessmentData,
    | "age"
    | "gender"
    | "diabetesStatus"
    | "familyHistory"
    | "activityLevel"
    | "smoking"
    | "dietPattern"
    | "symptoms"
  >;
}
