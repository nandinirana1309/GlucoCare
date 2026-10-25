/**
 * GlucoCare - health record helpers (Phase 3)
 * -------------------------------------------------------------
 * Pure functions that turn a completed draft or a reviewed report into the
 * records a HealthRepository stores. Both repositories (local + Supabase)
 * use these, so they always store exactly the same thing.
 */

import type { AssessmentData } from "../types/assessment";
import type { AssessmentResult } from "../types/results";
import type {
  AssessmentInputs,
  HealthHistory,
  Measurement,
  MeasurementKind,
  MedicalReport,
  NewExtractedValue,
  NewMeasurement,
  StoredAssessment,
  VerificationStatus,
} from "../types/health";
import { MEASUREMENT_UNITS } from "../types/health";
import { validateField } from "./validation";
import type { ValidatableField } from "./validation";
import { calculateBMI } from "./bmi";

/** Free-text fields are capped so history cannot grow without bound. */
export const FREE_TEXT_LIMIT = 500;

/* ------------------------------------------------------------------ */
/*  Dates and ids                                                      */
/* ------------------------------------------------------------------ */

/** Today's date in the user's local time zone, as yyyy-mm-dd. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** True for a real calendar date in yyyy-mm-dd form. */
export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Validates the "date of these values" field. "" means today and is valid.
 * Returns an error message or "".
 */
export function validateRecordDate(value: string, today: string = todayISO()): string {
  if (value.trim() === "") return "";
  if (!isValidISODate(value)) return "Enter a valid date.";
  if (value > today) return "The date cannot be in the future.";
  if (value < "1900-01-01") return "Enter a date after 1900.";
  return "";
}

/** A random UUID (v4). Uses crypto.randomUUID where available. */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* ------------------------------------------------------------------ */
/*  Assessment -> history                                              */
/* ------------------------------------------------------------------ */

/**
 * The assessment input as it may be stored: identifying fields removed
 * (name, locality, report filename) and free text capped.
 */
export function sanitizeAssessmentInput(data: AssessmentData): AssessmentInputs {
  // Destructure the identifying fields out so they can never be stored.
  const { name: _name, locality: _locality, report: _report, ...rest } = data;
  return {
    ...rest,
    otherConditions: rest.otherConditions.slice(0, FREE_TEXT_LIMIT),
    otherSymptoms: rest.otherSymptoms.slice(0, FREE_TEXT_LIMIT),
    symptoms: [...rest.symptoms],
    warningSigns: [...rest.warningSigns],
  };
}

