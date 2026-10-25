/**
 * GlucoCare - Health Journey helpers (Phase 5)
 * -------------------------------------------------------------
 * Pure functions that summarise saved history for the dashboard. They only
 * count, sort and pick from stored records - nothing is inferred or
 * recalculated, and no medical interpretation is added here.
 */

import type {
  HealthHistory,
  Measurement,
  MeasurementKind,
  StoredAssessment,
  VerificationStatus,
} from "../types/health";
import { MEASUREMENT_KINDS } from "../types/health";
import type { FactorId } from "../types/results";
import { daysBetween } from "./format";

/** The most recent measurement of each kind (by date, then save time). */
export function latestByKind(measurements: Measurement[]): Partial<Record<MeasurementKind, Measurement>> {
  const out: Partial<Record<MeasurementKind, Measurement>> = {};
  for (const m of measurements) {
    const current = out[m.kind];
    if (
      !current ||
      m.measuredOn > current.measuredOn ||
      (m.measuredOn === current.measuredOn && m.recordedAt > current.recordedAt)
    ) {
      out[m.kind] = m;
    }
  }
  return out;
}

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  manual: "Entered by you",
  calculated: "Calculated",
  report_confirmed: "From report - confirmed",
  report_edited: "From report - edited by you",
  report_added: "From report - added by you",
};

/* ------------------------------------------------------------------ */

export type TimelineEvent =
  | { type: "assessment"; date: string; sortKey: string; assessment: StoredAssessment }
  | { type: "report"; date: string; sortKey: string; reportId: string; label: string; valueCount: number };

/** Assessments and reports merged into one list, newest first. */
export function buildTimeline(history: HealthHistory): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...history.assessments.map((a) => ({
      type: "assessment" as const,
      date: a.assessedOn,
      sortKey: `${a.assessedOn}|${a.createdAt}`,
      assessment: a,
    })),
    ...history.reports.map((r) => ({
      type: "report" as const,
      date: r.reportDate,
      sortKey: `${r.reportDate}|${r.createdAt}`,
      reportId: r.id,
      label: r.label,
      valueCount: r.values.filter((v) => v.status !== "rejected").length,
    })),
  ];
  return events.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

/** Groups timeline events by month ("2026-09"), newest month first. */
export function groupByMonth(events: TimelineEvent[]): { month: string; events: TimelineEvent[] }[] {
  const groups: { month: string; events: TimelineEvent[] }[] = [];
  for (const e of events) {
    const month = e.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.events.push(e);
    else groups.push({ month, events: [e] });
  }
  return groups;
}

/* ------------------------------------------------------------------ */

export interface FactorFrequency {
  id: FactorId;
  label: string;
  /** Number of assessments (with a breakdown) where this factor added points. */
  contributed: number;
  /** Number of assessments that have a factor breakdown. */
  total: number;
  /** Points it added in the latest assessment (0 if none). */
  latestPoints: number;
}

/**
 * How often each factor added points across saved assessments.
 * Legacy results without a breakdown are excluded from the counts.
 */
export function factorFrequency(assessments: StoredAssessment[]): FactorFrequency[] {
  const withFactors = assessments.filter((a) => a.result.factors.length > 0);
  const latest = withFactors[withFactors.length - 1];
  const map = new Map<FactorId, FactorFrequency>();

  for (const a of withFactors) {
    for (const f of a.result.factors) {
      const entry = map.get(f.id) ?? { id: f.id, label: f.label, contributed: 0, total: 0, latestPoints: 0 };
      entry.total += 1;
      if (f.points > 0) entry.contributed += 1;
      map.set(f.id, entry);
    }
  }
  if (latest) {
    for (const f of latest.result.factors) {
      const entry = map.get(f.id);
      if (entry) entry.latestPoints = f.points;
    }
  }
  return [...map.values()]
    .filter((f) => f.contributed > 0)
    .sort((a, b) => b.contributed - a.contributed || b.latestPoints - a.latestPoints || a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------------ */

export interface JourneyStats {
  assessmentCount: number;
  reportCount: number;
  measurementCount: number;
  /** Measurements typed or confirmed/edited/added by the user (all of them, by design). */
  userVerifiedCount: number;
  /** Days since the latest assessment's date (null if none). */
  daysSinceLatest: number | null;
  firstDate: string | null;
  lastDate: string | null;
}

export function journeyStats(history: HealthHistory, today: string): JourneyStats {
  const dates = [
    ...history.assessments.map((a) => a.assessedOn),
    ...history.reports.map((r) => r.reportDate),
  ].sort();
  const latest = history.assessments[history.assessments.length - 1];
  return {
    assessmentCount: history.assessments.length,
    reportCount: history.reports.length,
    measurementCount: history.measurements.length,
    userVerifiedCount: history.measurements.filter((m) => m.verification !== "calculated").length,
    daysSinceLatest: latest ? daysBetween(latest.assessedOn, today) : null,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
  };
}

/** Kinds in display order that have at least one measurement. */
export function kindsWithData(measurements: Measurement[]): MeasurementKind[] {
  const present = new Set(measurements.map((m) => m.kind));
  return MEASUREMENT_KINDS.filter((k) => present.has(k));
}
