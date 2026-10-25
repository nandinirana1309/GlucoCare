import { Link } from "react-router-dom";
import { ChevronRight, ShieldAlert } from "lucide-react";

import type { StoredAssessment } from "../../types/health";
import { formatDate } from "../../lib/format";
import Badge from "../ui/Badge";
import { LEVEL_TONE } from "../../lib/indicatorTone";

/**
 * Saved assessments, newest first, each linking to /results/:id.
 * Shows only what was stored - nothing is recalculated.
 */
export default function AssessmentHistoryList({
  assessments,
  currentId,
  limit,
  className = "",
}: {
  assessments: StoredAssessment[];
  currentId?: string;
  limit?: number;
  className?: string;
}) {
  const newestFirst = [...assessments].reverse().slice(0, limit ?? assessments.length);

  return (
    <ul className={`rounded-2xl border border-white/10 bg-[#0b1d19] divide-y divide-white/5 ${className}`}>
      {newestFirst.map((a) => {
        const current = a.id === currentId;
        return (
          <li key={a.id}>
            <Link
              to={`/results/${a.id}`}
              aria-current={current ? "page" : undefined}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                current ? "bg-emerald-400/[0.04]" : ""
              }`}
            >
              <span className="text-sm font-semibold w-28 shrink-0">{formatDate(a.assessedOn)}</span>
              <Badge tone={LEVEL_TONE[a.result.concernLevel]}>{a.result.concernLevel} concern</Badge>
              <span className="text-xs text-slate-500">
                Score {a.result.concernScore}
                {a.result.legacy ? "" : ` of ${a.result.maxScore}`}
              </span>
              {a.result.safety.isUrgent && (
                <span className="inline-flex items-center gap-1 text-xs text-red-300">
                  <ShieldAlert size={13} /> Safety warning
                </span>
              )}
              <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                {current && <span className="text-emerald-400">Viewing</span>}
                <ChevronRight size={16} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
