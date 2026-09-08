/**
 * GlucoCare - assessment provider
 * -------------------------------------------------------------
 * Holds the one shared "current assessment" for the whole app.
 *
 *  - Loads any saved assessment on start.
 *  - Auto-saves every change (a half-finished assessment survives a refresh)
 *    BUT never creates a saved record for a blank assessment, so the
 *    "No assessment found" screen on /results still works.
 *  - `submit()` saves and (Stage 7) pushes a copy to Supabase if configured.
 *
 * Read it with the useAssessment() hook (src/hooks/useAssessment.ts).
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

import type { AssessmentData } from "../types/assessment";
import { emptyAssessment, normalizeAssessment } from "../types/assessment";
import {
  clearAssessment,
  loadAssessment,
  saveAssessment,
} from "../services/storageService";
import { syncAssessment } from "../services/syncService";
import { AssessmentContext } from "./assessmentContext";
import type { AssessmentContextValue } from "./assessmentContext";

function computeHasStarted(data: AssessmentData): boolean {
  return Boolean(
    data.name ||
      data.age ||
      data.glucose ||
      data.hba1c ||
      data.systolic ||
      data.weight ||
      data.symptoms.length > 0 ||
      data.warningSigns.length > 0 ||
      data.locality,
  );
}

export function AssessmentProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AssessmentData>(
    () => loadAssessment() ?? emptyAssessment,
  );

  useEffect(() => {
    if (computeHasStarted(data)) {
      saveAssessment(data);
    }
  }, [data]);

  const update = useCallback((patch: Partial<AssessmentData>) => {
    setData((previous) => ({ ...previous, ...patch }));
  }, []);

  const replace = useCallback((next: AssessmentData) => {
    setData(normalizeAssessment(next));
  }, []);

  const reset = useCallback(() => {
    clearAssessment();
    setData(emptyAssessment);
  }, []);

  const submit = useCallback(() => {
    setData((current) => {
      saveAssessment(current);
      void syncAssessment(current); // no-op unless Supabase is configured
      return current;
    });
  }, []);

  const value: AssessmentContextValue = {
    data,
    update,
    replace,
    reset,
    submit,
    hasStarted: computeHasStarted(data),
  };

  return (
    <AssessmentContext.Provider value={value}>
      {children}
    </AssessmentContext.Provider>
  );
}
