import { Link } from "react-router-dom";
import { ArrowRight, Compass, FileText, FlaskConical, Plus } from "lucide-react";

import { useHealthHistory } from "../hooks/useHealthHistory";
import { describeRepositoryError } from "../services/health";
import type { HealthHistoryContextValue } from "../context/healthHistoryContext";
import { factorFrequency, journeyStats } from "../lib/journey";
import { formatDate } from "../lib/format";
import { todayISO } from "../lib/healthRecords";
import { LEVEL_TONE } from "../lib/indicatorTone";
import Badge from "../components/ui/Badge";
import Card from "../components/ui/Card";
import Section from "../components/ui/Section";
import Disclaimer from "../components/ui/Disclaimer";
import EmergencyBanner from "../components/ui/EmergencyBanner";
import TrendsSection from "../components/trends/TrendsSection";
import WhatChanged from "../components/history/WhatChanged";
import AiExplainPanel from "../components/ai/AiExplainPanel";
import RecommendedReading from "../components/education/RecommendedReading";
import { analyseAll } from "../lib/trends";
import { compareAssessments } from "../lib/compare";
import LegacyMigrationNotice from "../components/history/LegacyMigrationNotice";
import AssessmentHistoryList from "../components/history/AssessmentHistoryList";
import {
  CurrentAssessmentCard,
  FactorSummary,
  JourneyTimeline,
  LatestMeasurements,
  ReportsList,
  StatTile,
} from "../components/journey/JourneyCards";

/**
 * My Health Journey (Project-II, Phase 5)
 * -------------------------------------------------------------
 * The central longitudinal dashboard: "how has my RECORDED health
 * information changed over time?". Everything shown comes from saved,
 * immutable history - no data is invented or recalculated here.
 *
 * Hierarchy (safety first): urgent warning from the latest assessment ->
 * current assessment -> measurements -> history/timeline -> supporting info.
 */
export default function Journey() {
  const history = useHealthHistory();
  const { assessments, reports } = history.history;
  const latest = history.latest;

  return (
    <main className="min-h-screen pt-28 pb-20">
      <div className="max-w-7xl mx-auto px-6">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-emerald-400 text-sm font-semibold uppercase tracking-widest">My Health</p>
            <h1 className="text-4xl md:text-5xl font-bold mt-4">Your health journey</h1>
            <p className="text-slate-400 mt-4 leading-relaxed">
              How your recorded health information has changed over time. This
              is a record of what you entered and confirmed - it is not a
              diagnosis.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Badge tone="neutral">
                {history.mode === "supabase" ? "Secure cloud history" : "Saved on this device only"}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 self-start lg:self-auto">
            {latest && (
              <Link
                to="/journey/scenarios"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/10 font-semibold hover:bg-white/5 transition"
              >
                <FlaskConical size={17} />
                Explore a scenario
              </Link>
            )}
            {latest && (
              <Link
                to="/journey/summary"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/10 font-semibold hover:bg-white/5 transition"
              >
                <FileText size={17} />
                Generate doctor summary
              </Link>
            )}
            <Link
              to="/assessment"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition"
            >
              <Plus size={17} />
              New assessment
            </Link>
          </div>
        </div>

        {history.status === "loading" && <JourneySkeleton />}

        {history.status === "error" && (
          <Card className="mt-10">
            <div role="alert">
              <h2 className="text-xl font-bold">Your history could not be loaded</h2>
              <p className="text-sm text-slate-400 mt-2">{history.error}</p>
              <button
                onClick={() => void history.refresh()}
                className="mt-5 px-5 py-2.5 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition"
              >
                Try again
              </button>
            </div>
          </Card>
        )}

        {history.status === "ready" && (
          <>
            {/* SAFETY - always first */}
            {latest?.result.safety.isUrgent && (
              <div className="mt-8">
                <EmergencyBanner triggers={latest.result.safety.triggers} />
                <p className="text-xs text-slate-500 mt-2">
                  From your latest assessment ({formatDate(latest.assessedOn)}).
                </p>
              </div>
            )}

            <LegacyMigrationNotice className="mt-8" />

            {assessments.length === 0 && reports.length === 0 ? (
              <EmptyJourney />
            ) : (
              <PopulatedJourney history={history} />
            )}
          </>
        )}

        <Disclaimer className="mt-12" />
      </div>
    </main>
  );
}

