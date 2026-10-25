/**
 * GlucoCare - assessment (draft) provider
 * -------------------------------------------------------------
 * Holds the CURRENT DRAFT assessment the form edits.
 *
 *  - Loads any saved draft on start.
 *  - Auto-saves every change to this device (a half-finished assessment
 *    survives a refresh) BUT never creates a saved record for a blank draft.
 *  - Completed assessments are NOT kept here: the Assessment page saves them
 *    to history through HealthHistoryProvider, then calls startNewDraft().
 *    (Project-II, Phase 4 - this replaces the old fire-and-forget Supabase
 *    sync, which could insert the same assessment twice.)
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
import { newId } from "../lib/healthRecords";
import { AssessmentContext } from "./assessmentContext";
import type { AssessmentContextValue } from "./assessmentContext";

const DRAFT_ID_KEY = "glucocare-draft-id";

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

function loadDraftId(): string {
  try {
    const existing = localStorage.getItem(DRAFT_ID_KEY);
    if (existing) return existing;
    const id = newId();
    localStorage.setItem(DRAFT_ID_KEY, id);
    return id;
  } catch {
    return newId(); // storage unavailable - id lives for this session only
  }
}

function storeDraftId(id: string): void {
  try {
    localStorage.setItem(DRAFT_ID_KEY, id);
  } catch {
    // ignore
  }
}

/** Fields carried into the next draft (profile + lifestyle). Measurements,
 *  symptoms, warning signs and the date always start blank. */
function carryOver(previous: AssessmentData): AssessmentData {
  return {
    ...emptyAssessment,
    name: previous.name,
    age: previous.age,
    gender: previous.gender,
    diabetesStatus: previous.diabetesStatus,
    diabetesType: previous.diabetesType,
    familyHistory: previous.familyHistory,
    otherConditions: previous.otherConditions,
    activityLevel: previous.activityLevel,
    smoking: previous.smoking,
    dietPattern: previous.dietPattern,
    sleepHours: previous.sleepHours,
    locality: previous.locality,
  };
}

export function AssessmentProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AssessmentData>(
    () => loadAssessment() ?? emptyAssessment,
  );
  const [draftId, setDraftId] = useState<string>(loadDraftId);

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
    const id = newId();
    storeDraftId(id);
    setDraftId(id);
  }, []);

  const startNewDraft = useCallback(() => {
    setData((previous) => carryOver(previous));
    const id = newId();
    storeDraftId(id);
    setDraftId(id);
  }, []);

  const value: AssessmentContextValue = {
    data,
    update,
    replace,
    reset,
    draftId,
    startNewDraft,
    hasStarted: computeHasStarted(data),
  };

  return (
    <AssessmentContext.Provider value={value}>
      {children}
    </AssessmentContext.Provider>
  );
}
