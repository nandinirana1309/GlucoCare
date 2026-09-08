import { useContext } from "react";
import { AssessmentContext } from "../context/assessmentContext";
import type { AssessmentContextValue } from "../context/assessmentContext";

/** Read the shared assessment. Throws if used outside <AssessmentProvider>. */
export function useAssessment(): AssessmentContextValue {
  const context = useContext(AssessmentContext);
  if (!context) {
    throw new Error("useAssessment must be used inside an <AssessmentProvider>");
  }
  return context;
}
