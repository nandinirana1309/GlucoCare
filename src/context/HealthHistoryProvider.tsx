/**
 * GlucoCare - health history provider (Project-II, Phase 4)
 * -------------------------------------------------------------
 * Loads the user's saved history from the HealthRepository (Supabase or this
 * device) and exposes save / delete actions. Every write goes through the
 * repository, then history is reloaded, so the UI always shows what is
 * actually stored.
 *
 * Read it with the useHealthHistory() hook.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { AssessmentData } from "../types/assessment";
import type { HealthHistory, NewReport } from "../types/health";
import { emptyHistory } from "../types/health";
import { runAssessment } from "../lib/assessmentEngine";
import {
  latestAssessment,
  sanitizeAssessmentInput,
  todayISO,
} from "../lib/healthRecords";
import { createHealthRepository, describeRepositoryError } from "../services/health";
import type { HealthRepository } from "../services/health";
import {
  dismissLegacyAssessment,
  findLegacyAssessment,
  migrateLegacyAssessment,
} from "../services/health/legacyMigration";
import { HealthHistoryContext } from "./healthHistoryContext";
import type { HealthHistoryContextValue, HistoryStatus } from "./healthHistoryContext";

export function HealthHistoryProvider({
  children,
  repository: injected,
}: {
  children: ReactNode;
  /** For tests; defaults to the configured repository. */
  repository?: HealthRepository;
}) {
  const [repository] = useState<HealthRepository>(() => injected ?? createHealthRepository());
  const [history, setHistory] = useState<HealthHistory>(emptyHistory);
  const [status, setStatus] = useState<HistoryStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [legacyAssessment, setLegacy] = useState<AssessmentData | null>(() => findLegacyAssessment());

  const refresh = useCallback(async () => {
    try {
      const loaded = await repository.loadHistory();
      setHistory(loaded);
      setError(null);
      setStatus("ready");
    } catch (e) {
      setError(describeRepositoryError(e));
      setStatus("error");
    }
  }, [repository]);

  // Initial load from the repository (an external system).
  useEffect(() => {
    let active = true;
    repository
      .loadHistory()
      .then((loaded) => {
        if (!active) return;
        setHistory(loaded);
        setError(null);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(describeRepositoryError(e));
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [repository]);

  const saveAssessment = useCallback<HealthHistoryContextValue["saveAssessment"]>(
    async (draft, clientId) => {
      const assessedOn = draft.assessedOn || todayISO();
      const stored = await repository.saveAssessment({
        clientId,
        assessedOn,
        input: sanitizeAssessmentInput({ ...draft, assessedOn }),
        result: runAssessment(draft),
      });
      await refresh();
      return stored;
    },
    [repository, refresh],
  );

  const deleteAssessment = useCallback(
    async (id: string) => {
      await repository.deleteAssessment(id);
      await refresh();
    },
    [repository, refresh],
  );

  const saveReport = useCallback(
    async (report: NewReport) => {
      const stored = await repository.saveReport(report);
      await refresh();
      return stored;
    },
    [repository, refresh],
  );

  const deleteReport = useCallback(
    async (id: string) => {
      await repository.deleteReport(id);
      await refresh();
    },
    [repository, refresh],
  );

  const deleteMyData = useCallback(async () => {
    await repository.deleteMyData();
    await refresh();
  }, [repository, refresh]);

  const migrateLegacy = useCallback(
    async (assessedOn: string) => {
      const stored = await migrateLegacyAssessment(repository, assessedOn);
      setLegacy(findLegacyAssessment());
      await refresh();
      return stored;
    },
    [repository, refresh],
  );

  const dismissLegacy = useCallback(() => {
    dismissLegacyAssessment();
    setLegacy(null);
  }, []);

  const value = useMemo<HealthHistoryContextValue>(
    () => ({
      mode: repository.mode,
      status,
      error,
      history,
      refresh,
      getAssessment: (id) => history.assessments.find((a) => a.id === id),
      latest: latestAssessment(history),
      saveAssessment,
      deleteAssessment,
      saveReport,
      deleteReport,
      deleteMyData,
      legacyAssessment,
      migrateLegacy,
      dismissLegacy,
    }),
    [repository.mode, status, error, history, refresh, saveAssessment, deleteAssessment, saveReport, deleteReport, deleteMyData, legacyAssessment, migrateLegacy, dismissLegacy],
  );

  return <HealthHistoryContext.Provider value={value}>{children}</HealthHistoryContext.Provider>;
}
