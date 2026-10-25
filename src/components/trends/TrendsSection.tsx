import type { ReactNode } from "react";
import { Info } from "lucide-react";

import type { Measurement } from "../../types/health";
import { analyseGlucose, analyseKind } from "../../lib/trends";
import type { TrendSummary } from "../../lib/trends";
import { BMI_REFERENCE, HBA1C_REFERENCE } from "../../data/referenceRanges";
import type { ReferenceRange } from "../../data/referenceRanges";
import { GLUCOSE_CONTEXT_SHORT } from "../../data/glucoseContext";
import Card from "../ui/Card";
import Section from "../ui/Section";
import TrendChart from "./TrendChart";
import type { ChartBand, ChartSeries } from "./TrendChart";

/**
 * Trends (Phase 6): one card per measurement type. Each card keeps the three
 * tiers apart - "What the records show" (observation), "Reference range"
 * (possible interpretation) and a fixed "not a diagnosis" note.
 */

const CONTEXT_COLOR: Record<string, string> = {
  fasting: "#34d399",
  random: "#fbbf24",
  post_meal: "#a78bfa",
  unknown: "#94a3b8",
};

/** Shaded bands from the EXISTING reference ranges (non-"within" bands only). */
function bandsFrom(range: ReferenceRange): ChartBand[] {
  return range.bands
    .filter((b) => b.rating === "borderline" || b.rating === "above-reference")
    .map((b) => ({
      from: b.min,
      to: Number.isFinite(b.max) ? b.max : undefined,
      color: b.rating === "borderline" ? "#facc15" : "#f87171",
      label: b.statusText,
    }));
}

export default function TrendsSection({ measurements }: { measurements: Measurement[] }) {
  const glucose = analyseGlucose(measurements);
  const hba1c = analyseKind(measurements, "hba1c");
  const systolic = analyseKind(measurements, "systolic");
  const diastolic = analyseKind(measurements, "diastolic");
  const weight = analyseKind(measurements, "weight");
  const bmi = analyseKind(measurements, "bmi");

  return (
    <section className="mt-12" aria-label="Trends">
      <Section
        eyebrow="Trends"
        title="How your recorded values have changed"
        description="Charts show only values you entered or confirmed. A direction is only described once there are at least three measurements. Nothing here predicts future values."
      />

      <div className="grid lg:grid-cols-2 gap-5 mt-6">
        <TrendCard
          title="Blood glucose"
          summaries={glucose.summaries}
          note={
            glucose.mixedContexts
              ? "Readings taken in different situations (fasting, random, after a meal) are not comparable, so each is shown and described separately."
              : undefined
          }
          chart={
            glucose.summaries.some((s) => s.points.length > 0) && (
              <TrendChart
                title="Blood glucose"
                unit="mg/dL"
                series={glucose.summaries.map<ChartSeries>((s) => ({
                  key: s.context ?? "unknown",
                  label: GLUCOSE_CONTEXT_SHORT[s.context ?? "unknown"],
                  color: CONTEXT_COLOR[s.context ?? "unknown"],
                  points: s.points,
                }))}
              />
            )
          }
        />

        <TrendCard
          title="HbA1c"
          summaries={[hba1c]}
          chart={
            hba1c.points.length > 0 && (
              <TrendChart
                title="HbA1c"
                unit="%"
                series={[{ key: "hba1c", label: "HbA1c", color: "#34d399", points: hba1c.points }]}
                bands={bandsFrom(HBA1C_REFERENCE)}
              />
            )
          }
        />

        <TrendCard
          title="Blood pressure"
          summaries={[systolic, diastolic]}
          chart={
            systolic.points.length + diastolic.points.length > 0 && (
              <TrendChart
                title="Blood pressure"
                unit="mmHg"
                series={[
                  { key: "systolic", label: "Systolic", color: "#f87171", points: systolic.points },
                  { key: "diastolic", label: "Diastolic", color: "#60a5fa", points: diastolic.points },
                ]}
              />
            )
          }
        />

        <TrendCard
          title="Weight"
          summaries={[weight]}
          chart={
            weight.points.length > 0 && (
              <TrendChart
                title="Weight"
                unit="kg"
                series={[{ key: "weight", label: "Weight", color: "#34d399", points: weight.points }]}
              />
            )
          }
        />

        <TrendCard
          title="BMI"
          summaries={[bmi]}
          chart={
            bmi.points.length > 0 && (
              <TrendChart
                title="BMI"
                unit="kg/m2"
                series={[{ key: "bmi", label: "BMI", color: "#34d399", points: bmi.points }]}
                bands={bandsFrom(BMI_REFERENCE)}
              />
            )
          }
        />
      </div>
    </section>
  );
}

function TrendCard({
  title,
  summaries,
  chart,
  note,
}: {
  title: string;
  summaries: TrendSummary[];
  chart: ReactNode;
  note?: string;
}) {
  const hasData = summaries.some((s) => s.points.length > 0);
  const interpretations = summaries.map((s) => s.interpretation).filter((x): x is string => Boolean(x));
  const caveats = [...new Set(summaries.flatMap((s) => s.caveats))];

  return (
    <Card>
      <h3 className="text-lg font-bold">{title}</h3>

      {hasData ? chart : (
        <div className="mt-4 h-24 rounded-xl border border-dashed border-white/10 flex items-center justify-center">
          <p className="text-sm text-slate-500">No values recorded yet - no trend available.</p>
        </div>
      )}

      {note && (
        <p className="mt-4 flex gap-2 text-xs text-yellow-200/80">
          <Info size={14} className="shrink-0 mt-0.5" /> {note}
        </p>
      )}

      {hasData && (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">What the records show</p>
            <ul className="mt-1 space-y-1">
              {summaries
                .filter((s) => s.points.length > 0)
                .map((s) => (
                  <li key={s.label} className="text-sm text-slate-300 leading-relaxed">{s.observation}</li>
                ))}
            </ul>
          </div>
          {interpretations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Possible interpretation - reference range</p>
              <ul className="mt-1 space-y-1">
                {interpretations.map((t) => (
                  <li key={t} className="text-sm text-slate-400 leading-relaxed">{t}</li>
                ))}
              </ul>
            </div>
          )}
          {caveats.map((c) => (
            <p key={c} className="text-xs text-slate-500">{c}</p>
          ))}
          <p className="text-xs text-slate-600 border-t border-white/5 pt-3">
            This describes recorded values only. It is not a diagnosis and does not predict future values.
          </p>
        </div>
      )}
    </Card>
  );
}
