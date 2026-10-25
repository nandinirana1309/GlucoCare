import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ComponentType, ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  FlaskConical,
  HeartPulse,
  Pill,
  Salad,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
} from "lucide-react";

import { useAssessment } from "../hooks/useAssessment";
import { useHealthHistory } from "../hooks/useHealthHistory";
import { useClearAllData } from "../hooks/useClearAllData";
import { runAssessment } from "../lib/assessmentEngine";
import { formatDate } from "../lib/format";
import type { AssessmentData } from "../types/assessment";
import type { StoredAssessment } from "../types/health";
import { describeRepositoryError } from "../services/health";
import type { RepositoryMode } from "../services/health";
import LegacyMigrationNotice from "../components/history/LegacyMigrationNotice";
import AssessmentHistoryList from "../components/history/AssessmentHistoryList";
import WhatChanged from "../components/history/WhatChanged";
import AiExplainPanel from "../components/ai/AiExplainPanel";
import RecommendedReading from "../components/education/RecommendedReading";
import { analyseAll } from "../lib/trends";
import { compareAssessments } from "../lib/compare";
import { sanitizeAssessmentInput } from "../lib/healthRecords";
import type { Measurement } from "../types/health";
import type { AssessmentResult, ConcernLevel, IndicatorResult } from "../types/results";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { ratingToTone } from "../lib/indicatorTone";
import Section from "../components/ui/Section";
import Disclaimer from "../components/ui/Disclaimer";
import EmergencyBanner from "../components/ui/EmergencyBanner";
import FactorBreakdown from "../components/results/FactorBreakdown";

const REC_ICONS: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  Stethoscope,
  FlaskConical,
  Activity,
  HeartPulse,
  Salad,
  ShieldCheck,
  Pill,
};

const CONCERN_TONE: Record<ConcernLevel, { badge: "positive" | "caution" | "critical"; ring: string; icon: typeof CheckCircle2 }> = {
  Low: { badge: "positive", ring: "border-emerald-400/20 bg-emerald-400/5", icon: CheckCircle2 },
  Moderate: { badge: "caution", ring: "border-yellow-400/20 bg-yellow-400/5", icon: TriangleAlert },
  High: { badge: "critical", ring: "border-red-400/20 bg-red-400/5", icon: ShieldAlert },
};

/**
 * Which assessment the page shows (Project-II, Phase 4):
 *   /results/:id -> that saved assessment (frozen result, never recalculated)
 *   /results     -> the latest saved assessment; if nothing is saved yet but
 *                   a draft exists (e.g. from before history existed), the
 *                   draft is shown live and marked "not saved".
 */
export default function Results() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: draft, hasStarted } = useAssessment();
  const history = useHealthHistory();
  const clearAllData = useClearAllData();
  const [actionError, setActionError] = useState("");

  const stored = id ? history.getAssessment(id) : history.latest;

  const clearAll = async () => {
    try {
      if (await clearAllData()) {
        setActionError("");
        navigate("/results");
      }
    } catch (error) {
      setActionError(describeRepositoryError(error));
    }
  };

  const deleteOne = async (assessmentId: string) => {
    if (!confirm("Delete this saved assessment from your history? This cannot be undone.")) return;
    try {
      await history.deleteAssessment(assessmentId);
      setActionError("");
      navigate("/results");
    } catch (error) {
      setActionError(describeRepositoryError(error));
    }
  };

  if (history.status === "loading") return <LoadingState />;

  if (!stored && history.status === "error") {
    return <HistoryErrorState message={history.error} onRetry={() => void history.refresh()} />;
  }

  if (id && !stored) return <AssessmentNotFound />;

  if (!stored && !hasStarted) return <NoAssessment />;

  // Name and locality live only on this device - shown from the draft.
  const data: AssessmentData = stored
    ? { ...stored.input, name: draft.name, locality: draft.locality, report: null }
    : draft;

  return (
    <ResultsView
      key={stored?.id ?? "draft"}
      data={data}
      stored={stored ?? null}
      history={history.history.assessments}
      measurements={history.history.measurements}
      mode={history.mode}
      actionError={actionError}
      onClearAll={clearAll}
      onDelete={deleteOne}
    />
  );
}

