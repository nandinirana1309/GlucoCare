/**
 * GlucoCare - storage service
 * -------------------------------------------------------------
 * The ONLY place in the app that reads/writes the assessment in localStorage.
 * Stage 7 adds an optional Supabase sync ON TOP of this (local-first: the
 * browser copy always works offline, the database is a backup).
 *
 * Everything is wrapped in try/catch because localStorage throws in private
 * mode or when full - in that case we behave as if nothing was saved.
 */

import type { AssessmentData } from "../types/assessment";
import { ASSESSMENT_STORAGE_KEY, normalizeAssessment } from "../types/assessment";

/** Load the saved assessment, or `null` if nothing valid is stored. */
export function loadAssessment(): AssessmentData | null {
  try {
    const raw = localStorage.getItem(ASSESSMENT_STORAGE_KEY);
    if (!raw) return null;
    return normalizeAssessment(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Save the assessment, replacing any previous value. */
export function saveAssessment(data: AssessmentData): void {
  try {
    localStorage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable or full - ignore
  }
}

/** Delete the saved assessment (used by "Clear my data"). */
export function clearAssessment(): void {
  try {
    localStorage.removeItem(ASSESSMENT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** True if there is a saved assessment to read. */
export function hasAssessment(): boolean {
  return loadAssessment() !== null;
}
