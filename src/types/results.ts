/**
 * GlucoCare - result model
 * -------------------------------------------------------------
 * The output of `runAssessment()` in src/lib/assessmentEngine.ts.
 * Pages read this - they never re-calculate anything themselves.
 *
 * IMPORTANT: none of this is a diagnosis. `concernLevel` is an educational
 * indicator built from reference criteria, described as such in the UI.
 */

import type { SafetyStatus } from "./safety";

export type IndicatorKey = "glucose" | "hba1c" | "bloodPressure" | "bmi";

export type IndicatorRating =
  | "not-provided"
  | "within-reference"
  | "borderline"
  | "above-reference"
  | "below-reference";

export interface IndicatorResult {
  key: IndicatorKey;
  label: string;
  /** Display value, e.g. "150" or "135/85" or "28.7". */
  value: string;
  unit: string;
  rating: IndicatorRating;
  /** Short plain-language status, e.g. "Elevated compared with reference range". */
  statusText: string;
  /** The reference criteria used, for the "what this means" section. */
  referenceText: string;
  /** Citation placeholder, e.g. "[R1]". */
  citation: string;
}

export type ConcernLevel = "Low" | "Moderate" | "High";

export interface RiskFactor {
  label: string;
  detail: string;
}

export interface RedFlag {
  id: string;
  /** Plain-language reason - never names a condition. */
  reason: string;
}

export interface Recommendation {
  id: string;
  icon: string; // lucide icon name
  title: string;
  detail: string;
}

/* ------------------------------------------------------------------ */
/*  Explainable score (engine 1.1.0)                                   */
/* ------------------------------------------------------------------ */

/** One entry per scoring rule in the engine - see SCORING_RULES. */
export type FactorId =
  | "glucose"
  | "hba1c"
  | "bloodPressure"
  | "bmi"
  | "symptoms"
  | "familyHistory"
  | "diabetesStatus"
  | "age"
  | "activity"
  | "smoking"
  | "diet";

export type FactorCategory =
  | "measurement"
  | "symptom"
  | "history"
  | "demographic"
  | "lifestyle";

/**
 * How much a factor contributed, for display only. Assigned per scoring band
 * in the engine (not a clinical grading): "none" = 0 points.
 */
export type FactorSeverity = "none" | "mild" | "moderate" | "high";

/**
 * Where the value behind a factor came from. Today every value is typed into
 * the assessment form; report-based values are added in a later phase.
 */
export type FactorProvenance = "assessment-form";

/**
 * One line of the explainable score. Every field is derived from the user's
 * input and the engine's existing rules - nothing is inferred.
 */
export interface ScoreFactor {
  id: FactorId;
  label: string;
  category: FactorCategory;
  /** False when the input was left blank (or could not be used). */
  provided: boolean;
  /** The value as the user entered it, e.g. "6.8 %", or null if not provided. */
  displayValue: string | null;
  /** The AssessmentData fields this factor reads - for traceability. */
  sourceFields: string[];
  points: number;
  maxPoints: number;
  severity: FactorSeverity;
  /** Stable id of the rule/band that matched, e.g. "hba1c.gte-6.5". */
  ruleId: string;
  /** Plain-language reason for the points (or for scoring 0). */
  reason: string;
  /** Reference citation, where the engine already has one. */
  citation?: string;
  /** Present when `provided` is true. */
  provenance?: FactorProvenance;
}

/** Why the concern level is what it is. */
export type LevelBasis =
  | {
      type: "score";
      thresholds: { moderate: number; high: number };
    }
  | {
      type: "red-flag";
      thresholds: { moderate: number; high: number };
      /** The red-flag rules that forced "High". */
      ruleIds: string[];
      /** The level the score alone would have given. */
      scoreLevel: ConcernLevel;
    };

export interface AssessmentResult {
  generatedAt: string;
  /** Bumped when the scoring rules change (stored with saved results later). */
  engineVersion: string;

  concernLevel: ConcernLevel;
  /** Always equal to the sum of `factors[].points`. */
  concernScore: number;
  /** Highest score the rules can produce (sum of `factors[].maxPoints`). */
  maxScore: number;
  concernSummary: string;
  /** The explainable breakdown of `concernScore` - one entry per rule. */
  factors: ScoreFactor[];
  levelBasis: LevelBasis;
  /**
   * The ONE authoritative safety evaluation (src/lib/safety.ts). Evaluated
   * from the raw input, independently of the score. The UI and the AI gate
   * read this - they never re-check red flags themselves.
   */
  safety: SafetyStatus;

  indicators: IndicatorResult[];
  riskFactors: RiskFactor[];
  /** Kept for backward compatibility - derived from `safety.triggers`. */
  redFlags: RedFlag[];
  recommendations: Recommendation[];

  /** True when at least one real measurement or symptom was entered. */
  hasUsableInput: boolean;

  /**
   * Set only on results copied from the Stage-7 database (engine 1.0.0),
   * which have no factor breakdown. Such results are shown as stored and are
   * never recalculated.
   */
  legacy?: boolean;
}
