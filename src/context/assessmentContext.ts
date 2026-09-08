/**
 * The React context object + its value type.
 * Kept in its own (component-free) file so that AssessmentProvider.tsx only
 * exports a component and hooks/useAssessment.ts only exports a hook - this
 * keeps React Fast Refresh working cleanly.
 */

import { createContext } from "react";
import type { AssessmentData } from "../types/assessment";

export type AssessmentContextValue = {
  data: AssessmentData;
  update: (patch: Partial<AssessmentData>) => void;
  replace: (next: AssessmentData) => void;
  reset: () => void;
  submit: () => void;
  /** True once the user has entered anything meaningful. */
  hasStarted: boolean;
};

export const AssessmentContext = createContext<AssessmentContextValue | null>(
  null,
);
