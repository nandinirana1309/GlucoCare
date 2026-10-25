/**
 * The React context object + its value type.
 * Kept in its own (component-free) file so that AssessmentProvider.tsx only
 * exports a component and hooks/useAssessment.ts only exports a hook - this
 * keeps React Fast Refresh working cleanly.
 *
 * This context holds ONLY the current DRAFT. Saved history lives in
 * HealthHistoryContext (Project-II, Phase 4).
 */

import { createContext } from "react";
import type { AssessmentData } from "../types/assessment";

export type AssessmentContextValue = {
  data: AssessmentData;
  update: (patch: Partial<AssessmentData>) => void;
  replace: (next: AssessmentData) => void;
  /** Deletes the draft from this device and starts a blank one. */
  reset: () => void;
  /**
   * Stable id of this draft, used as the client id when it is saved to
   * history - so saving the same draft twice cannot create a duplicate.
   */
  draftId: string;
  /**
   * Called after the draft has been saved to history: keeps profile and
   * lifestyle answers for convenience, clears measurements / symptoms / date
   * (so old readings are never re-saved as new ones) and issues a new draftId.
   */
  startNewDraft: () => void;
  /** True once the user has entered anything meaningful. */
  hasStarted: boolean;
};

export const AssessmentContext = createContext<AssessmentContextValue | null>(
  null,
);