function ResultsView({
  data,
  stored,
  history,
  mode,
  measurements,
  actionError,
  onClearAll,
  onDelete,
}: {
  data: AssessmentData;
  stored: StoredAssessment | null;
  history: StoredAssessment[];
  measurements: Measurement[];
  mode: RepositoryMode;
  actionError: string;
  onClearAll: () => void;
  onDelete: (id: string) => void;
}) {
  // A saved assessment shows its FROZEN result; an unsaved draft is computed live.
  const result = useMemo<AssessmentResult>(
    () => (stored ? stored.result : runAssessment(data)),
    [stored, data],
  );

  // Evidence for the AI: the change since the previous saved assessment and
  // measurements recorded up to this assessment's date (deterministic).
  const previous = stored ? history[history.findIndex((a) => a.id === stored.id) - 1] : undefined;
  const previousComparison = stored && previous ? compareAssessments(previous, stored) : null;
  const measurementsUpTo = stored ? measurements.filter((m) => m.measuredOn <= stored.assessedOn) : [];

  const tone = CONCERN_TONE[result.concernLevel];
  const ConcernIcon = tone.icon;

  return (
    <main className="min-h-screen pt-28 pb-20">
      <div className="max-w-7xl mx-auto px-6">

        {/* HEADER */}
        <div className="max-w-4xl">
          <p className="text-emerald-400 text-sm font-semibold uppercase tracking-widest">
            Assessment Complete
          </p>
          <h1 className="text-4xl md:text-5xl font-bold mt-4">Your health overview</h1>
          <p className="text-slate-400 mt-4 leading-relaxed">
            A summary based on the information you provided. Review it carefully
            and discuss anything that concerns you with a qualified healthcare
            professional.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-5">
            {stored ? (
              <>
                <Badge tone="positive">
                  <CalendarDays size={13} /> Assessment of {formatDate(stored.assessedOn)}
                </Badge>
                <Badge tone="neutral">
                  {mode === "supabase" ? "Saved to your history" : "Saved on this device"}
                </Badge>
                {stored.result.legacy && <Badge tone="info">Earlier GlucoCare version</Badge>}
              </>
            ) : (
              <Badge tone="caution">Not saved to your history yet</Badge>
            )}
          </div>
        </div>

        {/* SAFETY WARNING - always first. Driven only by result.safety (the
            single safety evaluation in src/lib/safety.ts). */}
        {result.safety.isUrgent && (
          <div className="mt-8">
            <EmergencyBanner triggers={result.safety.triggers} />
          </div>
        )}

        {/* PRE-PROJECT-II RECORD, offered for migration (below safety) */}
        <LegacyMigrationNotice className="mt-8" />

        {/* CONCERN CARD */}
        <section className="mt-10">
          <div className={`rounded-3xl border p-7 md:p-9 ${tone.ring}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-7">
              <div className="flex gap-5">
                <div className="w-14 h-14 shrink-0 rounded-2xl bg-white/5 flex items-center justify-center">
                  <ConcernIcon size={28} className="text-white" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Overall assessment indicator</p>
                  <div className="flex items-center gap-3 mt-1">
                    <h2 className="text-3xl font-bold">{result.concernLevel} Concern</h2>
                    <Badge tone={tone.badge}>Educational indicator</Badge>
                  </div>
                  <p className="text-sm text-slate-400 mt-2 max-w-2xl">
                    {result.concernSummary}
                  </p>
                </div>
              </div>

              <div className="text-left md:text-right">
                <p className="text-xs text-slate-600">Patient</p>
                <p className="font-semibold mt-1">{data.name || "Not provided"}</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-600 mt-3">
            This indicator is generated from published reference criteria and the
            information you entered. It is not a medical diagnosis.
          </p>
        </section>

        {/* WHY AM I SEEING THIS RESULT? (explainable score) */}
        <FactorBreakdown result={result} />

        {/* INDICATORS */}
        <section className="mt-12">
          <Section eyebrow="Key indicators" title="Health measurements" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-6">
            {result.indicators.map((indicator) => (
              <IndicatorCard key={indicator.key} indicator={indicator} />
            ))}
          </div>
        </section>

        {/* WHAT THIS MEANS */}
        <section className="mt-12">
          <Section
            eyebrow="Understanding your results"
            title="What your results mean"
            description="The reference criteria used for each indicator. GlucoCare cannot tell whether a glucose reading was taken fasting or randomly."
          />
          <div className="grid md:grid-cols-2 gap-5 mt-6">
            {result.indicators
              .filter((i) => i.rating !== "not-provided")
              .map((indicator) => (
                <Card key={indicator.key}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{indicator.label}</h3>
                    <Badge tone={ratingToTone(indicator.rating)}>{indicator.statusText}</Badge>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed mt-3">
                    {indicator.referenceText}{" "}
                    <span className="text-slate-600">{indicator.citation}</span>
                  </p>
                </Card>
              ))}
            {result.indicators.every((i) => i.rating === "not-provided") && (
              <Card>
                <p className="text-sm text-slate-500">
                  No measurements were entered, so there is nothing to compare
                  against reference criteria. You can add measurements in the
                  assessment.
                </p>
              </Card>
            )}
          </div>
        </section>

        {/* RISK FACTORS */}
        <section className="mt-12">
          <Section
            eyebrow="Contributing factors"
            title="Risk factors identified"
            description="Factors from your input that are associated with diabetes risk or that affect management."
          />
          {result.riskFactors.length === 0 ? (
            <Card className="mt-6">
              <p className="text-sm text-slate-500">
                No specific risk factors were identified from the information
                provided.
              </p>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4 mt-6">
              {result.riskFactors.map((factor) => (
                <div
                  key={factor.label}
                  className="flex gap-3 rounded-2xl border border-white/10 bg-[#0b1d19] p-5"
                >
                  <TriangleAlert size={18} className="text-yellow-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">{factor.label}</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{factor.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* TWO COLUMN: symptoms + patient info */}
        <section className="grid lg:grid-cols-2 gap-6 mt-12">
          <Card>
            <CardHead icon={<HeartPulse size={21} className="text-emerald-400" />} eyebrow="Symptoms" title="Reported symptoms" />
            {data.symptoms.length === 0 && !data.otherSymptoms && data.warningSigns.length === 0 ? (
              <p className="text-sm text-slate-500 mt-7">No symptoms were selected.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-7">
                {data.symptoms.map((s) => (
                  <span key={s} className="px-3 py-2 rounded-lg bg-emerald-400/10 border border-emerald-400/10 text-emerald-300 text-xs">
                    {s}
                  </span>
                ))}
                {data.warningSigns.map((s) => (
                  <span key={s} className="px-3 py-2 rounded-lg bg-red-400/10 border border-red-400/20 text-red-300 text-xs">
                    {s}
                  </span>
                ))}
                {data.otherSymptoms && (
                  <span className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs">
                    {data.otherSymptoms}
                  </span>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHead icon={<Activity size={21} className="text-emerald-400" />} eyebrow="Profile" title="Patient information" />
            <div className="grid grid-cols-2 gap-5 mt-7">
              <Info label="Age" value={data.age || "Not provided"} />
              <Info label="Gender" value={data.gender || "Not provided"} />
              <Info label="Diabetes" value={data.diabetesStatus || "Not provided"} />
              <Info label="Diabetes Type" value={data.diabetesType || "--"} />
              <Info label="Family History" value={data.familyHistory || "Not provided"} />
              <Info label="Activity" value={data.activityLevel || "Not provided"} />
              <Info label="Smoking" value={data.smoking || "Not provided"} />
              <Info label="Locality" value={data.locality || "Not provided"} />
            </div>
          </Card>
        </section>

        {/* RECOMMENDATIONS */}
        <section className="mt-12">
          <Section
            eyebrow="General guidance"
            title="Recommendations"
            description="General educational suggestions based on your input. None of this is a prescription."
          />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
            {result.recommendations.map((rec) => {
              const Icon = REC_ICONS[rec.icon] ?? Activity;
              return (
                <Card key={rec.id}>
                  <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">
                    <Icon size={20} />
                  </div>
                  <h3 className="font-semibold mt-5">{rec.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed mt-2">{rec.detail}</p>
                </Card>
              );
            })}
          </div>
        </section>

        {/* PERSONALISED EDUCATION (Phase 10) */}
        <RecommendedReading result={result} trends={analyseAll(measurementsUpTo)} />

        {/* AI EXPLANATION (Phase 9: evidence-based, guarded, blocked when urgent) */}
        <AiExplainPanel
          input={stored ? stored.input : sanitizeAssessmentInput(data)}
          result={result}
          comparison={previousComparison}
          measurements={measurementsUpTo}
        />

        {/* HEALTHCARE CTA */}
        <section className="mt-12">
          <Card>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <CardHead
                icon={<Stethoscope size={22} className="text-emerald-400" />}
                eyebrow="Healthcare"
                title="Find healthcare near you"
              />
              <Link
                to="/healthcare"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/10 text-sm font-semibold hover:bg-white/5 transition shrink-0"
              >
                {data.locality ? `Search near ${data.locality}` : "Open healthcare finder"}
                <ArrowRight size={16} />
              </Link>
            </div>
          </Card>
        </section>

        {/* MEDICATION REMINDER */}
        <section className="mt-8">
          <div className="rounded-2xl border border-yellow-400/10 bg-yellow-400/[0.03] p-5">
            <div className="flex gap-3">
              <Pill className="text-yellow-400 shrink-0" size={20} />
              <div>
                <p className="text-sm font-semibold">Medication reminder</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  GlucoCare does not prescribe or recommend specific medicines or
                  dosages. Medication decisions should always be made with a
                  qualified healthcare professional.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* WHAT CHANGED since the assessment before this one (Phase 7) */}
        {stored && history.length > 1 && (
          <WhatChanged key={stored.id} assessments={history} currentId={stored.id} />
        )}

        {/* SAVED ASSESSMENTS */}
        {history.length > 0 && (
          <section className="mt-12" aria-label="Your saved assessments">
            <Section eyebrow="Health history" title="Your saved assessments" />
            <AssessmentHistoryList
              assessments={history}
              currentId={stored?.id}
              className="mt-6"
            />
            <Link
              to="/journey"
              className="inline-flex items-center gap-1.5 mt-4 text-sm text-emerald-400 hover:text-emerald-300 transition"
            >
              Open my health journey
              <ArrowRight size={15} />
            </Link>
          </section>
        )}

        {/* FOOTER ACTIONS */}
        {actionError && (
          <p role="alert" className="mt-8 text-sm text-red-400">{actionError}</p>
        )}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Disclaimer className="mx-0 text-left" />
          <div className="flex items-center gap-5 shrink-0">
            {stored && (
              <button
                onClick={() => onDelete(stored.id)}
                className="text-xs text-slate-500 hover:text-red-400 transition"
              >
                Delete this assessment
              </button>
            )}
            <button
              onClick={onClearAll}
              className="text-xs text-slate-500 hover:text-red-400 transition"
            >
              Clear my data
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function LoadingState() {
  return (
    <main className="min-h-screen pt-32 px-6" aria-busy="true">
      <div className="max-w-xl mx-auto text-center py-24">
        <div className="w-10 h-10 mx-auto rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
        <p className="text-slate-500 mt-6" role="status">Loading your health history...</p>
      </div>
    </main>
  );
}

function HistoryErrorState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <main className="min-h-screen pt-32 px-6">
      <div className="max-w-xl mx-auto text-center py-24" role="alert">
        <h1 className="text-3xl font-bold">Your history could not be loaded</h1>
        <p className="text-slate-400 mt-4">{message}</p>
        <button
          onClick={onRetry}
          className="mt-8 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition"
        >
          Try again
        </button>
      </div>
    </main>
  );
}

function AssessmentNotFound() {
  return (
    <main className="min-h-screen pt-32 px-6">
      <div className="max-w-xl mx-auto text-center py-24">
        <h1 className="text-3xl font-bold">Assessment not found</h1>
        <p className="text-slate-500 mt-4">
          It may have been deleted, or it belongs to a different device or session.
        </p>
        <Link
          to="/results"
          className="inline-flex items-center gap-2 mt-8 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold"
        >
          View latest results
          <ArrowRight size={17} />
        </Link>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function IndicatorCard({ indicator }: { indicator: IndicatorResult }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b1d19] p-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">
          <Activity size={18} />
        </div>
        <span className="text-sm text-slate-500">{indicator.label}</span>
      </div>
      <div className="mt-6">
        <span className="text-3xl font-bold">{indicator.value}</span>
        <span className="text-xs text-slate-600 ml-1">{indicator.unit}</span>
      </div>
      <div className="mt-3">
        <Badge tone={ratingToTone(indicator.rating)}>{indicator.statusText}</Badge>
      </div>
    </div>
  );
}

function CardHead({ icon, eyebrow, title }: { icon: ReactNode; eyebrow: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl bg-emerald-400/10 flex items-center justify-center">{icon}</div>
      <div>
        <p className="text-xs text-slate-600 uppercase tracking-widest">{eyebrow}</p>
        <h2 className="text-xl font-bold mt-1">{title}</h2>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-600">{label}</p>
      <p className="text-sm text-slate-300 mt-1">{value}</p>
    </div>
  );
}

function NoAssessment() {
  return (
    <main className="min-h-screen pt-32 px-6">
      <div className="max-w-xl mx-auto text-center py-24">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-400/10 flex items-center justify-center">
          <FileText className="text-emerald-400" size={28} />
        </div>
        <h1 className="text-4xl font-bold mt-7">No assessment found</h1>
        <p className="text-slate-500 mt-4">
          Complete the diabetes health assessment first to view your results.
        </p>
        <Link
          to="/assessment"
          className="inline-flex items-center gap-2 mt-8 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold"
        >
          Start Assessment
          <ArrowRight size={17} />
        </Link>
      </div>
    </main>
  );
}
