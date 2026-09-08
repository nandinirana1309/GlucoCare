/**
 * GlucoCare - medical report service (Stage 6)
 * -------------------------------------------------------------
 * Automatic reading of uploaded reports (OCR / value extraction) is a
 * PROPOSED FEATURE and is intentionally NOT faked here.
 *
 * What works today:
 *   - validateReportFile(): checks type and size before accepting a file
 *   - extractReport(): always returns status "not-implemented" with an honest
 *     message. The Assessment page then offers OPTIONAL manual entry, where the
 *     user copies values from their own report.
 *
 * When automatic extraction is built, it will run in a Supabase Edge Function
 * (server-side, so uploaded documents are not processed in the browser) and
 * this function's body is the only thing that changes.
 */

import type { ReportExtractionResult } from "../types/report";
import {
  ACCEPTED_REPORT_TYPES,
  MAX_REPORT_SIZE_MB,
} from "../types/report";

export function validateReportFile(file: File): string {
  const typeOk = (ACCEPTED_REPORT_TYPES as readonly string[]).includes(file.type);
  if (!typeOk) {
    return "Unsupported file type. Please upload a PDF, PNG or JPG file.";
  }
  if (file.size > MAX_REPORT_SIZE_MB * 1024 * 1024) {
    return `File is too large. Maximum size is ${MAX_REPORT_SIZE_MB} MB.`;
  }
  return "";
}

export async function extractReport(_file: File): Promise<ReportExtractionResult> {
  return {
    status: "not-implemented",
    message:
      "Automatic reading of medical reports is a planned feature and is not available yet. Your file has been attached to this assessment. You can optionally type any values from it below.",
  };
}
