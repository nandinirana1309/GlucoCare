import { useContext } from "react";
import { HealthHistoryContext } from "../context/healthHistoryContext";
import type { HealthHistoryContextValue } from "../context/healthHistoryContext";

/** Saved health history (Project-II). Must be used inside <HealthHistoryProvider>. */
export function useHealthHistory(): HealthHistoryContextValue {
  const ctx = useContext(HealthHistoryContext);
  if (!ctx) {
    throw new Error("useHealthHistory must be used inside <HealthHistoryProvider>");
  }
  return ctx;
}
