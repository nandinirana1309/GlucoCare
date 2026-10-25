/**
 * GlucoCare - HealthRepository (Phase 3)
 * -------------------------------------------------------------
 * The ONE interface the app uses to read and write health history.
 *
 *     UI / HealthHistoryProvider
 *                │
 *         HealthRepository
 *           ┌────┴─────┐
 *   LocalRepository  SupabaseRepository
 *     localStorage     Supabase Postgres (+ Row Level Security)
 *
 * Rules every implementation follows:
 *  - saveAssessment / saveReport are IDEMPOTENT on clientId: saving the same
 *    record twice returns the first one, never a duplicate.
 *  - Saved records are immutable - there is no update method.
 *  - Errors are thrown as RepositoryError with a code the UI can explain.
 *
 * The draft assessment is NOT stored here - it stays in AssessmentProvider.
 */

import type {
  HealthHistory,
  MedicalReport,
  NewAssessment,
  NewReport,
  StoredAssessment,
} from "../../types/health";

export type RepositoryMode = "local" | "supabase";

export interface HealthRepository {
  readonly mode: RepositoryMode;
  loadHistory(): Promise<HealthHistory>;
  saveAssessment(assessment: NewAssessment): Promise<StoredAssessment>;
  deleteAssessment(id: string): Promise<void>;
  saveReport(report: NewReport): Promise<MedicalReport>;
  deleteReport(id: string): Promise<void>;
  /** Deletes every history record belonging to the current user. */
  deleteMyData(): Promise<void>;
}

export type RepositoryErrorCode =
  | "storage-unavailable" // localStorage blocked (private mode, policy)
  | "storage-full" // localStorage quota exceeded
  | "network" // could not reach Supabase
  | "auth" // could not obtain a (anonymous) session
  | "rate-limited" // the database service asked us to slow down (HTTP 429)
  | "invalid" // the record failed validation / a database check
  | "unknown";

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(code: RepositoryErrorCode, message: string) {
    super(message);
    this.name = "RepositoryError";
    this.code = code;
  }
}

/** Plain-language explanation of an error for the UI. */
export function describeRepositoryError(error: unknown): string {
  if (error instanceof RepositoryError) {
    switch (error.code) {
      case "storage-unavailable":
        return "Your browser is blocking local storage (for example in private mode), so history cannot be saved on this device.";
      case "storage-full":
        return "Your browser's storage for this site is full, so the record could not be saved.";
      case "network":
        return "Could not reach the GlucoCare database. Check your connection and try again.";
      case "auth":
        return "Could not start a secure session with the GlucoCare database. Please try again.";
      case "rate-limited":
        return "The GlucoCare database is receiving too many requests from this network right now. Please wait a few minutes and try again.";
      case "invalid":
        return `The record could not be saved: ${error.message}`;
      default:
        return error.message || "Something went wrong while saving your data.";
    }
  }
  return error instanceof Error ? error.message : "Something went wrong while saving your data.";
}
