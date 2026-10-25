import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Copy, Printer, Sparkles } from "lucide-react";

import { useHealthHistory } from "../hooks/useHealthHistory";
import { useAssessment } from "../hooks/useAssessment";
import { AI_OVERVIEW_LABEL, buildDoctorSummary, summaryToText } from "../lib/doctorSummary";
import { buildAiEvidence } from "../lib/aiEvidence";
import { compareAssessments } from "../lib/compare";
import { explainWithEvidence, isAiConfigured } from "../services/aiService";
import { formatDate } from "../lib/format";
import { todayISO } from "../lib/healthRecords";
import Card from "../components/ui/Card";

/**
 * Doctor / clinician consultation summary (Project-II, Phase 11).
 * Deterministic and traceable: built by lib/doctorSummary.ts from stored
 * history only. Rendered as a light "paper" sheet so it prints cleanly
 * (see the print rules in index.css).
 */
export default function DoctorSummary() {
  const { history, status, error, refresh, latest } = useHealthHistory();
  const { data: draft } = useAssessment();
  const [includeName, setIncludeName] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const [aiOverview, setAiOverview] = useState<string | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "rejected" | "error">("idle");
  const [aiError, setAiError] = useState("");

  const facts = useMemo(
    () => buildDoctorSummary(history, { generatedOn: todayISO(), displayName: includeName ? draft.name : undefined }),
    [history, includeName, draft.name],
  );
  const summary = aiOverview ? { ...facts, aiOverview } : facts;

  // Optional AI overview: generated from the SAME deterministic evidence and
  // validated by the AI guard. Never offered while safety is urgent.
  const aiAvailable = isAiConfigured && Boolean(latest?.result.safety.aiAllowed);
  const addAiOverview = async () => {
    if (!latest || !aiAvailable) return;
    setAiState("loading");
    const previous = history.assessments[history.assessments.length - 2];
    const evidence = buildAiEvidence({
      input: latest.input,
      result: latest.result,
      comparison: previous ? compareAssessments(previous, latest) : null,
      measurements: history.measurements,
    });
    const ai = await explainWithEvidence(evidence, latest.result.safety);
    if ((ai.status === "passed" || ai.status === "sanitized") && ai.content) {
      setAiOverview([ai.content.summary, ai.content.changeExplanation].filter(Boolean).join(" "));
      setAiState("idle");
    } else if (ai.status === "error") {
      setAiError(ai.errorMessage ?? "The AI service is unavailable.");
      setAiState("error");
    } else {
      setAiState("rejected");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summaryToText(summary));
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <main className="min-h-screen pt-28 pb-20">
      <div className="max-w-4xl mx-auto px-6">
        <div className="no-print">
          <Link to="/journey" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
            <ArrowLeft size={15} /> Back to my health journey
          </Link>
          <p className="text-emerald-400 text-sm font-semibold uppercase tracking-widest mt-6">Doctor summary</p>
          <h1 className="text-4xl md:text-5xl font-bold mt-4">Summary for your healthcare visit</h1>
          <p className="text-slate-400 mt-4 leading-relaxed">
            A factual summary of what you recorded in GlucoCare, to share with a healthcare professional. It
            contains no diagnosis and no treatment advice.
          </p>
        </div>

        {status === "loading" && <p role="status" className="text-slate-500 mt-10">Loading your history...</p>}
        {status === "error" && (
          <Card className="mt-10 no-print">
            <p role="alert" className="text-sm text-red-400">{error}</p>
            <button onClick={() => void refresh()} className="mt-4 px-4 py-2 rounded-lg bg-emerald-400 text-[#071512] font-bold">Try again</button>
          </Card>
        )}

        {status === "ready" && history.assessments.length === 0 && (
          <Card className="mt-10">
            <p className="text-slate-400">Complete an assessment first - the summary is built from your saved history.</p>
            <Link to="/assessment" className="inline-block mt-4 text-emerald-400">Start an assessment</Link>
          </Card>
        )}

        {status === "ready" && history.assessments.length > 0 && (
          <>
            <div className="no-print flex flex-wrap items-center gap-3 mt-8">
              <button onClick={copy} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition">
                {copied === "done" ? <Check size={17} /> : <Copy size={17} />}
                {copied === "done" ? "Copied" : "Copy as text"}
              </button>
              <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/10 font-semibold hover:bg-white/5 transition">
                <Printer size={17} /> Print or save as PDF
              </button>
              {draft.name && (
                <label className="inline-flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={includeName} onChange={(e) => setIncludeName(e.target.checked)} className="accent-emerald-400 w-4 h-4" />
                  Include my name (kept only on this device)
                </label>
              )}
              <span role="status" className="text-sm text-red-400">
                {copied === "failed" ? "Copying is blocked in this browser - use Print instead." : ""}
              </span>
            </div>

            {aiAvailable && (
              <div className="no-print mt-4 flex flex-wrap items-center gap-3 text-sm">
                {aiOverview ? (
                  <button onClick={() => setAiOverview(null)} className="text-slate-400 hover:text-white underline underline-offset-4">
                    Remove the AI overview
                  </button>
                ) : (
                  <button
                    onClick={addAiOverview}
                    disabled={aiState === "loading"}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 transition disabled:opacity-50"
                  >
                    <Sparkles size={15} />
                    {aiState === "loading" ? "Writing overview..." : "Add a plain-language AI overview (optional)"}
                  </button>
                )}
                <span role="status" className="text-slate-500">
                  {aiState === "rejected" && "The AI overview did not pass GlucoCare's safety checks, so it was not added."}
                  {aiState === "error" && <span className="text-red-400">{aiError}</span>}
                  {aiState === "idle" && !aiOverview && "The facts below are never changed by AI."}
                </span>
              </div>
            )}

            {/* THE SHEET */}
            <article className="print-sheet mt-6 rounded-2xl bg-white text-slate-900 p-6 sm:p-10 shadow-xl" aria-label="Health summary">
              <header className="border-b border-slate-200 pb-5">
                <h2 className="text-2xl font-bold">{summary.title}</h2>
                <p className="text-sm font-semibold text-emerald-700 mt-1">{summary.label}</p>
                <p className="text-xs text-slate-500 mt-1">Generated {formatDate(summary.generatedOn)}</p>
              </header>

              {summary.aiOverview && (
                <section className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 break-inside-avoid" aria-label="AI overview">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">{AI_OVERVIEW_LABEL}</h3>
                  <p className="text-sm mt-2 leading-relaxed">{summary.aiOverview}</p>
                </section>
              )}

              {summary.sections.map((sec) => (
                <section key={sec.id} className="mt-6 break-inside-avoid">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{sec.title}</h3>
                  {sec.rows.length === 0 ? (
                    <p className="text-sm text-slate-500 mt-2">{sec.empty}</p>
                  ) : (
                    <table className="w-full text-sm mt-2">
                      <tbody>
                        {sec.rows.map((row, i) => (
                          <tr key={i} className="border-t border-slate-100 align-top">
                            {row.label ? (
                              <>
                                <th scope="row" className="text-left font-medium text-slate-600 py-1.5 pr-4 w-2/5">{row.label}</th>
                                <td className="py-1.5">
                                  {row.value}
                                  {row.note && <span className="block text-xs text-slate-500">{row.note}</span>}
                                </td>
                              </>
                            ) : (
                              <td colSpan={2} className="py-1.5">{row.value}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              ))}

              <section className="mt-6 break-inside-avoid">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Questions to discuss with a healthcare professional</h3>
                <ol className="list-decimal pl-5 mt-2 space-y-1 text-sm">
                  {summary.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ol>
              </section>

              <footer className="mt-8 pt-4 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
                {summary.disclaimer}
              </footer>
            </article>
          </>
        )}
      </div>
    </main>
  );
}
