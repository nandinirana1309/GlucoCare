/**
 * GlucoCare - AI explanation types (Stage 8)
 */

import type { AssessmentResult } from "./results";
import type { AssessmentData } from "./assessment";

/**
 * "blocked-by-safety": the assessment's safety status is urgent, so no
 * explanation is requested at all (Phase 2 safety gate).
 */
export type AiStatus = "not-configured" | "ok" | "error" | "blocked-by-safety";

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

/* ================================================================== */
/*  AI v2 - evidence-based explanation (Project-II, Phase 9)           */
/* ================================================================== */

/**
 * The ONLY data sent to the AI. Built by lib/aiEvidence.ts from the
 * deterministic engine's output. No name, locality, report text, file name,
 * free text or exact dates. The AI explains this - it never recalculates it.
 */
export interface AiEvidence {
  task: "explain-assessment";
  promptVersion: "2.0";
  assessment: {
    concernLevel: "Low" | "Moderate" | "High";
    levelBasis: "score" | "red-flag";
    score: number;
    maxScore: number;
    thresholds: { moderate: number; high: number };
  };
  factors: {
    id: string;
    label: string;
    category: string;
    provided: boolean;
    value: string | null;
    points: number;
    maxPoints: number;
    reason: string;
  }[];
  safety: { urgent: boolean };
  /** Factor changes since the previous assessment (null if none). */
  changes: { factorId: string; label: string; before: string | null; after: string | null; pointChange: number }[] | null;
  /** Observed trends only (no dates, no interpretation). */
  trends: { measurement: string; direction: string; count: number; first: number; latest: number; unit: string }[];
  context: {
    ageBand: string | null;
    sex: string | null;
    diabetesStatus: string | null;
    diabetesType: string | null;
    familyHistory: string | null;
    activityLevel: string | null;
    smoking: string | null;
    dietPattern: string | null;
    /** Only names from GlucoCare's fixed symptom checklist. */
    symptoms: string[];
  };
}

/** Structured AI response (after validation by lib/aiGuard.ts). */
export interface AiExplanationContent {
  summary: string;
  factorExplanations: { factorId: string; text: string }[];
  changeExplanation: string | null;
  generalTips: string[];
  questionsForClinician: string[];
  terms: { term: string; meaning: string }[];
}

export type AiV2Status =
  | "passed" // every part passed the guard
  | "sanitized" // some sentences were removed by the guard
  | "blocked" // the guard rejected the response - nothing is shown
  | "blocked-by-safety" // urgent safety status - AI never called
  | "not-configured"
  | "error";

export interface AiGuardIssue {
  field: string;
  rule:
    | "invalid-shape"
    | "safety-urgent"
    | "invented-factor"
    | "invented-number"
    | "wrong-level"
    | "wrong-score"
    | "contradicts-evidence"
    | "diagnosis"
    | "medication"
    | "guarantee-or-prediction"
    | "false-reassurance";
  text: string;
}

export interface AiExplanationV2 {
  status: AiV2Status;
  content: AiExplanationContent | null;
  issues: AiGuardIssue[];
  disclaimer: string;
  errorMessage?: string;
}
