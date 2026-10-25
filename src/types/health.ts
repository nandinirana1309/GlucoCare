/**
 * GlucoCare - health history model (Project-II, Phase 3)
 * -------------------------------------------------------------
 * The CURRENT DRAFT is an AssessmentData (types/assessment.ts), edited by the
 * form. HISTORY is made of the immutable records below, written only by a
 * HealthRepository (services/health/).
 *
 * Privacy rules built into these shapes:
 *  - StoredAssessment.input never contains name, locality or report filename.
 *  - MedicalReport stores metadata only - never the file or its raw text.
 *  - ExtractedValueRecord keeps no value for rejected candidates.
 */

import type { AssessmentData, GlucoseContext } from "./assessment";
import type { AssessmentResult } from "./results";

export type { GlucoseContext } from "./assessment";

/** One measurable quantity. Blood pressure is two kinds (systolic, diastolic). */
export type MeasurementKind =
  | "glucose"
  | "hba1c"
  | "systolic"
  | "diastolic"
  | "height"
  | "weight"
  | "bmi";

export const MEASUREMENT_KINDS: readonly MeasurementKind[] = [
  "glucose",
  "hba1c",
  "systolic",
  "diastolic",
  "height",
  "weight",
  "bmi",
];

/** Canonical unit stored for each kind. */
export const MEASUREMENT_UNITS: Record<MeasurementKind, string> = {
  glucose: "mg/dL",
  hba1c: "%",
  systolic: "mmHg",
  diastolic: "mmHg",
  height: "cm",
  weight: "kg",
  bmi: "kg/m2",
};

export const MEASUREMENT_LABELS: Record<MeasurementKind, string> = {
  glucose: "Blood glucose",
  hba1c: "HbA1c",
  systolic: "Systolic BP",
  diastolic: "Diastolic BP",
  height: "Height",
  weight: "Weight",
  bmi: "BMI",
};

/** Where a measurement came from. */
export type MeasurementSource = "assessment" | "report";

/**
 * How much the value has been checked by the user.
 *  manual            - typed into the assessment form
 *  calculated        - derived by GlucoCare (BMI from height + weight)
 *  report_confirmed  - extracted from a report, accepted unchanged by the user
 *  report_edited     - extracted from a report, corrected by the user
 *  report_added      - typed by the user while reviewing a report
 * Unreviewed or rejected extractions NEVER become measurements.
 */
export type VerificationStatus =
  | "manual"
  | "calculated"
  | "report_confirmed"
  | "report_edited"
  | "report_added";

export interface Measurement {
  id: string;
  kind: MeasurementKind;
  value: number;
  unit: string;
  /** Date the value refers to (yyyy-mm-dd). */
  measuredOn: string;
  /** When the record was created (ISO timestamp). */
  recordedAt: string;
  glucoseContext?: GlucoseContext;
  source: MeasurementSource;
  verification: VerificationStatus;
  assessmentId?: string;
  reportId?: string;
}

/** A measurement before it is saved (ids/timestamps assigned by the repository). */
export type NewMeasurement = Omit<Measurement, "id" | "recordedAt" | "assessmentId" | "reportId">;

/** The assessment input as stored in history - no identifying fields. */
export type AssessmentInputs = Omit<AssessmentData, "name" | "locality" | "report">;

/** An immutable, completed assessment. */
export interface StoredAssessment {
  id: string;
  /** Stable client id - saving the same assessment twice returns this record. */
  clientId: string;
  /** When it was saved (ISO timestamp). */
  createdAt: string;
  /** Date the values refer to (yyyy-mm-dd). */
  assessedOn: string;
  engineVersion: string;
  input: AssessmentInputs;
  /** Frozen engine output at save time. Never recalculated. */
  result: AssessmentResult;
}

export interface NewAssessment {
  clientId: string;
  assessedOn: string;
  input: AssessmentInputs;
  result: AssessmentResult;
}

/* ------------------------------------------------------------------ */
/*  Medical reports (Phase 8 fills these in)                           */
/* ------------------------------------------------------------------ */

export type ReportFileType = "pdf" | "png" | "jpeg";
export type ExtractionMethod = "pdf_text" | "ocr" | "mixed" | "manual_only";
export type ExtractionConfidence = "high" | "medium" | "low";
/** The user's decision on one extracted candidate ("added" = user typed it). */
export type ReviewStatus = "confirmed" | "edited" | "rejected" | "added";

export interface ExtractedValueRecord {
  id: string;
  kind: MeasurementKind;
  /** The label that matched in the report, e.g. "HbA1c" - not the whole line. */
  matchedLabel?: string;
  /** Null for rejected or user-added values. */
  extractedValue: number | null;
  extractedUnit?: string;
  confidence: ExtractionConfidence;
  status: ReviewStatus;
  /** The value that entered history (null when rejected). */
  finalValue: number | null;
  glucoseContext?: GlucoseContext;
}

export type NewExtractedValue = Omit<ExtractedValueRecord, "id">;

export interface MedicalReport {
  id: string;
  clientId: string;
  createdAt: string;
  label: string;
  /** Date of the report (yyyy-mm-dd), confirmed by the user. */
  reportDate: string;
  fileType: ReportFileType;
  pageCount?: number;
  extractionMethod: ExtractionMethod;
  parserVersion: string;
  values: ExtractedValueRecord[];
}

export interface NewReport {
  clientId: string;
  label: string;
  reportDate: string;
  fileType: ReportFileType;
  pageCount?: number;
  extractionMethod: ExtractionMethod;
  parserVersion: string;
  values: NewExtractedValue[];
}

/* ------------------------------------------------------------------ */

export interface HealthHistory {
  /** Oldest first (by assessedOn, then createdAt). */
  assessments: StoredAssessment[];
  /** Oldest first (by measuredOn, then recordedAt). */
  measurements: Measurement[];
  /** Newest first (by reportDate, then createdAt). */
  reports: MedicalReport[];
}

export const emptyHistory: HealthHistory = {
  assessments: [],
  measurements: [],
  reports: [],
};
