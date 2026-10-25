/**
 * GlucoCare - trend analysis (Phase 6)
 * -------------------------------------------------------------
 * Deterministic description of how RECORDED values changed. Three tiers are
 * always kept separate in the output and the UI:
 *   1. observation     - what the recorded numbers did (always present)
 *   2. interpretation  - which EXISTING reference range the first / latest
 *                        value falls in (src/data/referenceRanges.ts), or null
 *   3. not a diagnosis - a fixed statement added by the UI
 *
 * Rules (by number of valid measurements):
 *   0  -> no trend available
 *   1  -> insufficient data
 *   2  -> only "changed from X to Y" is described (no trend word)
 *   3+ -> a direction may be described:
 *           increasing - every step up or equal, and last > first
 *           decreasing - every step down or equal, and last < first
 *           stable     - all values equal
 *           mixed      - values went both up and down
 *
 * NO new thresholds: direction depends only on the sign of each step
 * (values compared at their display precision). No prediction, no
 * extrapolation, no "progression" language.
 *
 * Glucose readings taken in different contexts (fasting / random / after a
 * meal / unknown) are NOT comparable, so glucose is analysed per context.
 * The fasting reference range is only used for fasting readings.
 */

import type {
  GlucoseContext,
  Measurement,
  MeasurementKind,
  MeasurementSource,
  VerificationStatus,
} from "../types/health";
import { MEASUREMENT_UNITS } from "../types/health";
import { BMI_REFERENCE, GLUCOSE_REFERENCE, HBA1C_REFERENCE, classify } from "../data/referenceRanges";
import type { ReferenceRange } from "../data/referenceRanges";
import { formatDate, formatNumber } from "./format";
import { sortMeasurements } from "./healthRecords";

export type TrendDirection =
  | "none" // 0 points
  | "insufficient" // 1 point
  | "changed-up" // 2 points
  | "changed-down"
  | "unchanged"
  | "increasing" // 3+ points
  | "decreasing"
  | "stable"
  | "mixed";

export interface TrendPoint {
  date: string;
  value: number;
  source: MeasurementSource;
  verification: VerificationStatus;
  glucoseContext?: GlucoseContext;
}

export interface TrendSummary {
  kind: MeasurementKind;
  label: string;
  unit: string;
  /** Set for glucose: the single context this summary covers. */
  context?: GlucoseContext;
  points: TrendPoint[];
  direction: TrendDirection;
  /** Tier 1 - what the recorded values did. */
  observation: string;
  /** Tier 2 - reference-range position of first/latest value, or null. */
  interpretation: string | null;
  caveats: string[];
}

/** Values are compared at display precision (1 decimal) so float noise is ignored. */
const round1 = (n: number) => Math.round(n * 10) / 10;

export function trendDirection(values: number[]): TrendDirection {
  const v = values.map(round1);
  if (v.length === 0) return "none";
  if (v.length === 1) return "insufficient";
  const first = v[0];
  const last = v[v.length - 1];
  if (v.length === 2) return last > first ? "changed-up" : last < first ? "changed-down" : "unchanged";

  let ups = 0;
  let downs = 0;
  for (let i = 1; i < v.length; i++) {
    if (v[i] > v[i - 1]) ups++;
    else if (v[i] < v[i - 1]) downs++;
  }
  if (ups === 0 && downs === 0) return "stable";
  if (downs === 0 && last > first) return "increasing";
  if (ups === 0 && last < first) return "decreasing";
  return "mixed";
}

function toPoint(m: Measurement): TrendPoint {
  return {
    date: m.measuredOn,
    value: m.value,
    source: m.source,
    verification: m.verification,
    ...(m.glucoseContext ? { glucoseContext: m.glucoseContext } : {}),
  };
}

/** Reference range used for tier-2 interpretation, if any exists for this kind/context. */
function referenceFor(kind: MeasurementKind, context?: GlucoseContext): ReferenceRange | null {
  if (kind === "hba1c") return HBA1C_REFERENCE;
  if (kind === "bmi") return BMI_REFERENCE;
  // The glucose reference is a FASTING reference - never applied to other readings.
  if (kind === "glucose" && context === "fasting") return GLUCOSE_REFERENCE;
  return null; // blood pressure is classified on both numbers together; weight/height have none
}

function interpretation(kind: MeasurementKind, points: TrendPoint[], context?: GlucoseContext): string | null {
  const ref = referenceFor(kind, context);
  if (!ref || points.length === 0) return null;
  const lastBand = classify(ref, points[points.length - 1].value).statusText.toLowerCase();
  if (points.length === 1) return `This value is ${lastBand} ${ref.citation}.`;
  const firstBand = classify(ref, points[0].value).statusText.toLowerCase();
  return firstBand === lastBand
    ? `Both the earliest and the latest values are ${lastBand} ${ref.citation}.`
    : `The earliest value was ${firstBand}; the latest is ${lastBand} ${ref.citation}.`;
}

