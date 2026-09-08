/**
 * GlucoCare - result model
 * -------------------------------------------------------------
 * The output of `runAssessment()` in src/lib/assessmentEngine.ts.
 * Pages read this - they never re-calculate anything themselves.
 *
 * IMPORTANT: none of this is a diagnosis. `concernLevel` is an educational
 * indicator built from reference criteria, described as such in the UI.
 */

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

export interface AssessmentResult {
  generatedAt: string;
  /** Bumped when the scoring rules change (stored with saved results later). */
  engineVersion: string;

  concernLevel: ConcernLevel;
  concernScore: number;
  concernSummary: string;

  indicators: IndicatorResult[];
  riskFactors: RiskFactor[];
  redFlags: RedFlag[];
  recommendations: Recommendation[];

  /** True when at least one real measurement or symptom was entered. */
  hasUsableInput: boolean;
}
