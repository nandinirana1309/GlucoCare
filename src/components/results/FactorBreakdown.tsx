import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CircleCheck, CircleMinus, CircleDashed, ShieldAlert } from "lucide-react";

import type {
  AssessmentResult,
  FactorCategory,
  FactorProvenance,
  FactorSeverity,
  ScoreFactor,
} from "../../types/results";
import Badge from "../ui/Badge";
import type { BadgeTone } from "../ui/Badge";
import Card from "../ui/Card";
import Section from "../ui/Section";

/**
 * "Why am I seeing this result?"
 * -------------------------------------------------------------
 * Renders the engine's explainable breakdown (result.factors) - it does not
 * calculate anything itself. Three groups:
 *   1. factors that added points
 *   2. factors that were considered but added 0 points
 *   3. factors that were not provided
 * Reused later by the Health Journey dashboard.
 */

const CATEGORY_LABEL: Record<FactorCategory, string> = {
  measurement: "Measurement",
  symptom: "Symptoms",
  history: "Medical history",
  demographic: "Profile",
  lifestyle: "Lifestyle",
};

const PROVENANCE_LABEL: Record<FactorProvenance, string> = {
  "assessment-form": "Entered in your assessment",
};

const SEVERITY_TONE: Record<FactorSeverity, BadgeTone> = {
  none: "neutral",
  mild: "caution",
  moderate: "caution",
  high: "critical",
};

const SEVERITY_BAR: Record<FactorSeverity, string> = {
  none: "bg-white/20",
  mild: "bg-yellow-300",
  moderate: "bg-yellow-400",
  high: "bg-red-400",
};

