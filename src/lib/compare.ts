/**
 * GlucoCare - "What changed?" comparison (Phase 7)
 * -------------------------------------------------------------
 * Deterministic comparison of two assessments, built ONLY from what was
 * stored with each one (its input and frozen result). It never re-runs the
 * engine on an old assessment, never uses AI, and never invents a reason:
 * every line points at a stored factor or input field.
 *
 * If the two results were produced by different engine versions, that is
 * reported (engineVersionDiffers) - the old result is still NOT recalculated.
 */

import type { AssessmentInputs } from "../types/health";
import type {
  AssessmentResult,
  ConcernLevel,
  FactorCategory,
  FactorId,
  ScoreFactor,
} from "../types/results";
import { daysBetween } from "./format";

/** Anything with a stored result can be compared (saved assessments, scenarios). */
export interface ComparableAssessment {
  id?: string;
  assessedOn?: string;
  input?: AssessmentInputs;
  result: AssessmentResult;
}

export interface FactorSide {
  provided: boolean;
  displayValue: string | null;
  points: number;
  reason: string;
}

export type FactorChangeStatus =
  | "added" // 0 points before -> points now (newly contributing)
  | "removed" // points before -> 0 now (no longer contributing)
  | "increased" // contributed both times, more points now
  | "decreased" // contributed both times, fewer points now
  | "value-changed" // same points, different recorded value
  | "unchanged";

export interface FactorChange {
  id: FactorId;
  label: string;
  category: FactorCategory;
  before: FactorSide | null; // null if the factor did not exist in that result
  after: FactorSide | null;
  pointChange: number;
  status: FactorChangeStatus;
  /** Whether the input went from not provided -> provided or the reverse. */
  providedChange: "newly-provided" | "no-longer-provided" | null;
}

export type SafetyChange = "became-urgent" | "no-longer-urgent" | "still-urgent" | "normal-both";

export interface AssessmentSummaryRef {
  id?: string;
  assessedOn?: string;
  engineVersion: string;
  level: ConcernLevel;
  score: number;
  maxScore: number;
  urgent: boolean;
}

export interface AssessmentComparison {
  previous: AssessmentSummaryRef;
  current: AssessmentSummaryRef;
  scoreChange: number;
  levelChanged: boolean;
  safety: {
    change: SafetyChange;
    rulesAdded: string[];
    rulesRemoved: string[];
    reasonsAdded: string[];
  };
  /** Factors whose points or recorded value changed, biggest point change first. */
  changes: FactorChange[];
  unchanged: FactorChange[];
  /** Symptom / warning-sign names added or removed (from stored input). */
  inputChanges: {
    symptomsAdded: string[];
    symptomsRemoved: string[];
    warningSignsAdded: string[];
    warningSignsRemoved: string[];
  };
  engineVersionDiffers: boolean;
  /** False when either result has no factor breakdown (older engine). */
  breakdownAvailable: boolean;
  daysBetween: number | null;
}

function side(f: ScoreFactor | undefined): FactorSide | null {
  return f ? { provided: f.provided, displayValue: f.displayValue, points: f.points, reason: f.reason } : null;
}

function statusOf(before: FactorSide | null, after: FactorSide | null): FactorChangeStatus {
  const b = before?.points ?? 0;
  const a = after?.points ?? 0;
  if (b === 0 && a > 0) return "added";
  if (b > 0 && a === 0) return "removed";
  if (a > b) return "increased";
  if (a < b) return "decreased";
  if ((before?.displayValue ?? null) !== (after?.displayValue ?? null)) return "value-changed";
  return "unchanged";
}

function ref(x: ComparableAssessment): AssessmentSummaryRef {
  return {
    id: x.id,
    assessedOn: x.assessedOn,
    engineVersion: x.result.engineVersion,
    level: x.result.concernLevel,
    score: x.result.concernScore,
    maxScore: x.result.maxScore,
    urgent: x.result.safety.isUrgent,
  };
}

const diff = (a: string[] = [], b: string[] = []) => b.filter((x) => !a.includes(x));

