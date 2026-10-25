import { useHealthHistory } from "../../hooks/useHealthHistory";
import { analyseAll } from "../../lib/trends";
import type { EducationTag } from "../../data/educationLibrary";
import RecommendedReading from "./RecommendedReading";

/**
 * "Recommended for you" strip for the Education / Nutrition pages.
 * Only shown when the user has a saved assessment; otherwise the existing
 * page content is shown exactly as before.
 */
export default function PersonalisedForYou({ tags, count = 4 }: { tags?: EducationTag[]; count?: number }) {
  const { latest, history, status } = useHealthHistory();
  if (status !== "ready" || !latest) return null;
  return (
    <div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.03] px-5 sm:px-7 pb-7 pt-1 mt-12">
      <RecommendedReading
        result={latest.result}
        trends={analyseAll(history.measurements)}
        tags={tags}
        count={count}
        eyebrow="For you"
        title="Recommended from your latest assessment"
        className="mt-6"
      />
    </div>
  );
}
