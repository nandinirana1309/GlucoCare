import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ComponentType, ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  FileText,
  FlaskConical,
  HeartPulse,
  Pill,
  Salad,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TriangleAlert,
} from "lucide-react";

import { useAssessment } from "../hooks/useAssessment";
import { runAssessment } from "../lib/assessmentEngine";
import type { AssessmentResult, ConcernLevel, IndicatorResult } from "../types/results";
import type { AiExplanation } from "../types/ai";
import { explainResults, isAiConfigured } from "../services/aiService";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { ratingToTone } from "../lib/indicatorTone";
import Section from "../components/ui/Section";
import Disclaimer from "../components/ui/Disclaimer";
import EmergencyBanner from "../components/ui/EmergencyBanner";
import FutureBadge from "../components/ui/FutureBadge";

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

export default function Results() {
  const { data, hasStarted, reset } = useAssessment();

  const result = useMemo<AssessmentResult>(() => runAssessment(data), [data]);

  const [ai, setAi] = useState<AiExplanation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  if (!hasStarted) {
    return <NoAssessment />;
  }

  const requestAi = async () => {
    setAiLoading(true);
    const explanation = await explainResults({
      result,
      context: {
        age: data.age,
        gender: data.gender,
        diabetesStatus: data.diabetesStatus,
        familyHistory: data.familyHistory,
        activityLevel: data.activityLevel,
        smoking: data.smoking,
        dietPattern: data.dietPattern,
        symptoms: data.symptoms,
      },
    });
    setAi(explanation);
    setAiLoading(false);
  };

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
        </div>

        {/* EMERGENCY BANNER */}
        {result.redFlags.length > 0 && (
          <div className="mt-8">
            <EmergencyBanner reasons={result.redFlags.map((f) => f.reason)} />
          </div>
        )}

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

        {/* AI EXPLANATION (Stage 8) */}
        <section className="mt-12">
          <div className="flex items-center gap-3">
            <Section eyebrow="Optional" title="AI-assisted explanation" />
            {!isAiConfigured && <FutureBadge label="Not connected yet" />}
          </div>

          <Card className="mt-6">
            {!isAiConfigured ? (
              <p className="text-sm text-slate-400 leading-relaxed">
                An AI assistant can explain these results in simpler language,
                define medical terms and suggest what kind of professional to
                consult. It is switched off here because no AI service is
                configured (see <span className="text-slate-300">docs/AI-SETUP.md</span>).
                When enabled it never diagnoses or recommends medication.
              </p>
            ) : ai === null ? (
              <div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Generate a plain-language explanation of the results above.
                  This does not diagnose or prescribe.
                </p>
                <button
                  onClick={requestAi}
                  disabled={aiLoading}
                  className="mt-4 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition disabled:opacity-50"
                >
                  <Sparkles size={16} />
                  {aiLoading ? "Generating..." : "Explain my results"}
                </button>
              </div>
            ) : ai.status === "error" ? (
              <p className="text-sm text-red-400">
                The explanation could not be generated ({ai.errorMessage}). Please try again later.
              </p>
            ) : (
              <AiResult ai={ai} />
            )}
          </Card>
        </section>

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

        {/* FOOTER ACTIONS */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Disclaimer className="mx-0 text-left" />
          <button
            onClick={() => {
              if (confirm("This will delete the assessment saved in this browser. Continue?")) {
                reset();
              }
            }}
            className="text-xs text-slate-500 hover:text-red-400 transition shrink-0"
          >
            Clear my data
          </button>
        </div>
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

function AiResult({ ai }: { ai: AiExplanation }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-300 leading-relaxed">{ai.summary}</p>

      {ai.termNotes.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">Terms explained</p>
          <div className="mt-2 space-y-2">
            {ai.termNotes.map((note) => (
              <p key={note.term} className="text-sm text-slate-400">
                <span className="text-white font-medium">{note.term}:</span> {note.meaning}
              </p>
            ))}
          </div>
        </div>
      )}

      {ai.suggestions.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">Suggestions</p>
          <ul className="mt-2 space-y-1">
            {ai.suggestions.map((s) => (
              <li key={s} className="text-sm text-slate-400 flex gap-2">
                <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ai.whoToSee && (
        <p className="text-sm text-slate-400">
          <span className="text-white font-medium">Who to consider seeing:</span> {ai.whoToSee}
        </p>
      )}

      <p className="text-xs text-slate-600 leading-relaxed border-t border-white/10 pt-4">
        {ai.disclaimer}
      </p>
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
