import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { History } from "lucide-react";

import { useHealthHistory } from "../../hooks/useHealthHistory";
import { useAssessment } from "../../hooks/useAssessment";
import { todayISO, validateRecordDate } from "../../lib/healthRecords";
import { describeRepositoryError } from "../../services/health";
import type { AssessmentData } from "../../types/assessment";

const MEASURED_FIELDS: (keyof AssessmentData)[] = [
  "glucose", "hba1c", "systolic", "diastolic", "weight", "symptoms", "warningSigns",
];

const sameMeasurements = (a: AssessmentData, b: AssessmentData) =>
  MEASURED_FIELDS.every((f) => JSON.stringify(a[f]) === JSON.stringify(b[f]));

/**
 * Offers to copy an assessment saved by the pre-Project-II app into history.
 * Opt-in only; the original record is never deleted (see legacyMigration.ts).
 */
export default function LegacyMigrationNotice({ className = "" }: { className?: string }) {
  const { legacyAssessment, migrateLegacy, dismissLegacy } = useHealthHistory();
  const { data: draft, startNewDraft } = useAssessment();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!legacyAssessment) return null;
  const dateError = validateRecordDate(date);

  const migrate = async () => {
    setBusy(true);
    setError("");
    try {
      const stored = await migrateLegacy(date);
      // If the form still holds the same readings, start a fresh draft so they
      // cannot be saved a second time as a "new" assessment.
      if (sameMeasurements(draft, legacyAssessment)) startNewDraft();
      if (stored) navigate(`/results/${stored.id}`);
    } catch (e) {
      setError(describeRepositoryError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Earlier assessment found"
      className={`rounded-2xl border border-sky-400/20 bg-sky-400/[0.05] p-5 ${className}`}
    >
      <div className="flex gap-3">
        <History size={20} className="text-sky-300 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold">An assessment from before health history was added</p>
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">
            GlucoCare found an assessment saved on this device by an earlier
            version. You can copy it into your health history so it appears in
            your journey and trends. Nothing is deleted either way.
          </p>
          <div className="flex flex-wrap items-end gap-3 mt-4">
            <label className="block">
              <span className="text-xs text-slate-400">Date of those measurements</span>
              <input
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                className="block mt-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <button
              onClick={migrate}
              disabled={busy || Boolean(dateError)}
              className="px-4 py-2 rounded-lg bg-emerald-400 text-[#071512] text-sm font-bold hover:bg-emerald-300 transition disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save to my history"}
            </button>
            <button
              onClick={dismissLegacy}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-white/10 text-sm text-slate-300 hover:bg-white/5 transition"
            >
              Not now
            </button>
          </div>
          {(dateError || error) && (
            <p role="alert" className="text-xs text-red-400 mt-2">{dateError || error}</p>
          )}
        </div>
      </div>
    </section>
  );
}
