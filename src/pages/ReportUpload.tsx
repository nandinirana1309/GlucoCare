import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, FileText, Plus, ShieldCheck, Upload, X } from "lucide-react";

import { useHealthHistory } from "../hooks/useHealthHistory";
import { extractReportText, ReportExtractionError } from "../services/reportExtractionService";
import { describeRepositoryError } from "../services/health";
import { parseReport, PARSER_VERSION } from "../lib/reportParser";
import type { ExtractionCandidate } from "../lib/reportParser";
import { newId, todayISO, validateRecordDate } from "../lib/healthRecords";
import { validateField } from "../lib/validation";
import type { ValidatableField } from "../lib/validation";
import { evaluateSafety } from "../lib/safety";
import { formatNumber } from "../lib/format";
import { emptyAssessment } from "../types/assessment";
import type {
  ExtractionConfidence,
  ExtractionMethod,
  GlucoseContext,
  MeasurementKind,
  NewExtractedValue,
  ReportFileType,
} from "../types/health";
import { MEASUREMENT_KINDS, MEASUREMENT_LABELS, MEASUREMENT_UNITS } from "../types/health";
import { GLUCOSE_CONTEXT_SHORT } from "../data/glucoseContext";
import Badge from "../components/ui/Badge";
import type { BadgeTone } from "../components/ui/Badge";
import Card from "../components/ui/Card";
import Disclaimer from "../components/ui/Disclaimer";
import EmergencyBanner from "../components/ui/EmergencyBanner";

/**
 * Medical report intelligence (Project-II, Phase 8)
 * -------------------------------------------------------------
 *   choose file -> read in browser (pdf.js / OCR) -> candidate values
 *   -> USER REVIEW (confirm / edit / reject every value, confirm the date)
 *   -> save verified values to history
 *
 * Extracted values are never trusted automatically: nothing is saved until
 * every candidate has an explicit decision. The file and its text are kept
 * in memory only and are discarded when the user leaves this page.
 */

type Phase = "choose" | "reading" | "review" | "saved";
type RowStatus = "pending" | "confirmed" | "rejected";

interface ReviewRow {
  key: string;
  kind: MeasurementKind;
  /** Value as extracted (canonical unit) - null for rows the user added. */
  extracted: number | null;
  value: string;
  status: RowStatus;
  added: boolean;
  confidence: ExtractionConfidence;
  matchedLabel?: string;
  originalUnit?: string | null;
  snippet?: string;
  notes: string[];
  glucoseContext?: GlucoseContext;
}

const CONFIDENCE_TONE: Record<ExtractionConfidence, BadgeTone> = { high: "positive", medium: "caution", low: "critical" };

function rowError(row: ReviewRow): string {
  if (row.value.trim() === "") return "Enter a value or reject this row.";
  if (row.kind === "bmi") {
    const n = Number(row.value);
    return Number.isFinite(n) && n >= 5 && n <= 150 ? "" : "Enter a BMI between 5 and 150.";
  }
  return validateField(row.kind as ValidatableField, row.value);
}

function fromCandidate(c: ExtractionCandidate): ReviewRow {
  return {
    key: c.key,
    kind: c.kind,
    extracted: c.value,
    value: String(c.value),
    status: "pending",
    added: false,
    confidence: c.confidence,
    matchedLabel: c.matchedLabel,
    originalUnit: c.originalUnit,
    snippet: c.snippet,
    notes: c.notes,
    glucoseContext: c.glucoseContext,
  };
}