export function compareAssessments(
  previous: ComparableAssessment,
  current: ComparableAssessment,
): AssessmentComparison {
  const p = previous.result;
  const c = current.result;

  // Factor ids in a stable order: current engine's order, then any extra old ones.
  const ids: FactorId[] = [...c.factors.map((f) => f.id)];
  for (const f of p.factors) if (!ids.includes(f.id)) ids.push(f.id);

  const all: FactorChange[] = ids.map((id) => {
    const bf = p.factors.find((f) => f.id === id);
    const af = c.factors.find((f) => f.id === id);
    const before = side(bf);
    const after = side(af);
    const providedChange =
      before && after && before.provided !== after.provided
        ? after.provided
          ? "newly-provided"
          : "no-longer-provided"
        : null;
    return {
      id,
      label: (af ?? bf)!.label,
      category: (af ?? bf)!.category,
      before,
      after,
      pointChange: (after?.points ?? 0) - (before?.points ?? 0),
      status: statusOf(before, after),
      providedChange,
    };
  });

  const changes = all
    .filter((x) => x.status !== "unchanged")
    .sort((a, b) => Math.abs(b.pointChange) - Math.abs(a.pointChange));

  const pu = p.safety.isUrgent;
  const cu = c.safety.isUrgent;
  const rulesAdded = diff(p.safety.triggeredRules, c.safety.triggeredRules);

  return {
    previous: ref(previous),
    current: ref(current),
    scoreChange: c.concernScore - p.concernScore,
    levelChanged: c.concernLevel !== p.concernLevel,
    safety: {
      change: pu && cu ? "still-urgent" : cu ? "became-urgent" : pu ? "no-longer-urgent" : "normal-both",
      rulesAdded,
      rulesRemoved: diff(c.safety.triggeredRules, p.safety.triggeredRules),
      reasonsAdded: c.safety.triggers.filter((t) => rulesAdded.includes(t.ruleId)).map((t) => t.reason),
    },
    changes,
    unchanged: all.filter((x) => x.status === "unchanged"),
    inputChanges: {
      symptomsAdded: diff(previous.input?.symptoms, current.input?.symptoms),
      symptomsRemoved: diff(current.input?.symptoms, previous.input?.symptoms),
      warningSignsAdded: diff(previous.input?.warningSigns, current.input?.warningSigns),
      warningSignsRemoved: diff(current.input?.warningSigns, previous.input?.warningSigns),
    },
    engineVersionDiffers: p.engineVersion !== c.engineVersion,
    breakdownAvailable: p.factors.length > 0 && c.factors.length > 0,
    daysBetween:
      previous.assessedOn && current.assessedOn ? daysBetween(previous.assessedOn, current.assessedOn) : null,
  };
}

/**
 * Plain-language lines describing the comparison. Each line is built from
 * stored values only - no reasons are added that are not in the data.
 */
export function describeComparison(cmp: AssessmentComparison): string[] {
  const lines: string[] = [];
  const s = cmp.scoreChange;
  lines.push(
    s === 0
      ? `The score stayed at ${cmp.current.score}.`
      : `The score went from ${cmp.previous.score} to ${cmp.current.score} (${s > 0 ? "+" : ""}${s}).`,
  );
  lines.push(
    cmp.levelChanged
      ? `The concern indicator changed from ${cmp.previous.level} to ${cmp.current.level}.`
      : `The concern indicator stayed ${cmp.current.level}.`,
  );
  if (cmp.safety.change === "became-urgent") lines.push("A safety warning is present in the newer assessment that was not in the earlier one.");
  if (cmp.safety.change === "no-longer-urgent") lines.push("The earlier assessment had a safety warning; the newer one does not.");
  if (cmp.safety.change === "still-urgent") lines.push("Both assessments include a safety warning.");

  for (const f of cmp.changes) {
    const before = f.before?.displayValue ?? "not provided";
    const after = f.after?.displayValue ?? "not provided";
    const pts = f.pointChange === 0 ? "no change in points" : `${f.pointChange > 0 ? "+" : ""}${f.pointChange} ${Math.abs(f.pointChange) === 1 ? "point" : "points"}`;
    lines.push(`${f.label}: ${before} → ${after} (${pts}).`);
  }
  if (cmp.engineVersionDiffers) {
    lines.push(
      `These assessments were scored by different GlucoCare engine versions (${cmp.previous.engineVersion} and ${cmp.current.engineVersion}); each is shown as originally recorded.`,
    );
  }
  return lines;
}