function PopulatedJourney({ history }: { history: HealthHistoryContextValue }) {
    const { assessments, reports, measurements } = history.history;
    const latest = history.latest;
    const stats = journeyStats(history.history, todayISO());
    const withBreakdown = assessments.filter((a) => a.result.factors.length > 0).length;

    return (
      <>
        {/* STATS */}
        <section aria-label="Key statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
          <StatTile
            label="Latest indicator"
            value={latest ? <Badge tone={LEVEL_TONE[latest.result.concernLevel]}>{latest.result.concernLevel} concern</Badge> : "--"}
            sub={latest ? `Educational indicator · ${formatDate(latest.assessedOn)}` : "No assessment yet"}
          />
          <StatTile
            label="Latest score"
            value={latest ? (latest.result.legacy ? latest.result.concernScore : `${latest.result.concernScore} / ${latest.result.maxScore}`) : "--"}
            sub={stats.daysSinceLatest === null ? undefined : stats.daysSinceLatest === 0 ? "Assessed today" : `${stats.daysSinceLatest} days ago`}
          />
          <StatTile
            label="Assessments"
            value={stats.assessmentCount}
            sub={stats.firstDate ? `Since ${formatDate(stats.firstDate)}` : undefined}
          />
          <StatTile
            label="Measurements"
            value={stats.measurementCount}
            sub={`${stats.reportCount} ${stats.reportCount === 1 ? "report" : "reports"} · ${stats.userVerifiedCount} entered or confirmed by you`}
          />
        </section>

        {/* CURRENT + MEASUREMENTS */}
        <section className="grid lg:grid-cols-3 gap-5 mt-5">
          <div className="lg:col-span-2">
            {latest ? (
              <CurrentAssessmentCard assessment={latest} />
            ) : (
              <Card className="h-full">
                <p className="text-sm text-slate-400">
                  You have reports in your history but no assessment yet.
                </p>
                <Link to="/assessment" className="inline-flex items-center gap-1.5 mt-4 text-sm text-emerald-400">
                  Start an assessment <ArrowRight size={15} />
                </Link>
              </Card>
            )}
          </div>
          <LatestMeasurements measurements={measurements} />
        </section>

        {/* TRENDS (Phase 6) */}
        <TrendsSection measurements={measurements} />

        {/* WHAT CHANGED (Phase 7) */}
        <WhatChanged assessments={assessments} selectable />

        {/* AI EXPLANATION of the latest assessment (Phase 9) */}
        {latest && (
          <AiExplainPanel
            key={latest.id}
            input={latest.input}
            result={latest.result}
            comparison={assessments.length > 1 ? compareAssessments(assessments[assessments.length - 2], latest) : null}
            measurements={measurements}
          />
        )}

        {/* PERSONALISED EDUCATION (Phase 10) */}
        <RecommendedReading result={latest?.result ?? null} trends={analyseAll(measurements)} />

        {/* FACTORS + TIMELINE */}
        <section className="grid lg:grid-cols-2 gap-5 mt-5">
          <FactorSummary factors={factorFrequency(assessments)} total={withBreakdown} />
          <JourneyTimeline history={history.history} />
        </section>

        {/* ASSESSMENT HISTORY */}
        {assessments.length > 0 && (
          <section className="mt-12" aria-label="Assessment history">
            <Section
              eyebrow="Assessment history"
              title="All saved assessments"
              description="Each assessment is a frozen snapshot of what you entered and the result at that time."
            />
            <AssessmentHistoryList assessments={assessments} currentId={latest?.id} className="mt-6" />
          </section>
        )}

        {/* REPORTS */}
        <section className="mt-12" aria-label="Medical reports">
          <ReportsList
            reports={reports}
            onDelete={async (id) => {
              if (!window.confirm("Delete this report and the values saved from it? This cannot be undone.")) return;
              try {
                await history.deleteReport(id);
              } catch (e) {
                window.alert(describeRepositoryError(e));
              }
            }}
            action={
              <Link
                to="/reports/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 text-sm font-semibold hover:bg-white/5 transition"
              >
                <Plus size={15} /> Add a report
              </Link>
            }
          />
        </section>
      </>
    );
}

function EmptyJourney() {
  return (
    <Card className="mt-10">
      <div className="max-w-2xl mx-auto text-center py-10">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-400/10 flex items-center justify-center">
          <Compass className="text-emerald-400" size={26} />
        </div>
        <h2 className="text-2xl font-bold mt-6">Your journey starts with your first assessment</h2>
        <p className="text-slate-400 mt-3 leading-relaxed">
          Each completed assessment is saved as a snapshot. Once you have more
          than one, this page shows how your recorded measurements and results
          have changed over time.
        </p>
        <Link
          to="/assessment"
          className="inline-flex items-center gap-2 mt-7 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition"
        >
          Start your first assessment
          <ArrowRight size={17} />
        </Link>
      </div>
    </Card>
  );
}

function JourneySkeleton() {
  return (
    <div className="mt-10" aria-busy="true">
      <p role="status" className="sr-only">Loading your health journey...</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-white/[0.04] animate-pulse" />
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-5 mt-5">
        <div className="lg:col-span-2 h-72 rounded-2xl bg-white/[0.04] animate-pulse" />
        <div className="h-72 rounded-2xl bg-white/[0.04] animate-pulse" />
      </div>
    </div>
  );
}