export default function ReportUpload() {
  const navigate = useNavigate();
  const history = useHealthHistory();

  const [phase, setPhase] = useState<Phase>("choose");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ stage: string; fraction: number }>({ stage: "", fraction: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const [fileType, setFileType] = useState<ReportFileType>("pdf");
  const [method, setMethod] = useState<ExtractionMethod>("manual_only");
  const [pageCount, setPageCount] = useState<number | undefined>(undefined);
  const [readNote, setReadNote] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [label, setLabel] = useState("Lab report");
  const [reportDate, setReportDate] = useState("");
  const [dateNote, setDateNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [clientId] = useState(newId);

  /* ---------------- reading ---------------- */

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setPhase("reading");
    setProgress({ stage: "Checking the file", fraction: 0 });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const extracted = await extractReportText(file, (stage, fraction) => setProgress({ stage, fraction }), controller.signal);
      const parsed = parseReport(extracted.text, extracted.method === "pdf_text" ? "pdf_text" : "ocr");
      setFileType(extracted.fileType);
      setMethod(extracted.method);
      setPageCount(extracted.pageCount);
      setRows(parsed.candidates.map(fromCandidate));
      setReportDate(parsed.reportDate && !validateRecordDate(parsed.reportDate) ? parsed.reportDate : "");
      setDateNote(parsed.reportDateNote);
      setReadNote(
        [
          parsed.candidates.length === 0 ? "No supported values were found in this report. You can add values by hand below." : "",
          extracted.skippedPages > 0 ? `Only the first ${extracted.pageCount - extracted.skippedPages} pages were read.` : "",
        ].filter(Boolean).join(" "),
      );
      setPhase("review");
    } catch (e) {
      setPhase("choose");
      setError(e instanceof ReportExtractionError ? e.message : "The report could not be read.");
    } finally {
      abortRef.current = null;
    }
  };

  const manualOnly = (type: ReportFileType = "pdf") => {
    setError("");
    setFileType(type);
    setMethod("manual_only");
    setRows([]);
    setReadNote("Add the values from your report by hand.");
    setPhase("review");
  };

  /* ---------------- review ---------------- */

  const update = (key: string, patch: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const [newKind, setNewKind] = useState<MeasurementKind>("glucose");
  const addRow = () =>
    setRows((rs) => [
      ...rs,
      {
        key: `added-${newId()}`,
        kind: newKind,
        extracted: null,
        value: "",
        status: "pending",
        added: true,
        confidence: "high",
        notes: [],
        ...(newKind === "glucose" ? { glucoseContext: "unknown" as GlucoseContext } : {}),
      },
    ]);

  const pending = rows.filter((r) => r.status === "pending").length;
  const kept = rows.filter((r) => r.status === "confirmed");
  const dateError = reportDate === "" ? "Enter the date of the report." : validateRecordDate(reportDate);
  const labelError = label.trim() === "" ? "Enter a short name for this report." : "";
  const canSave = !saving && pending === 0 && kept.length > 0 && !dateError && !labelError;

  // Safety pre-check on the values about to be kept (same rules as everywhere else).
  const safety = useMemo(() => {
    const triggers = new Map<string, { reason: string; evidence: string }>();
    for (const r of rows) {
      if (r.status === "rejected" || rowError(r)) continue;
      if (r.kind !== "glucose" && r.kind !== "systolic" && r.kind !== "diastolic") continue;
      const status = evaluateSafety({ ...emptyAssessment, [r.kind]: r.value });
      for (const t of status.triggers) {
        triggers.set(`${t.ruleId}-${r.key}`, {
          reason: t.reason.replace("entered", "on this report"),
          evidence: `${MEASUREMENT_LABELS[r.kind]} on this report: ${r.value} ${MEASUREMENT_UNITS[r.kind]}`,
        });
      }
    }
    return [...triggers.values()];
  }, [rows]);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError("");
    const values: NewExtractedValue[] = rows.map((r) => {
      const final = r.status === "rejected" ? null : Number(r.value);
      const edited = !r.added && r.extracted !== null && final !== null && final !== r.extracted;
      return {
        kind: r.kind,
        ...(r.matchedLabel ? { matchedLabel: r.matchedLabel } : {}),
        extractedValue: r.added ? null : r.extracted,
        ...(r.originalUnit ? { extractedUnit: r.originalUnit } : {}),
        confidence: r.confidence,
        status: r.status === "rejected" ? "rejected" : r.added ? "added" : edited ? "edited" : "confirmed",
        finalValue: final,
        ...(r.kind === "glucose" ? { glucoseContext: r.glucoseContext ?? "unknown" } : {}),
      };
    });
    try {
      await history.saveReport({
        clientId,
        label: label.trim().slice(0, 120),
        reportDate,
        fileType,
        pageCount,
        extractionMethod: rows.every((r) => r.added) ? "manual_only" : method,
        parserVersion: PARSER_VERSION,
        values,
      });
      setRows([]); // drop extracted text snippets from memory
      setPhase("saved");
    } catch (e) {
      setSaveError(describeRepositoryError(e));
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- render ---------------- */

  return (
    <main className="min-h-screen pt-28 pb-20">
      <div className="max-w-5xl mx-auto px-6">
        <p className="text-emerald-400 text-sm font-semibold uppercase tracking-widest">Medical reports</p>
        <h1 className="text-4xl md:text-5xl font-bold mt-4">Add a medical report</h1>
        <p className="text-slate-400 mt-4 leading-relaxed max-w-3xl">
          GlucoCare reads supported values (glucose, HbA1c, blood pressure, height, weight, BMI) from your
          report. Reading is automatic, but <strong className="text-white">nothing is added to your history
          until you check every value</strong>. Automatic reading can make mistakes.
        </p>

        <div className="mt-6 flex gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
          <ShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-400 leading-relaxed">
            Your report is read in this browser. The file is not uploaded, not stored and not sent to any AI
            service. Only the values you confirm, the report date and a short name are saved. Scanned
            reports and photos use OCR, which downloads its text-recognition model the first time.
          </p>
        </div>

        {phase === "choose" && (
          <Card className="mt-8">
            <label className="block cursor-pointer">
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="sr-only" onChange={onFile} aria-label="Choose a report file (PDF, PNG or JPG)" />
              <div className="border-2 border-dashed border-white/10 rounded-2xl p-10 text-center hover:border-emerald-400/30 transition focus-within:border-emerald-400/60">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-400/10 flex items-center justify-center">
                  <Upload className="text-emerald-400" size={25} />
                </div>
                <p className="text-sm font-semibold mt-4">Choose a report</p>
                <p className="text-xs text-slate-500 mt-2">PDF, JPG or PNG · up to 10 MB · first 10 pages</p>
              </div>
            </label>
            {error && <p role="alert" className="text-sm text-red-400 mt-4">{error}</p>}
            <button onClick={() => manualOnly()} className="mt-5 text-sm text-slate-400 hover:text-white underline underline-offset-4">
              Or enter values from a report by hand
            </button>
          </Card>
        )}

        {phase === "reading" && (
          <Card className="mt-8">
            <div role="status" aria-live="polite">
              <p className="font-semibold">{progress.stage || "Reading the report"}...</p>
              <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
              </div>
              <p className="text-xs text-slate-500 mt-2">Scanned pages and photos can take up to a minute.</p>
            </div>
            <button
              onClick={() => abortRef.current?.abort()}
              className="mt-5 px-4 py-2 rounded-lg border border-white/10 text-sm text-slate-300 hover:bg-white/5"
            >
              Cancel
            </button>
          </Card>
        )}

        {phase === "review" && (
          <section className="mt-8 space-y-6" aria-label="Review extracted values">
            {safety.length > 0 && (
              <div>
                <EmergencyBanner triggers={safety} live />
                <p className="text-xs text-slate-500 mt-2">
                  This applies if the report reflects how you are now. Older reports are saved as they are.
                </p>
              </div>
            )}

            <Card>
              <h2 className="text-xl font-bold">Report details</h2>
              <div className="grid sm:grid-cols-2 gap-5 mt-5">
                <label className="block">
                  <span className="text-sm text-slate-300">Name for this report</span>
                  <input
                    value={label}
                    maxLength={120}
                    onChange={(e) => setLabel(e.target.value)}
                    className="w-full mt-2 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white"
                  />
                  <span className="text-xs text-slate-600 mt-1 block">Avoid names or ID numbers - e.g. "September lab tests".</span>
                  {labelError && <span className="text-xs text-red-400 block">{labelError}</span>}
                </label>
                <label className="block">
                  <span className="text-sm text-slate-300">Date of the report</span>
                  <input
                    type="date"
                    value={reportDate}
                    max={todayISO()}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="w-full mt-2 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white"
                  />
                  {dateNote && <span className="text-xs text-yellow-300 block mt-1">{dateNote}</span>}
                  {dateError && <span className="text-xs text-red-400 block mt-1">{dateError}</span>}
                </label>
              </div>
            </Card>

            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-bold">Check each value</h2>
                <p className="text-sm text-slate-500">
                  {pending > 0 ? `${pending} still to review` : rows.length > 0 ? "All values reviewed" : ""}
                </p>
              </div>
              {readNote && <p className="text-sm text-slate-400 mt-2">{readNote}</p>}

              <ul className="mt-5 space-y-4">
                {rows.map((r) => (
                  <ReviewRowItem key={r.key} row={r} onChange={(patch) => update(r.key, patch)} />
                ))}
              </ul>

              <div className="flex flex-wrap items-end gap-3 mt-6 pt-5 border-t border-white/10">
                <label className="block">
                  <span className="text-xs text-slate-400">Add a value that was missed</span>
                  <select
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as MeasurementKind)}
                    className="block mt-1 bg-[#10241f] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    {MEASUREMENT_KINDS.map((k) => (
                      <option key={k} value={k}>{MEASUREMENT_LABELS[k]}</option>
                    ))}
                  </select>
                </label>
                <button onClick={addRow} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/10 text-sm hover:bg-white/5">
                  <Plus size={15} /> Add value
                </button>
              </div>
            </Card>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <button
                onClick={() => { setRows([]); setPhase("choose"); }}
                className="text-sm text-slate-400 hover:text-white"
              >
                Discard and start again
              </button>
              <div className="text-right">
                <button
                  onClick={save}
                  disabled={!canSave}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check size={17} />
                  {saving ? "Saving..." : `Save ${kept.length} verified ${kept.length === 1 ? "value" : "values"} to my history`}
                </button>
                {!canSave && !saving && (
                  <p className="text-xs text-slate-500 mt-2">
                    {pending > 0
                      ? "Confirm or reject every value first."
                      : kept.length === 0
                        ? "Confirm at least one value to save this report."
                        : dateError || labelError}
                  </p>
                )}
                {saveError && <p role="alert" className="text-sm text-red-400 mt-2">{saveError}</p>}
              </div>
            </div>
          </section>
        )}

        {phase === "saved" && (
          <Card className="mt-8">
            <div role="status" className="text-center py-8">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-400/10 flex items-center justify-center">
                <FileText className="text-emerald-400" size={25} />
              </div>
              <h2 className="text-2xl font-bold mt-5">Report saved</h2>
              <p className="text-slate-400 mt-2">Your verified values are now part of your health history and trends.</p>
              <div className="flex flex-wrap justify-center gap-3 mt-6">
                <button onClick={() => navigate("/journey")} className="px-5 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition">
                  View my health journey
                </button>
                <Link to="/reports/new" reloadDocument className="px-5 py-3 rounded-xl border border-white/10 text-sm font-semibold hover:bg-white/5">
                  Add another report
                </Link>
              </div>
            </div>
          </Card>
        )}

        <Disclaimer className="mt-12" />
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function ReviewRowItem({ row, onChange }: { row: ReviewRow; onChange: (patch: Partial<ReviewRow>) => void }) {
  const err = rowError(row);
  const decided = row.status !== "pending";
  const edited = !row.added && row.extracted !== null && row.value.trim() !== "" && Number(row.value) !== row.extracted;
  const statusLabel =
    row.status === "rejected" ? "Rejected" : row.status === "confirmed" ? (row.added ? "Added by you" : edited ? "Edited by you" : "Confirmed") : row.added ? "New value" : "Extracted - not yet checked";
  const id = `value-${row.key}`;

  return (
    <li
      className={`rounded-2xl border p-4 sm:p-5 ${
        row.status === "rejected" ? "border-white/5 bg-white/[0.01] opacity-60" : row.status === "confirmed" ? "border-emerald-400/25 bg-emerald-400/[0.03]" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{MEASUREMENT_LABELS[row.kind]}</p>
        {!row.added && <Badge tone={CONFIDENCE_TONE[row.confidence]}>{row.confidence} confidence</Badge>}
        <Badge tone={row.status === "confirmed" ? "positive" : row.status === "rejected" ? "neutral" : "caution"}>{statusLabel}</Badge>
      </div>

      {row.snippet && (
        <p className="text-xs text-slate-500 mt-2 font-mono break-words">Found in report: "{row.snippet}"</p>
      )}
      {row.notes.map((n) => (
        <p key={n} className="text-xs text-yellow-200/80 mt-1">{n}</p>
      ))}

      <div className="flex flex-wrap items-end gap-3 mt-4">
        <label className="block" htmlFor={id}>
          <span className="text-xs text-slate-400">Value ({MEASUREMENT_UNITS[row.kind]})</span>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            value={row.value}
            disabled={row.status === "rejected"}
            onChange={(e) => onChange({ value: e.target.value, status: row.status === "confirmed" ? "pending" : row.status })}
            className="block mt-1 w-32 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-white disabled:opacity-50"
          />
        </label>
        {row.kind === "glucose" && (
          <label className="block">
            <span className="text-xs text-slate-400">When was it taken?</span>
            <select
              value={row.glucoseContext ?? "unknown"}
              disabled={row.status === "rejected"}
              onChange={(e) => onChange({ glucoseContext: e.target.value as GlucoseContext })}
              className="block mt-1 bg-[#10241f] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              {(["fasting", "random", "post_meal", "unknown"] as const).map((c) => (
                <option key={c} value={c}>{GLUCOSE_CONTEXT_SHORT[c]}</option>
              ))}
            </select>
          </label>
        )}
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => onChange({ status: "confirmed" })}
            disabled={Boolean(err) || row.status === "confirmed"}
            aria-pressed={row.status === "confirmed"}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-400 text-[#071512] text-sm font-bold disabled:opacity-40"
          >
            <Check size={15} /> {edited ? "Confirm edited value" : "Confirm"}
          </button>
          <button
            onClick={() => onChange({ status: row.status === "rejected" ? "pending" : "rejected" })}
            aria-pressed={row.status === "rejected"}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/10 text-sm hover:bg-white/5"
          >
            <X size={15} /> {row.status === "rejected" ? "Undo reject" : "Reject"}
          </button>
        </div>
      </div>
      {!decided && err && <p className="text-xs text-red-400 mt-2">{err}</p>}
      {edited && row.extracted !== null && (
        <p className="text-xs text-slate-500 mt-2">Extracted value was {formatNumber(row.extracted)} {MEASUREMENT_UNITS[row.kind]}.</p>
      )}
    </li>
  );
}
