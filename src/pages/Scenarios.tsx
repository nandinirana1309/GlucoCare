import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FlaskConical, Lock, RotateCcw } from "lucide-react";

import { useHealthHistory } from "../hooks/useHealthHistory";
import { LOCKED_MEASUREMENTS_NOTE, runScenario, SCENARIO_DISCLAIMER, SCENARIO_LABEL, UNTOUCHED_FACTORS } from "../lib/scenarios";
import type { ScenarioChoice } from "../lib/scenarios";
import { calculateBMI } from "../lib/bmi";
import { formatDate } from "../lib/format";
import { LEVEL_TONE } from "../lib/indicatorTone";
import type { ActivityLevel, DietPattern, SmokingStatus } from "../types/assessment";
import Badge from "../components/ui/Badge";
import Card from "../components/ui/Card";
import Disclaimer from "../components/ui/Disclaimer";
import EmergencyBanner from "../components/ui/EmergencyBanner";

/**
 * Explore a Health Scenario (Project-II, Phase 12).
 * Educational only: changes lifestyle answers or a hypothetical weight on a
 * COPY of the latest saved assessment and shows how the EXISTING rule-based
 * factors would respond. Nothing is saved; measurements are never simulated.
 */
const ACTIVITY: ActivityLevel[] = ["Sedentary", "Lightly active", "Moderately active", "Very active"];
const DIET: DietPattern[] = ["Generally balanced", "Often high in sugary food or drinks", "Irregular / skipped meals", "Not sure"];
const SMOKING: SmokingStatus[] = ["No", "Former smoker", "Yes"];

