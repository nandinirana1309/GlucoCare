import { Link } from "react-router-dom";
import { ArrowRight, BookOpen } from "lucide-react";

import type { AssessmentResult } from "../../types/results";
import type { EducationTag } from "../../data/educationLibrary";
import type { TrendSummary } from "../../lib/trends";
import { recommendedReading } from "../../lib/personalize";
import Section from "../ui/Section";

/**
 * Personalised education (Phase 10). Shows items from the FIXED library in
 * an order based on the user's own factors and trends, each with a
 * "Shown because" line quoting the data that ranked it up.
 */
export default function RecommendedReading({
  result,
  trends = [],
  count = 4,
  tags,
  eyebrow = "Personalised education",
  title = "Recommended reading for you",
  className = "mt-12",
}: {
  result: AssessmentResult | null;
  trends?: TrendSummary[];
  count?: number;
  tags?: EducationTag[];
  eyebrow?: string;
  title?: string;
  className?: string;
}) {
  const items = recommendedReading(result, trends, count, tags);
  if (items.length === 0) return null;
  const anyPersonal = items.some((i) => i.personalised);

  return (
    <section className={className} aria-label={title}>
      <Section
        eyebrow={eyebrow}
        title={title}
        description={
          anyPersonal
            ? "Chosen from GlucoCare's reviewed education library and ordered by the factors in your assessment. The content is the same for everyone - only the order is personal."
            : "General diabetes education from GlucoCare's reviewed library."
        }
      />
      <ul className="grid md:grid-cols-2 gap-4 mt-6">
        {items.map(({ item, personalised, because }) => (
          <li key={item.id} className="rounded-2xl border border-white/10 bg-[#0b1d19] p-5 flex flex-col">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 shrink-0 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">
                <BookOpen size={17} />
              </div>
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed mt-2">
                  {item.summary}
                  {item.citation && <span className="text-slate-600"> {item.citation}</span>}
                </p>
              </div>
            </div>
            {personalised && (
              <p className="text-xs text-slate-500 mt-3 pl-12">
                <span className="text-slate-400">Shown because:</span> {because.slice(0, 2).join("; ")}
              </p>
            )}
            <Link
              to={item.href}
              className="inline-flex items-center gap-1.5 mt-auto pt-4 pl-12 text-sm text-emerald-400 hover:text-emerald-300 transition"
            >
              {item.linkLabel}
              <ArrowRight size={14} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
