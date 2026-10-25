import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Minus, ShieldAlert, ShieldCheck } from "lucide-react";

import type { StoredAssessment } from "../../types/health";
import { compareAssessments, describeComparison } from "../../lib/compare";
import type { AssessmentComparison, FactorChange } from "../../lib/compare";
import { formatDate } from "../../lib/format";
import { LEVEL_TONE } from "../../lib/indicatorTone";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import Section from "../ui/Section";

/**
 * "What changed?" (Phase 7). Compares two SAVED assessments using only their
 * stored factors and inputs (lib/compare.ts). No AI, no recalculation.
 *
 * assessments: oldest first. By default compares the latest with the one
 * before it; when `selectable`, the user can pick any two.
 */
export default function WhatChanged({
  assessments,
  currentId,
  selectable = false,
}: {
  assessments: StoredAssessment[];
  currentId?: string;
  selectable?: boolean;
}) {
  const currentIndex = currentId
    ? assessments.findIndex((a) => a.id === currentId)
    : assessments.length - 1;
  const [prevId, setPrevId] = useState<string | undefined>(assessments[currentIndex - 1]?.id);
  const [curId, setCurId] = useState<string | undefined>(assessments[currentIndex]?.id);

  if (assessments.length < 2 || currentIndex < 1) {
    return (
      <section className="mt-12" aria-label="What changed">
        <Section eyebrow="Compare" title="What changed?" />
        <Card className="mt-6">
          <p className="text-sm text-slate-500">
            {assessments.length < 2
              ? "Complete at least two assessments to compare them. Each comparison uses only what was saved with each assessment."
              : "This is your earliest saved assessment, so there is nothing earlier to compare it with."}
          </p>
        </Card>
      </section>
    );
  }

  const previous = assessments.find((a) => a.id === prevId) ?? assessments[currentIndex - 1];
  const current = assessments.find((a) => a.id === curId) ?? assessments[currentIndex];
  const ordered = previous.assessedOn <= current.assessedOn ? [previous, current] : [current, previous];
  const cmp = compareAssessments(ordered[0], ordered[1]);

  return (
    <section className="mt-12" aria-label="What changed">
      <Section
        eyebrow="Compare"
        title="What changed?"
        description="Built only from the values saved with each assessment. Each assessment keeps the result it had when it was saved."
      />

      {selectable && (
        <div className="flex flex-wrap items-end gap-3 mt-5">
          <AssessmentSelect label="Earlier assessment" value={previous.id} onChange={setPrevId} assessments={assessments} />
          <ArrowRight size={18} className="text-slate-500 mb-3" aria-hidden="true" />
          <AssessmentSelect label="Later assessment" value={current.id} onChange={setCurId} assessments={assessments} />
        </div>
      )}

      {previous.id === current.id ? (
        <Card className="mt-6">
          <p className="text-sm text-slate-500">Choose two different assessments to compare.</p>
        </Card>
      ) : (
        <ComparisonView cmp={cmp} />
      )}
    </section>
  );
}

