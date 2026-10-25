/**
 * GlucoCare - medical report file checks
 * -------------------------------------------------------------
 * First line of validation for an uploaded report (declared type + size).
 * The content is then checked by magic bytes and read entirely in the
 * browser by services/reportExtractionService.ts (Project-II, Phase 8),
 * which replaced the earlier "not implemented" stub.
 */

import {
  ACCEPTED_REPORT_TYPES,
  MAX_REPORT_SIZE_MB,
} from "../types/report";

export function validateReportFile(file: File): string {
  const typeOk = (ACCEPTED_REPORT_TYPES as readonly string[]).includes(file.type);
  if (!typeOk) {
    return "Unsupported file type. Please upload a PDF, PNG or JPG file.";
  }
  if (file.size === 0) {
    return "This file is empty.";
  }
  if (file.size > MAX_REPORT_SIZE_MB * 1024 * 1024) {
    return `File is too large. Maximum size is ${MAX_REPORT_SIZE_MB} MB.`;
  }
  return "";
}
