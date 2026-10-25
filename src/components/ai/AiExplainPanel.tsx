import { useState } from "react";
import { CheckCircle2, MessageCircleQuestion, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";

import type { AiExplanationV2 } from "../../types/ai";
import type { AssessmentInputs, Measurement } from "../../types/health";
import type { AssessmentResult } from "../../types/results";
import type { AssessmentComparison } from "../../lib/compare";
import { buildAiEvidence } from "../../lib/aiEvidence";
import { explainWithEvidence, isAiConfigured } from "../../services/aiService";
import Card from "../ui/Card";
import Section from "../ui/Section";
import FutureBadge from "../ui/FutureBadge";

/**
 * AI-assisted explanation (Project-II, Phase 9).
 *
 *   deterministic result -> evidence (minimum data) -> AI -> guard -> shown
 *
 * The AI explains the result; it never changes it. If safety is urgent the
 * AI is never called. Every reply is checked by lib/aiGuard.ts; removed or
 * blocked content is never displayed.
 */
export default function AiExplainPanel({
  input,
  result,
  comparison,
  measurements,
}: {
  input: AssessmentInputs;
  result: AssessmentResult;
  comparison?: AssessmentComparison | null;
  measurements?: Measurement[];
}) {
  const [ai, setAi] = useState<AiExplanationV2 | null>(null);
  const [loading, setLoading] = useState(false);
  const blocked = !result.safety.aiAllowed;

  const request = async () => {
    if (blocked || loading) return;
    setLoading(true);
    const evidence = buildAiEvidence({ input, result, comparison, measurements });
    setAi(await explainWithEvidence(evidence, result.safety));
    setLoading(false);
  };

  return (
    <section className="mt-12" aria-label="AI-assisted explanation">
      <div className="flex flex-wrap items-center gap-3">
        <Section eyebrow="Optional" title="AI-assisted explanation" />
        {!isAiConfigured && !blocked && <FutureBadge label="Not connected yet" />}
      </div>

      <Card className="mt-6">
        {blocked || ai?.status === "blocked-by-safety" ? (
          <AiBlockedNotice />
        ) : !isAiConfigured ? (
          <p className="text-sm text-slate-400 leading-relaxed">
            An AI assistant can explain these results in simpler language. It is switched off here because no
            AI service is configured (see <span className="text-slate-300">docs/AI-SETUP.md</span>). When enabled
            it only receives the calculated result - never your name, location or reports - and every reply is
            checked by GlucoCare's rules before it is shown.
          </p>
        ) : ai === null || ai.status === "error" ? (
          <div>
            <p className="text-sm text-slate-400 leading-relaxed">
              Get a plain-language explanation of the result above. The AI only explains GlucoCare's calculated
              result; it does not change the score or level, diagnose or prescribe.
            </p>
            {ai?.status === "error" && (
              <p role="alert" className="text-sm text-red-400 mt-3">
                The explanation could not be generated ({ai.errorMessage}). Please try again later.
              </p>
            )}
            <button
              onClick={request}
              disabled={loading}
              className="mt-4 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition disabled:opacity-50"
            >
              <Sparkles size={16} />
              {loading ? "Generating..." : ai?.status === "error" ? "Try again" : "Explain my results"}
            </button>
          </div>
        ) : ai.status === "blocked" || !ai.content ? (
          <div role="status" className="flex gap-3">
            <ShieldAlert size={20} className="text-yellow-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">The AI response was not shown</p>
              <p className="text-sm text-slate-400 leading-relaxed mt-1">
                It did not pass GlucoCare's safety checks (for example it changed the result, used values that are
                not in your data, or gave medical instructions). The section "Why am I seeing this result?" above is
                built directly from your data and is not affected.
              </p>
            </div>
          </div>
        ) : (
          <AiContent ai={ai} result={result} />
        )}
      </Card>
    </section>
  );
}

function AiContent({ ai, result }: { ai: AiExplanationV2; result: AssessmentResult }) {
  const c = ai.content!;
  const label = (id: string) => result.factors.find((f) => f.id === id)?.label ?? id;
  return (
    <div className="space-y-5">
      <p className="inline-flex items-center gap-2 text-xs text-emerald-300">
        <ShieldCheck size={14} /> AI-assisted · checked against your calculated result
      </p>
      {ai.status === "sanitized" && (
        <p className="text-xs text-yellow-200/80 rounded-lg border border-yellow-400/15 bg-yellow-400/[0.04] p-3">
          {ai.issues.length} {ai.issues.length === 1 ? "part was" : "parts were"} removed because {ai.issues.length === 1 ? "it" : "they"} did not
          pass GlucoCare's safety checks.
        </p>
      )}
      <p className="text-sm text-slate-300 leading-relaxed">{c.summary}</p>

      {c.factorExplanations.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">About your contributing factors</p>
          <ul className="mt-2 space-y-2">
            {c.factorExplanations.map((f) => (
              <li key={f.factorId} className="text-sm text-slate-400">
                <span className="text-white font-medium">{label(f.factorId)}:</span> {f.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.changeExplanation && (
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">Since your previous assessment</p>
          <p className="text-sm text-slate-400 mt-2">{c.changeExplanation}</p>
        </div>
      )}

      {c.generalTips.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">General tips</p>
          <ul className="mt-2 space-y-1">
            {c.generalTips.map((t) => (
              <li key={t} className="text-sm text-slate-400 flex gap-2">
                <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" /> {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.questionsForClinician.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">Questions you could ask a professional</p>
          <ul className="mt-2 space-y-1">
            {c.questionsForClinician.map((q) => (
              <li key={q} className="text-sm text-slate-400 flex gap-2">
                <MessageCircleQuestion size={15} className="text-emerald-400 shrink-0 mt-0.5" /> {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.terms.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">Terms explained</p>
          <div className="mt-2 space-y-2">
            {c.terms.map((t) => (
              <p key={t.term} className="text-sm text-slate-400">
                <span className="text-white font-medium">{t.term}:</span> {t.meaning}
              </p>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-600 leading-relaxed border-t border-white/10 pt-4">{ai.disclaimer}</p>
    </div>
  );
}

/** Shown instead of the AI explanation while safety is urgent (Phase 2 gate). */
function AiBlockedNotice() {
  return (
    <div className="flex gap-3" role="status">
      <ShieldAlert size={20} className="text-red-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold">AI explanation is unavailable while a safety warning is active</p>
        <p className="text-sm text-slate-400 leading-relaxed mt-1">
          Some of the information you entered may need prompt medical attention. Please review the safety warning at
          the top of this page and contact a qualified healthcare professional or your local emergency service.
        </p>
      </div>
    </div>
  );
}