export default function FactorBreakdown({ result }: { result: AssessmentResult }) {
  if (result.legacy) {
    return (
      <section className="mt-12" aria-label="Why am I seeing this result?">
        <Section eyebrow="Explainable result" title="Why am I seeing this result?" />
        <Card className="mt-6">
          <p className="text-sm text-slate-400 leading-relaxed">
            This assessment was saved by an earlier version of GlucoCare (engine{" "}
            {result.engineVersion}), before the factor breakdown existed. Its stored
            score ({result.concernScore}) and level ({result.concernLevel}) are shown
            exactly as recorded and are not recalculated.
          </p>
        </Card>
      </section>
    );
  }

  const contributing = result.factors.filter((f) => f.points > 0);
  const considered = result.factors.filter((f) => f.provided && f.points === 0);
  const missing = result.factors.filter((f) => !f.provided);

  return (
    <section className="mt-12" aria-label="Why am I seeing this result?">
      <Section
        eyebrow="Explainable result"
        title="Why am I seeing this result?"
        description="Every point in the score is traced to something you entered, using the same published reference criteria shown below. Nothing here is a diagnosis."
      />

      <ScoreSummary result={result} />

      {/* 1. CONTRIBUTING */}
      <div className="mt-8">
        <GroupHeading
          icon={<CircleCheck size={18} className="text-yellow-300" />}
          title="Adding to your score"
          count={contributing.length}
        />
        {contributing.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">
            None of the information you entered added points to the score.
          </p>
        ) : (
          <ul className="grid md:grid-cols-2 gap-4 mt-4">
            {contributing.map((f) => (
              <ContributingFactor key={f.id} factor={f} />
            ))}
          </ul>
        )}
      </div>

      {/* 2. CONSIDERED, 0 POINTS */}
      {considered.length > 0 && (
        <div className="mt-8">
          <GroupHeading
            icon={<CircleMinus size={18} className="text-emerald-400" />}
            title="Considered - no points added"
            count={considered.length}
          />
          <ul className="mt-4 rounded-2xl border border-white/10 bg-[#0b1d19] divide-y divide-white/5">
            {considered.map((f) => (
              <li key={f.id} className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6">
                <div className="sm:w-44 shrink-0">
                  <p className="text-sm font-semibold">{f.label}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{CATEGORY_LABEL[f.category]}</p>
                </div>
                <p className="text-sm text-slate-300 sm:w-36 shrink-0">{f.displayValue}</p>
                <p className="text-xs text-slate-500 leading-relaxed flex-1">
                  {f.reason}
                  {f.citation && <span className="text-slate-600"> {f.citation}</span>}
                </p>
                <span className="text-xs text-slate-500 shrink-0">0 pts</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. NOT PROVIDED */}
      {missing.length > 0 && (
        <div className="mt-8">
          <GroupHeading
            icon={<CircleDashed size={18} className="text-slate-500" />}
            title="Not provided - not considered"
            count={missing.length}
          />
          <ul className="flex flex-wrap gap-2 mt-4">
            {missing.map((f) => (
              <li
                key={f.id}
                className="px-3 py-2 rounded-lg bg-white/[0.03] border border-dashed border-white/10 text-xs"
              >
                <span className="text-slate-300 font-medium">{f.label}</span>
                <span className="text-slate-600"> - {f.reason}</span>
              </li>
            ))}
          </ul>
          <Link
            to="/assessment"
            className="inline-flex items-center gap-1.5 mt-4 text-sm text-emerald-400 hover:text-emerald-300 transition"
          >
            Add missing information
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function ScoreSummary({ result }: { result: AssessmentResult }) {
  const { concernScore: score, maxScore: max, levelBasis: basis } = result;
  const { moderate, high } = basis.thresholds;
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;

  return (
    <Card className="mt-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Score from your information</p>
          <p className="mt-1">
            <span className="text-3xl font-bold">{score}</span>
            <span className="text-slate-500"> of {max} possible points</span>
          </p>
        </div>
        <p className="text-sm text-slate-400 md:text-right max-w-md">
          Low below {moderate} · Moderate {moderate}-{high - 1} · High {high} or more
        </p>
      </div>

      {/* Score scale with Low / Moderate / High zones */}
      <div
        className="mt-6"
        role="img"
        aria-label={`Score ${score} of ${max}. Low below ${moderate}, Moderate from ${moderate}, High from ${high}.`}
      >
        <div className="relative h-3 rounded-full overflow-hidden flex">
          <div className="h-full bg-emerald-400/25" style={{ width: pct(moderate) }} />
          <div className="h-full bg-yellow-400/25" style={{ width: pct(high - moderate) }} />
          <div className="h-full bg-red-400/25 flex-1" />
          <div
            className="absolute top-0 bottom-0 w-1 -ml-0.5 rounded-full bg-white shadow-[0_0_0_3px_rgba(7,21,18,0.9)]"
            style={{ left: pct(score) }}
          />
        </div>
        <div className="relative h-5 mt-1 text-[11px] text-slate-600">
          <span className="absolute left-0">0</span>
          <span className="absolute -translate-x-1/2" style={{ left: pct(moderate) }}>{moderate}</span>
          <span className="absolute -translate-x-1/2" style={{ left: pct(high) }}>{high}</span>
          <span className="absolute right-0">{max}</span>
        </div>
      </div>

      {basis.type === "red-flag" ? (
        <div className="mt-4 flex gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4">
          <ShieldAlert size={18} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-300 leading-relaxed">
            The indicator is <span className="font-semibold text-white">High</span> because a
            safety warning was triggered:{" "}
            {result.safety.reasons.join(" ")} Safety warnings always take
            priority over the score - on points alone it would be{" "}
            <span className="font-semibold text-white">{basis.scoreLevel}</span>.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-400 leading-relaxed">
          {levelSentence(score, moderate, high)}
        </p>
      )}
    </Card>
  );
}

function levelSentence(score: number, moderate: number, high: number): string {
  if (score >= high) return `A score of ${high} or more gives a High concern indicator.`;
  if (score >= moderate)
    return `A score from ${moderate} to ${high - 1} gives a Moderate concern indicator.`;
  return `A score below ${moderate} gives a Low concern indicator.`;
}

function GroupHeading({ icon, title, count }: { icon: ReactNode; title: string; count: number }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      {icon}
      {title}
      <span className="text-slate-600 font-normal">({count})</span>
    </h3>
  );
}

function ContributingFactor({ factor: f }: { factor: ScoreFactor }) {
  return (
    <li className="rounded-2xl border border-white/10 bg-[#0b1d19] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-600 uppercase tracking-widest">{CATEGORY_LABEL[f.category]}</p>
          <p className="font-semibold mt-1">{f.label}</p>
        </div>
        <Badge tone={SEVERITY_TONE[f.severity]}>+{f.points} {f.points === 1 ? "pt" : "pts"}</Badge>
      </div>

      <p className="text-2xl font-bold mt-3">{f.displayValue}</p>

      {/* one segment per possible point */}
      <div
        className="flex gap-1 mt-3"
        role="img"
        aria-label={`${f.points} of ${f.maxPoints} possible points`}
      >
        {Array.from({ length: f.maxPoints }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < f.points ? SEVERITY_BAR[f.severity] : "bg-white/10"}`}
          />
        ))}
      </div>
      <p className="text-[11px] text-slate-600 mt-1">
        {f.points} of {f.maxPoints} possible points
      </p>

      <p className="text-sm text-slate-400 leading-relaxed mt-3">
        {f.reason}
        {f.citation && <span className="text-slate-600"> {f.citation}</span>}
      </p>

      {f.provenance && (
        <p className="text-xs text-slate-600 mt-3 pt-3 border-t border-white/5">
          Source: {PROVENANCE_LABEL[f.provenance]}
        </p>
      )}
    </li>
  );
}
