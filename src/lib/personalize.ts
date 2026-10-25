/**
 * GlucoCare - personalised education ranking (Phase 10)
 * -------------------------------------------------------------
 *   USER DATA -> ASSESSMENT -> RELEVANT FACTORS -> CONTENT MATCHING -> ORDER
 *
 * Deterministic: the same result always gives the same order. Content is the
 * fixed library in data/educationLibrary.ts; only the ORDER changes.
 *
 * Score of an item =
 *     sum of the points of every contributing factor whose topics overlap
 *     the item's tags
 *   + 1 for each measurement whose recorded values increased (3+ readings)
 *     and that overlaps the item's tags
 *   + 100 if the safety status is urgent and the item is about urgent care
 * Ties: basePriority, then id. Items scoring 0 are general reading.
 * Every positive score comes with "because" lines quoting the user's data.
 */

import type { AssessmentResult, FactorId } from "../types/results";
import type { EducationItem, EducationTag } from "../data/educationLibrary";
import { EDUCATION_LIBRARY } from "../data/educationLibrary";
import type { TrendSummary } from "./trends";

/** Which education topics each scoring factor relates to. */
export const FACTOR_TOPICS: Record<FactorId, EducationTag[]> = {
  glucose: ["glucose"],
  hba1c: ["hba1c"],
  bloodPressure: ["blood-pressure"],
  bmi: ["bmi", "nutrition", "activity"],
  symptoms: ["symptoms"],
  familyHistory: ["family-history"],
  diabetesStatus: ["monitoring", "clinician"],
  age: ["clinician"],
  activity: ["activity"],
  smoking: ["smoking"],
  diet: ["nutrition"],
};

const TREND_TOPICS: Partial<Record<TrendSummary["kind"], EducationTag>> = {
  glucose: "glucose",
  hba1c: "hba1c",
  systolic: "blood-pressure",
  diastolic: "blood-pressure",
  weight: "bmi",
  bmi: "bmi",
};

export interface RankedItem {
  item: EducationItem;
  score: number;
  /** True when the item was ranked up by the user's own data. */
  personalised: boolean;
  /** Plain-language reasons, each traceable to a factor, trend or safety rule. */
  because: string[];
}

const overlaps = (a: EducationTag[], b: EducationTag[]) => a.some((t) => b.includes(t));

export function rankEducation(
  result: AssessmentResult | null,
  trends: TrendSummary[] = [],
  library: EducationItem[] = EDUCATION_LIBRARY,
): RankedItem[] {
  const contributing = result ? result.factors.filter((f) => f.points > 0) : [];
  const rising = trends.filter((t) => t.direction === "increasing");

  return library
    .map((item) => {
      let score = 0;
      const because: string[] = [];

      if (result?.safety.isUrgent && item.tags.includes("safety")) {
        score += 100;
        because.push("A safety warning was triggered in your latest assessment.");
      }
      for (const f of contributing) {
        if (overlaps(item.tags, FACTOR_TOPICS[f.id])) {
          score += f.points;
          because.push(`${f.label}: ${f.displayValue} (+${f.points} ${f.points === 1 ? "point" : "points"})`);
        }
      }
      for (const t of rising) {
        const topic = TREND_TOPICS[t.kind];
        if (topic && item.tags.includes(topic)) {
          score += 1;
          because.push(`Your recorded ${t.label} values increased across ${t.points.length} measurements`);
        }
      }
      return { item, score, personalised: score > 0, because };
    })
    .sort(
      (a, b) =>
        b.score - a.score || b.item.basePriority - a.item.basePriority || a.item.id.localeCompare(b.item.id),
    );
}

/** Top `n` items, optionally limited to items that have one of `tags`. */
export function recommendedReading(
  result: AssessmentResult | null,
  trends: TrendSummary[] = [],
  n = 4,
  tags?: EducationTag[],
): RankedItem[] {
  const ranked = rankEducation(result, trends);
  return (tags ? ranked.filter((r) => overlaps(r.item.tags, tags)) : ranked).slice(0, n);
}