function AssessmentSelect({
  label,
  value,
  onChange,
  assessments,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  assessments: StoredAssessment[];
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block mt-1 bg-[#10241f] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
      >
        {[...assessments].reverse().map((a) => (
          <option key={a.id} value={a.id}>
            {formatDate(a.assessedOn)} · {a.result.concernLevel} · score {a.result.concernScore}
          </option>
        ))}
      </select>
    </label>
  );
}

function ComparisonView({ cmp }: { cmp: AssessmentComparison }) {
  const s = cmp.scoreChange;
  return (
    <div className="mt-6 space-y-5">
      {/* PREVIOUS -> CURRENT */}
      <div className="grid md:grid-cols-[1fr_auto_1fr] items-stretch gap-4">
        <SideCard title="Earlier" r={cmp.previous} />
        <div className="flex md:flex-col items-center justify-center gap-2 text-center">
          <span
            className={`text-2xl font-bold ${s > 0 ? "text-yellow-300" : s < 0 ? "text-emerald-300" : "text-slate-300"}`}
            aria-label={`Score change ${s > 0 ? "+" : ""}${s}`}
          >
            {s > 0 ? "+" : ""}
            {s}
          </span>
          <span className="text-xs text-slate-500">points{cmp.daysBetween !== null ? ` · ${cmp.daysBetween} days apart` : ""}</span>
        </div>
        <SideCard title="Later" r={cmp.current} />
      </div>

      {/* SAFETY CHANGE */}
      {cmp.safety.change !== "normal-both" && (
        <div
          className={`flex gap-3 rounded-2xl border p-4 ${
            cmp.safety.change === "no-longer-urgent" ? "border-emerald-400/20 bg-emerald-400/5" : "border-red-400/25 bg-red-400/5"
          }`}
        >
          {cmp.safety.change === "no-longer-urgent" ? (
            <ShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert size={18} className="text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="text-sm text-slate-300">
            {cmp.safety.change === "became-urgent" && (
              <>A safety warning appears in the later assessment: {cmp.safety.reasonsAdded.join(" ")}</>
            )}
            {cmp.safety.change === "no-longer-urgent" && <>The earlier assessment had a safety warning; the later one does not.</>}
            {cmp.safety.change === "still-urgent" && <>Both assessments include a safety warning.</>}
          </div>
        </div>
      )}

      {cmp.engineVersionDiffers && (
        <p className="text-xs text-sky-300 rounded-xl border border-sky-400/20 bg-sky-400/5 p-3">
          These assessments were scored by different GlucoCare engine versions ({cmp.previous.engineVersion} and{" "}
          {cmp.current.engineVersion}). Each is shown exactly as it was recorded - nothing has been recalculated.
        </p>
      )}

      {/* FACTOR CHANGES */}
      {!cmp.breakdownAvailable ? (
        <Card>
          <p className="text-sm text-slate-500">
            A factor-by-factor comparison is not available because one of these assessments was saved by an
            earlier GlucoCare version without a factor breakdown.
          </p>
        </Card>
      ) : cmp.changes.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">None of the scored inputs changed between these two assessments.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0b1d19]">
          <table className="w-full text-sm min-w-[560px]">
            <caption className="sr-only">Changes in scored inputs between the two assessments</caption>
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-widest">
                <th scope="col" className="px-5 py-3 font-medium">Factor</th>
                <th scope="col" className="px-3 py-3 font-medium">Earlier</th>
                <th scope="col" className="px-3 py-3 font-medium">Later</th>
                <th scope="col" className="px-3 py-3 font-medium">Points</th>
                <th scope="col" className="px-5 py-3 font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {cmp.changes.map((f) => (
                <FactorRow key={f.id} f={f} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SYMPTOM NAME CHANGES */}
      {(cmp.inputChanges.symptomsAdded.length > 0 || cmp.inputChanges.symptomsRemoved.length > 0) && (
        <p className="text-sm text-slate-400">
          {cmp.inputChanges.symptomsAdded.length > 0 && <>Symptoms newly selected: {cmp.inputChanges.symptomsAdded.join(", ")}. </>}
          {cmp.inputChanges.symptomsRemoved.length > 0 && <>No longer selected: {cmp.inputChanges.symptomsRemoved.join(", ")}.</>}
        </p>
      )}

      {cmp.unchanged.length > 0 && cmp.breakdownAvailable && (
        <p className="text-xs text-slate-500">
          Unchanged: {cmp.unchanged.map((f) => f.label).join(", ")}.
        </p>
      )}

      <details className="text-sm">
        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">Read as text</summary>
        <ul className="mt-2 space-y-1 text-slate-400">
          {describeComparison(cmp).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
      <p className="text-xs text-slate-600">
        A change in recorded values or in the score is not a diagnosis. Discuss any change that concerns you
        with a qualified healthcare professional.
      </p>
    </div>
  );
}

function SideCard({ title, r }: { title: string; r: AssessmentComparison["previous"] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b1d19] p-5">
      <p className="text-xs text-slate-500 uppercase tracking-widest">{title}</p>
      <p className="font-semibold mt-1">{r.assessedOn ? formatDate(r.assessedOn) : "--"}</p>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <Badge tone={LEVEL_TONE[r.level]}>{r.level} concern</Badge>
        <span className="text-sm text-slate-400">Score {r.score}{r.maxScore ? ` / ${r.maxScore}` : ""}</span>
        {r.urgent && <span className="text-xs text-red-300">safety warning</span>}
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<FactorChange["status"], string> = {
  added: "Now adds points",
  removed: "No longer adds points",
  increased: "More points",
  decreased: "Fewer points",
  "value-changed": "Value changed",
  unchanged: "Unchanged",
};

function FactorRow({ f }: { f: FactorChange }) {
  const Icon = f.pointChange > 0 ? ArrowUp : f.pointChange < 0 ? ArrowDown : Minus;
  const color = f.pointChange > 0 ? "text-yellow-300" : f.pointChange < 0 ? "text-emerald-300" : "text-slate-400";
  return (
    <tr className="border-t border-white/5 align-top">
      <th scope="row" className="px-5 py-3 text-left font-semibold">{f.label}</th>
      <td className="px-3 py-3 text-slate-400">{f.before?.displayValue ?? "Not provided"}</td>
      <td className="px-3 py-3 text-slate-200">{f.after?.displayValue ?? "Not provided"}</td>
      <td className="px-3 py-3 text-slate-400 whitespace-nowrap">
        {f.before?.points ?? 0} → {f.after?.points ?? 0}
      </td>
      <td className={`px-5 py-3 ${color}`}>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Icon size={14} aria-hidden="true" />
          {f.pointChange > 0 ? "+" : ""}
          {f.pointChange !== 0 ? f.pointChange : ""} {STATUS_TEXT[f.status]}
        </span>
        <span className="block text-xs text-slate-500 mt-1 max-w-xs">{f.after?.reason}</span>
      </td>
    </tr>
  );
}
