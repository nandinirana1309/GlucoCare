import { useCallback } from "react";
import { useAssessment } from "./useAssessment";
import { useHealthHistory } from "./useHealthHistory";

/**
 * One "delete everything" action used by every "Clear my data" button, so
 * they all behave the same: delete the saved history (cloud or this device)
 * AND the assessment in progress. Asks for confirmation first.
 *
 * Resolves to true when data was deleted, false when the user cancelled.
 * Throws a RepositoryError if the history could not be deleted (the draft is
 * then left untouched so nothing is half-deleted silently).
 */
export function useClearAllData(): () => Promise<boolean> {
  const { reset } = useAssessment();
  const { deleteMyData, mode } = useHealthHistory();

  return useCallback(async () => {
    const where =
      mode === "supabase"
        ? "your saved health history in the GlucoCare database"
        : "your saved health history on this device";
    if (!window.confirm(`This permanently deletes ${where} and the assessment in progress. Continue?`)) {
      return false;
    }
    await deleteMyData();
    reset();
    return true;
  }, [deleteMyData, mode, reset]);
}
