/**
 * Health HISTORY context (Project-II, Phase 4) - saved, immutable records.
 * The current draft is a separate context (assessmentContext.ts).
 */

import { createContext } from "react";
import type { AssessmentData } from "../types/assessment";
import type {
  HealthHistory,
  MedicalReport,
  NewReport,
  StoredAssessment,
} from "../types/health";
import type { RepositoryMode } from "../services/health";

export type HistoryStatus = "loading" | "ready" | "error";

export type HealthHistoryContextValue = {
  mode: RepositoryMode;
  status: HistoryStatus;
  /** Plain-language load error (status "error"). */
  error: string | null;
  history: HealthHistory;
  refresh: () => Promise<void>;

  getAssessment: (id: string) => StoredAssessment | undefined;
  latest: StoredAssessment | null;
  /** Saves a completed draft. Idempotent on clientId. Throws on failure. */
  saveAssessment: (draft: AssessmentData, clientId: string) => Promise<StoredAssessment>;
  deleteAssessment: (id: string) => Promise<void>;
  saveReport: (report: NewReport) => Promise<MedicalReport>;
  deleteReport: (id: string) => Promise<void>;
  /** Deletes all history for this user (cloud rows or this device). */
  deleteMyData: () => Promise<void>;

  /** A pre-Project-II assessment that can be copied into history. */
  legacyAssessment: AssessmentData | null;
  migrateLegacy: (assessedOn: string) => Promise<StoredAssessment | null>;
  dismissLegacy: () => void;
};

export const HealthHistoryContext = createContext<HealthHistoryContextValue | null>(null);