export default function Scenarios() {
  const { latest, status, error, refresh } = useHealthHistory();
  const [choice, setChoice] = useState<ScenarioChoice>({});
  const [monitoring, setMonitoring] = useState(false);

  const result = useMemo(() => (latest ? runScenario(latest.input, choice) : null), [latest, choice]);
  const reset = () => {
    setChoice({});
    setMonitoring(false);
  };

  return (
    <main className="min-h-screen pt-28 pb-20">
      <div className="max-w-5xl mx-auto px-6">
        <Link to="/journey" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
          <ArrowLeft size={15} /> Back to my health journey
        </Link>
        <p className="text-emerald-400 text-sm font-semibold uppercase tracking-widest mt-6">What-if</p>
        <h1 className="text-4xl md:text-5xl font-bold mt-4">Explore a health scenario</h1>
        <div className="mt-5 flex gap-3 rounded-2xl border border-yellow-400/25 bg-yellow-400/[0.05] p-4" role="note">
          <FlaskConical size={20} className="text-yellow-300 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-yellow-100">{SCENARIO_LABEL}</p>
            <p className="text-sm text-slate-300 mt-1 leading-relaxed">
              {SCENARIO_DISCLAIMER} It only shows how GlucoCare's existing scoring rules would treat different
              lifestyle answers. Nothing you try here is saved.
            </p>
          </div>
        </div>

        {status === "loading" && <p role="status" className="text-slate-500 mt-10">Loading...</p>}
        {status === "error" && (
          <Card className="mt-10">
            <p role="alert" className="text-sm text-red-400">{error}</p>
            <button onClick={() => void refresh()} className="mt-4 px-4 py-2 rounded-lg bg-emerald-400 text-[#071512] font-bold">Try again</button>
          </Card>
        )}
        {status === "ready" && !latest && (
          <Card className="mt-10">
            <p className="text-slate-400">Complete an assessment first - scenarios start from your latest saved assessment.</p>
            <Link to="/assessment" className="inline-block mt-4 text-emerald-400">Start an assessment</Link>
          </Card>
        )}

        {latest && result && (
          <>
            {latest.result.safety.isUrgent && (
              <div className="mt-8">
                <EmergencyBanner triggers={latest.result.safety.triggers} />
                <p className="text-xs text-slate-500 mt-2">This warning comes from your actual recorded data. No scenario changes it.</p>
              </div>
            )}

            <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6 mt-8">
              {/* CONTROLS */}
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold">Change a lifestyle answer</h2>
                  <button onClick={reset} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
                    <RotateCcw size={14} /> Reset
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">Starting point: your assessment of {formatDate(latest.assessedOn)}.</p>

                <div className="space-y-5 mt-6">
                  <ScenarioSelect label="Physical activity" actual={latest.input.activityLevel} options={ACTIVITY}
                    value={choice.activityLevel} onChange={(v) => setChoice((c) => ({ ...c, activityLevel: v as ActivityLevel }))} />
                  <ScenarioSelect label="Usual eating pattern" actual={latest.input.dietPattern} options={DIET}
                    value={choice.dietPattern} onChange={(v) => setChoice((c) => ({ ...c, dietPattern: v as DietPattern }))} />
                  <ScenarioSelect label="Smoking" actual={latest.input.smoking} options={SMOKING}
                    value={choice.smoking} onChange={(v) => setChoice((c) => ({ ...c, smoking: v as SmokingStatus }))} />

                  <label className="block">
                    <span className="text-sm text-slate-300">Hypothetical weight (kg)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={choice.weight ?? ""}
                      placeholder={latest.input.weight ? `Recorded: ${latest.input.weight}` : "No weight recorded"}
                      disabled={!latest.input.height}
                      onChange={(e) => setChoice((c) => ({ ...c, weight: e.target.value === "" ? undefined : e.target.value }))}
                      className="w-full mt-2 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white disabled:opacity-50"
                    />
                    <span className="text-xs text-slate-500 mt-1 block">
                      {!latest.input.height
                        ? "Needs a height in your assessment to work out BMI."
                        : choice.weight && !result.error
                          ? `Hypothetical BMI: ${calculateBMI(latest.input.height, choice.weight)?.toFixed(1)}`
                          : "BMI is recalculated from your recorded height."}
                    </span>
                    {result.error && choice.weight !== undefined && <span role="alert" className="text-xs text-red-400 block">{result.error}</span>}
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={monitoring} onChange={(e) => setMonitoring(e.target.checked)} className="accent-emerald-400 w-4 h-4 mt-1" />
                    <span className="text-sm text-slate-300">
                      Record readings more consistently
                      <span className="block text-xs text-slate-500">Educational only - see the note on the right.</span>
                    </span>
                  </label>
                </div>
              </Card>

              {/* RESULT */}
              <section aria-label="Scenario result" aria-live="polite">
                <Card>
                  <p className="text-xs text-yellow-300 font-semibold uppercase tracking-widest">{SCENARIO_LABEL}</p>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <LevelBox title="As recorded" level={result.baseline.concernLevel} score={result.baseline.concernScore} max={result.baseline.maxScore} />
                    <LevelBox title="In this scenario" level={result.hypothetical.concernLevel} score={result.hypothetical.concernScore} max={result.hypothetical.maxScore} />
                  </div>

                  {result.changes.length > 0 && (
                    <ul className="mt-5 space-y-1 text-sm text-slate-400">
                      {result.changes.map((c) => (
                        <li key={c.field}>
                          <span className="text-slate-300">{c.label}:</span> {c.actual} → <span className="text-white">{c.scenario}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <ul className="mt-5 space-y-2">
                    {result.explanation.map((line) => (
                      <li key={line} className="text-sm text-slate-200 leading-relaxed">{line}</li>
                    ))}
                  </ul>

                  {monitoring && (
                    <p className="mt-5 text-sm text-slate-400 leading-relaxed rounded-xl border border-white/10 p-3">
                      Recording readings regularly - with their date and whether you had eaten - does not change the
                      indicator. It makes the trends in your history easier to understand and gives your healthcare
                      professional better information.
                    </p>
                  )}

                  <div className="mt-5 pt-4 border-t border-white/10">
                    <p className="flex items-start gap-2 text-xs text-slate-500">
                      <Lock size={13} className="shrink-0 mt-0.5" /> {LOCKED_MEASUREMENTS_NOTE}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {UNTOUCHED_FACTORS.map((id) => {
                        const f = result.baseline.factors.find((x) => x.id === id);
                        return (
                          <li key={id} className="text-xs px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-slate-400">
                            {f?.label}: {f?.displayValue ?? "not recorded"} (kept)
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </Card>
                <p className="text-xs text-slate-600 mt-3">{SCENARIO_DISCLAIMER}</p>
              </section>
            </div>
          </>
        )}

        <Disclaimer className="mt-12" />
      </div>
    </main>
  );
}

function ScenarioSelect({
  label, actual, options, value, onChange,
}: {
  label: string;
  actual: string;
  options: string[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-300">{label}</span>
      <select
        value={value ?? actual}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-2 bg-[#10241f] border border-white/10 rounded-xl px-4 py-3 text-white"
      >
        {!actual && <option value="">Not answered</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}{o === actual ? " (recorded)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function LevelBox({ title, level, score, max }: { title: string; level: "Low" | "Moderate" | "High"; score: number; max: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-xs text-slate-500">{title}</p>
      <div className="mt-2"><Badge tone={LEVEL_TONE[level]}>{level} concern</Badge></div>
      <p className="text-sm text-slate-400 mt-2">Score {score} / {max}</p>
    </div>
  );
}