function plausibleNumber(field: ValidatableField, raw: string): number | null {
  if (raw.trim() === "") return null;
  if (validateField(field, raw)) return null; // outside plausible entry range
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * The measurements a completed assessment contributes to history.
 * Only plausible values are included; blood pressure only as a pair;
 * BMI only when height and weight are both present (marked "calculated").
 */
export function measurementsFromAssessment(
  input: AssessmentInputs,
  assessedOn: string,
): NewMeasurement[] {
  const out: NewMeasurement[] = [];
  const add = (kind: MeasurementKind, value: number, verification: VerificationStatus = "manual") =>
    out.push({
      kind,
      value,
      unit: MEASUREMENT_UNITS[kind],
      measuredOn: assessedOn,
      source: "assessment",
      verification,
      ...(kind === "glucose" ? { glucoseContext: input.glucoseContext || "unknown" } : {}),
    });

  const glucose = plausibleNumber("glucose", input.glucose);
  if (glucose !== null) add("glucose", glucose);

  const hba1c = plausibleNumber("hba1c", input.hba1c);
  if (hba1c !== null) add("hba1c", hba1c);

  const systolic = plausibleNumber("systolic", input.systolic);
  const diastolic = plausibleNumber("diastolic", input.diastolic);
  if (systolic !== null && diastolic !== null) {
    add("systolic", systolic);
    add("diastolic", diastolic);
  }

  const height = plausibleNumber("height", input.height);
  if (height !== null) add("height", height);

  const weight = plausibleNumber("weight", input.weight);
  if (weight !== null) add("weight", weight);

  if (height !== null && weight !== null) {
    const bmi = calculateBMI(height, weight);
    if (bmi !== null) add("bmi", bmi, "calculated");
  }

  return out;
}

/* ------------------------------------------------------------------ */
/*  Reviewed report -> history                                         */
/* ------------------------------------------------------------------ */

const REVIEW_TO_VERIFICATION = {
  confirmed: "report_confirmed",
  edited: "report_edited",
  added: "report_added",
} as const;

/**
 * Only values the user confirmed, edited or added become measurements.
 * Rejected values never do.
 */
export function measurementsFromReport(
  values: NewExtractedValue[],
  reportDate: string,
): { valueIndex: number; measurement: NewMeasurement }[] {
  const out: { valueIndex: number; measurement: NewMeasurement }[] = [];
  values.forEach((v, valueIndex) => {
    if (v.status === "rejected" || v.finalValue === null) return;
    out.push({
      valueIndex,
      measurement: {
        kind: v.kind,
        value: v.finalValue,
        unit: MEASUREMENT_UNITS[v.kind],
        measuredOn: reportDate,
        source: "report",
        verification: REVIEW_TO_VERIFICATION[v.status],
        ...(v.kind === "glucose" ? { glucoseContext: v.glucoseContext ?? "unknown" } : {}),
      },
    });
  });
  return out;
}

/** Rejected values are kept for the audit trail but without their number. */
export function minimiseExtractedValue(v: NewExtractedValue): NewExtractedValue {
  if (v.status !== "rejected") return v;
  return { ...v, extractedValue: null, finalValue: null };
}

/* ------------------------------------------------------------------ */
/*  Stored results from older engines                                  */
/* ------------------------------------------------------------------ */

/**
 * Makes a stored result safe to render. Results saved by engine >= 1.1.0
 * pass through unchanged. Results copied from the Stage-7 tables (engine
 * 1.0.0) lack the factor breakdown / safety object; the missing parts are
 * filled with EMPTY placeholders and `legacy: true` - the stored score and
 * level are kept exactly as they were, never recalculated.
 */
export function normalizeStoredResult(result: AssessmentResult): AssessmentResult {
  const hasFactors = Array.isArray(result.factors) && result.factors.length > 0;
  const basisOk =
    result.levelBasis &&
    (result.levelBasis.type === "score" || result.levelBasis.type === "red-flag") &&
    result.levelBasis.thresholds;
  const safetyOk = result.safety && Array.isArray(result.safety.triggers);
  if (hasFactors && basisOk && safetyOk) return result;

  const redFlags = Array.isArray(result.redFlags) ? result.redFlags : [];
  const urgent = redFlags.length > 0 || Boolean(result.safety?.isUrgent);
  return {
    ...result,
    legacy: true,
    factors: hasFactors ? result.factors : [],
    maxScore: result.maxScore ?? 18,
    levelBasis: basisOk ? result.levelBasis : { type: "score", thresholds: { moderate: 3, high: 6 } },
    safety: safetyOk
      ? result.safety
      : {
          level: urgent ? "urgent" : "normal",
          isUrgent: urgent,
          triggeredRules: redFlags.map((f) => f.id),
          reasons: redFlags.map((f) => f.reason),
          triggers: redFlags.map((f) => ({
            ruleId: f.id,
            category: "warning-sign" as const,
            reason: f.reason,
            evidence: "Recorded by an earlier version of GlucoCare.",
            sourceFields: [],
          })),
          aiAllowed: !urgent,
        },
    redFlags,
    indicators: Array.isArray(result.indicators) ? result.indicators : [],
    riskFactors: Array.isArray(result.riskFactors) ? result.riskFactors : [],
    recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
  };
}

/* ------------------------------------------------------------------ */
/*  Ordering                                                           */
/* ------------------------------------------------------------------ */

export function sortAssessments(list: StoredAssessment[]): StoredAssessment[] {
  return [...list].sort(
    (a, b) => a.assessedOn.localeCompare(b.assessedOn) || a.createdAt.localeCompare(b.createdAt),
  );
}

export function sortMeasurements(list: Measurement[]): Measurement[] {
  return [...list].sort(
    (a, b) => a.measuredOn.localeCompare(b.measuredOn) || a.recordedAt.localeCompare(b.recordedAt),
  );
}

export function sortReports(list: MedicalReport[]): MedicalReport[] {
  return [...list].sort(
    (a, b) => b.reportDate.localeCompare(a.reportDate) || b.createdAt.localeCompare(a.createdAt),
  );
}

export function sortHistory(h: HealthHistory): HealthHistory {
  return {
    assessments: sortAssessments(h.assessments),
    measurements: sortMeasurements(h.measurements),
    reports: sortReports(h.reports),
  };
}

/** Latest saved assessment, or null. */
export function latestAssessment(h: HealthHistory): StoredAssessment | null {
  return h.assessments.length ? h.assessments[h.assessments.length - 1] : null;
}
