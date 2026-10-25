/**
 * GlucoCare - medical report file constraints.
 * Report records and extracted values are in types/health.ts (Phase 8).
 */

export const ACCEPTED_REPORT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

export const MAX_REPORT_SIZE_MB = 10;