function observation(label: string, unit: string, points: TrendPoint[], direction: TrendDirection): string {
  const fmt = (p: TrendPoint) => `${formatNumber(p.value)} ${unit}`;
  const n = points.length;
  const first = points[0];
  const last = points[n - 1];
  const span = n >= 2 ? ` (${fmt(first)} on ${formatDate(first.date)} to ${fmt(last)} on ${formatDate(last.date)})` : "";

  switch (direction) {
    case "none":
      return `No ${label} values recorded yet.`;
    case "insufficient":
      return `One ${label} value recorded (${fmt(first)} on ${formatDate(first.date)}). At least two are needed to see a change, and three to describe a trend.`;
    case "changed-up":
      return `Your recorded ${label} was higher in the second of your two measurements${span}.`;
    case "changed-down":
      return `Your recorded ${label} was lower in the second of your two measurements${span}.`;
    case "unchanged":
      return `Your recorded ${label} was the same in both measurements (${fmt(last)}).`;
    case "increasing":
      return `Your recorded ${label} values increased across your ${n} measurements${span}.`;
    case "decreasing":
      return `Your recorded ${label} values decreased across your ${n} measurements${span}.`;
    case "stable":
      return `Your recorded ${label} stayed at ${fmt(last)} across your ${n} measurements.`;
    case "mixed":
      return `Your recorded ${label} values went both up and down across your ${n} measurements${span}.`;
  }
}

/** Labels as used inside sentences ("Your recorded HbA1c ..."). */
const SENTENCE_LABEL: Record<MeasurementKind, string> = {
  glucose: "blood glucose",
  hba1c: "HbA1c",
  systolic: "systolic blood pressure",
  diastolic: "diastolic blood pressure",
  height: "height",
  weight: "weight",
  bmi: "BMI",
};

const CONTEXT_PREFIX: Record<GlucoseContext, string> = {
  fasting: "fasting",
  random: "random",
  post_meal: "after-meal",
  unknown: "context-not-recorded",
};

function summarise(kind: MeasurementKind, points: TrendPoint[], context?: GlucoseContext): TrendSummary {
  const label = context ? `${CONTEXT_PREFIX[context]} ${SENTENCE_LABEL[kind]}` : SENTENCE_LABEL[kind];
  const unit = MEASUREMENT_UNITS[kind];
  const direction = trendDirection(points.map((p) => p.value));
  const caveats: string[] = [];
  if (kind === "glucose" && context === "unknown" && points.length > 0) {
    caveats.push("It was not recorded whether these glucose readings were fasting, so they are kept separate and not compared with a reference range.");
  }
  if (kind === "bmi") {
    caveats.push("BMI is a general screen and does not measure body composition.");
  }
  return {
    kind,
    label,
    unit,
    ...(context ? { context } : {}),
    points,
    direction,
    observation: observation(label, unit, points, direction),
    interpretation: interpretation(kind, points, context),
    caveats,
  };
}

/** Trend summary for one non-glucose kind. */
export function analyseKind(measurements: Measurement[], kind: Exclude<MeasurementKind, "glucose">): TrendSummary {
  const points = sortMeasurements(measurements.filter((m) => m.kind === kind)).map(toPoint);
  return summarise(kind, points);
}

const CONTEXT_ORDER: GlucoseContext[] = ["fasting", "random", "post_meal", "unknown"];

/**
 * Glucose is analysed SEPARATELY per context. Returns one summary per context
 * that has data (or a single "none" summary when there is no glucose at all).
 */
export function analyseGlucose(measurements: Measurement[]): { summaries: TrendSummary[]; mixedContexts: boolean } {
  const glucose = sortMeasurements(measurements.filter((m) => m.kind === "glucose"));
  const contexts = CONTEXT_ORDER.filter((c) => glucose.some((m) => (m.glucoseContext ?? "unknown") === c));
  if (contexts.length === 0) return { summaries: [summarise("glucose", [])], mixedContexts: false };
  return {
    summaries: contexts.map((c) =>
      summarise("glucose", glucose.filter((m) => (m.glucoseContext ?? "unknown") === c).map(toPoint), c),
    ),
    mixedContexts: contexts.length > 1,
  };
}

export type ChartRow = { date: string } & Record<string, number | string | undefined>;

/**
 * Rows for a chart with one line per series, e.g. systolic + diastolic:
 * [{ date, systolic: 128, diastolic: 82 }, ...]. Readings of different series
 * on the same date share a row; a second reading of the SAME series on that
 * date gets its own row, so every recorded value stays visible.
 */
export function toChartRows(series: Record<string, TrendPoint[]>): ChartRow[] {
  const rows: ChartRow[] = [];
  for (const [key, points] of Object.entries(series)) {
    for (const p of points) {
      const row = rows.find((r) => r.date === p.date && r[key] === undefined);
      // `${key}__v` carries the verification status for the tooltip / dot style.
      if (row) Object.assign(row, { [key]: p.value, [`${key}__v`]: p.verification });
      else rows.push({ date: p.date, [key]: p.value, [`${key}__v`]: p.verification });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Every trend summary (glucose per context + the other kinds). */
export function analyseAll(measurements: Measurement[]): TrendSummary[] {
  return [
    ...analyseGlucose(measurements).summaries,
    analyseKind(measurements, "hba1c"),
    analyseKind(measurements, "systolic"),
    analyseKind(measurements, "diastolic"),
    analyseKind(measurements, "weight"),
    analyseKind(measurements, "bmi"),
  ];
}
