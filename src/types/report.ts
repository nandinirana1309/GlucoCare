/**
 * GlucoCare - medical report types (Stage 6)
 */

export const ACCEPTED_REPORT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

export const MAX_REPORT_SIZE_MB = 10;

export interface ReportFileInfo {
  name: string;
  sizeBytes: number;
  type: string;
}

/** Values a user can OPTIONALLY copy from their own report by hand (Stage 6). */
export interface ManualReportValues {
  glucose: string;
  hba1c: string;
  systolic: string;
  diastolic: string;
}

export type ReportExtractionStatus =
  | "not-implemented" // automatic reading is a Proposed Feature
  | "manual-entry"
  | "error";

export interface ReportExtractionResult {
  status: ReportExtractionStatus;
  message: string;
}
