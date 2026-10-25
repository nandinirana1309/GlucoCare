/**
 * Building blocks of the My Health Journey dashboard (Phase 5).
 * Presentation only - all values come from stored history via lib/journey.ts.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList, FileText, ShieldAlert } from "lucide-react";

import type { HealthHistory, Measurement, MeasurementKind, MedicalReport, StoredAssessment } from "../../types/health";
import { MEASUREMENT_LABELS } from "../../types/health";
import { formatDate, formatNumber } from "../../lib/format";
import { buildTimeline, groupByMonth, latestByKind, kindsWithData, VERIFICATION_LABEL } from "../../lib/journey";
import type { FactorFrequency } from "../../lib/journey";
import { GLUCOSE_CONTEXT_SHORT } from "../../data/glucoseContext";
import Badge from "../ui/Badge";
import { LEVEL_TONE } from "../../lib/indicatorTone";
import Card from "../ui/Card";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/* ------------------------------------------------------------------ */

export function StatTile({ label, value, sub, children }: { label: string; value: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b1d19] p-5">
      <p className="text-xs text-slate-500 uppercase tracking-widest">{label}</p>
      <div className="text-2xl font-bold mt-2">{value}</div>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function CurrentAssessmentCard({ assessment }: { assessment: StoredAssessment }) {
  const r = assessment.result;
  const top = [...r.factors].filter((f) => f.points > 0).sort((a, b) => b.points - a.points).slice(0, 4);
  const pct = r.maxScore ? Math.min(100, (r.concernScore / r.maxScore) * 100) : 0;

  return (
    <Card className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest">Latest assessment</p>
          <h2 className="text-2xl font-bold mt-1">{r.concernLevel} concern</h2>
          <p className="text-sm text-slate-500 mt-1">{formatDate(assessment.assessedOn)} · educational indicator, not a diagnosis</p>
        </div>
        <Badge tone={LEVEL_TONE[r.concernLevel]}>
          Score {r.concernScore}
          {r.legacy ? "" : ` / ${r.maxScore}`}
        </Badge>
      </div>

      {!r.legacy && (
        <div className="mt-5 h-2 rounded-full bg-white/10 overflow-hidden" role="img" aria-label={`Score ${r.concernScore} of ${r.maxScore}`}>
          <div
            className={`h-full rounded-full ${r.concernLevel === "High" ? "bg-red-400" : r.concernLevel === "Moderate" ? "bg-yellow-400" : "bg-emerald-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {r.safety.isUrgent && (
        <p className="mt-4 flex items-center gap-2 text-sm text-red-300">
          <ShieldAlert size={16} /> A safety warning set this level to High (on points alone: {r.levelBasis.type === "red-flag" ? r.levelBasis.scoreLevel : r.concernLevel}).
        </p>
      )}

      <div className="mt-5">
        <p className="text-sm font-semibold">Main contributing factors</p>
        {r.legacy ? (
          <p className="text-sm text-slate-500 mt-2">Not available for assessments saved by an earlier GlucoCare version.</p>
        ) : top.length === 0 ? (
          <p className="text-sm text-slate-500 mt-2">No factor added points in this assessment.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {top.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-300">
                  {f.label} <span className="text-slate-500">· {f.displayValue}</span>
                </span>
                <span className="text-xs text-yellow-300 shrink-0">+{f.points} {f.points === 1 ? "pt" : "pts"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        to={`/results/${assessment.id}`}
        className="inline-flex items-center gap-1.5 mt-6 text-sm text-emerald-400 hover:text-emerald-300 transition"
      >
        Why am I seeing this result?
        <ArrowRight size={15} />
      </Link>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function LatestMeasurements({ measurements }: { measurements: Measurement[] }) {
  const latest = latestByKind(measurements);
  const kinds = kindsWithData(measurements);

  return (
    <Card className="h-full">
      <p className="text-xs text-slate-500 uppercase tracking-widest">Recent measurements</p>
      <h2 className="text-xl font-bold mt-1">Latest recorded values</h2>
      {kinds.length === 0 ? (
        <p className="text-sm text-slate-500 mt-5">
          No measurements recorded yet. Values you enter in an assessment appear here.
        </p>
      ) : (
        <dl className="mt-5 divide-y divide-white/5">
          {kinds.map((k: MeasurementKind) => {
            const m = latest[k]!;
            return (
              <div key={k} className="py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <dt className="text-sm text-slate-400">{MEASUREMENT_LABELS[k]}</dt>
                <dd className="text-right">
                  <span className="font-semibold">{formatNumber(m.value)}</span>
                  <span className="text-xs text-slate-500 ml-1">{m.unit}</span>
                  <span className="block text-[11px] text-slate-600">
                    {formatDate(m.measuredOn)} · {VERIFICATION_LABEL[m.verification]}
                    {m.kind === "glucose" && m.glucoseContext ? ` · ${GLUCOSE_CONTEXT_SHORT[m.glucoseContext]}` : ""}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function FactorSummary({ factors, total }: { factors: FactorFrequency[]; total: number }) {
  return (
    <Card className="h-full">
      <p className="text-xs text-slate-500 uppercase tracking-widest">Factor summary</p>
      <h2 className="text-xl font-bold mt-1">What has added to your score</h2>
      <p className="text-sm text-slate-500 mt-1">
        Across {total} saved {total === 1 ? "assessment" : "assessments"} with a factor breakdown.
      </p>
      {factors.length === 0 ? (
        <p className="text-sm text-slate-500 mt-5">No factor has added points so far.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {factors.map((f) => (
            <li key={f.id}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{f.label}</span>
                <span className="text-xs text-slate-500">
                  {f.contributed} of {f.total}
                  {f.latestPoints > 0 ? ` · latest +${f.latestPoints}` : " · not in latest"}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
                <div className="h-full bg-yellow-400/70 rounded-full" style={{ width: `${(f.contributed / Math.max(1, f.total)) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function JourneyTimeline({ history }: { history: HealthHistory }) {
  const groups = groupByMonth(buildTimeline(history));
  return (
    <Card className="h-full">
      <p className="text-xs text-slate-500 uppercase tracking-widest">Timeline</p>
      <h2 className="text-xl font-bold mt-1">Your recorded journey</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-slate-500 mt-5">Nothing recorded yet.</p>
      ) : (
        <div className="mt-5 space-y-6">
          {groups.map((g) => (
            <section key={g.month} aria-label={monthLabel(g.month)}>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{monthLabel(g.month)}</h3>
              <ol className="mt-3 border-l border-white/10 ml-2 space-y-4">
                {g.events.map((e) => (
                  <li key={e.type === "assessment" ? e.assessment.id : e.reportId} className="relative pl-5">
                    <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${e.type === "assessment" ? "bg-emerald-400" : "bg-sky-400"}`} aria-hidden="true" />
                    {e.type === "assessment" ? (
                      <Link to={`/results/${e.assessment.id}`} className="block group">
                        <span className="flex flex-wrap items-center gap-2 text-sm">
                          <ClipboardList size={14} className="text-emerald-400" />
                          <span className="font-medium group-hover:text-emerald-300 transition">Assessment</span>
                          <Badge tone={LEVEL_TONE[e.assessment.result.concernLevel]}>{e.assessment.result.concernLevel}</Badge>
                          {e.assessment.result.safety.isUrgent && <span className="text-xs text-red-300">safety warning</span>}
                        </span>
                        <span className="text-xs text-slate-500">{formatDate(e.date)} · score {e.assessment.result.concernScore}</span>
                      </Link>
                    ) : (
                      <div>
                        <span className="flex items-center gap-2 text-sm">
                          <FileText size={14} className="text-sky-300" />
                          <span className="font-medium">{e.label}</span>
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatDate(e.date)} · {e.valueCount} verified {e.valueCount === 1 ? "value" : "values"}
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function ReportsList({
  reports,
  action,
  onDelete,
}: {
  reports: MedicalReport[];
  action?: ReactNode;
  onDelete?: (id: string) => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest">Medical reports</p>
          <h2 className="text-xl font-bold mt-1">Reports in your history</h2>
        </div>
        {action}
      </div>
      {reports.length === 0 ? (
        <p className="text-sm text-slate-500 mt-4">
          No reports yet. Only values you review and confirm from a report are added to your history.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-white/5">
          {reports.map((r) => {
            const counts = { confirmed: 0, edited: 0, added: 0, rejected: 0 };
            r.values.forEach((v) => counts[v.status]++);
            return (
              <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="text-sm font-medium">{r.label}</span>
                  <span className="block text-xs text-slate-500">{formatDate(r.reportDate)} · {r.fileType.toUpperCase()}</span>
                </span>
                <span className="flex items-center gap-4 text-xs text-slate-500">
                  <span>
                    {counts.confirmed} confirmed · {counts.edited} edited · {counts.added} added · {counts.rejected} rejected
                  </span>
                  {onDelete && (
                    <button
                      onClick={() => onDelete(r.id)}
                      className="text-slate-500 hover:text-red-400 transition"
                      aria-label={`Delete report ${r.label} from ${formatDate(r.reportDate)}`}
                    >
                      Delete
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
