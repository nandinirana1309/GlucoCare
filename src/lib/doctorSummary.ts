/**
 * GlucoCare - clinician consultation summary (Phase 11)
 * -------------------------------------------------------------
 * A deterministic, FACTUAL summary of what the user recorded, for them to
 * take to a healthcare professional. Every line is copied from stored
 * history (assessments, measurements, reports) or from the deterministic
 * trend / comparison functions. It does not diagnose, does not suggest any
 * treatment, and does not tell the clinician what to do. The questions are
 * fixed templates filled with the user's own values.
 *
 * The name is only included when the user explicitly chooses to - it is
 * kept on this device and is never part of stored history.
 */

import type { HealthHistory, MeasurementKind } from "../types/health";
import { MEASUREMENT_KINDS, MEASUREMENT_LABELS } from "../types/health";
import type { ScoreFactor } from "../types/results";
import { GLUCOSE_CONTEXT_SHORT } from "../data/glucoseContext";
import { compareAssessments, describeComparison } from "./compare";
import { formatDate, formatNumber } from "./format";
import { latestByKind, VERIFICATION_LABEL } from "./journey";
import { analyseAll } from "./trends";

export const SUMMARY_LABEL =
  "User-generated health summary for discussion with a healthcare professional.";

export const SUMMARY_DISCLAIMER =
  "Prepared by the user with GlucoCare, an educational tool. It is not a medical record, not a diagnosis and not a treatment recommendation. Values were entered or confirmed by the user; 'concern level' is GlucoCare's educational indicator based on published reference criteria.";

export interface SummaryRow {
  label: string;
  value: string;
  note?: string;
}

export interface SummarySection {
  id: string;
  title: string;
  rows: SummaryRow[];
  /** Shown when the section has no rows. */
  empty: string;
}

export interface DoctorSummary {
  title: string;
  label: string;
  generatedOn: string;
  sections: SummarySection[];
  questions: string[];
  disclaimer: string;
  /**
   * Optional plain-language overview written by the AI (Phase 11 option).
   * Only ever set from a reply that passed lib/aiGuard.ts against the same
   * facts; the deterministic sections above are never reworded.
   */
  aiOverview?: string;
}

export const AI_OVERVIEW_LABEL =
  "Plain-language overview (AI-assisted, automatically checked against the facts in this summary)";

const show = (v: string | undefined | null) => (v && v.trim() ? v.trim() : "Not provided");

/* ------------------------------------------------------------------ */
/*  Questions (fixed templates, filled with the user's own values)     */
/* ------------------------------------------------------------------ */

function factorQuestion(f: ScoreFactor, glucoseContext: string): string | null {
  switch (f.id) {
    case "glucose":
      return `My recorded blood glucose was ${f.displayValue}${glucoseContext}. Would repeat or confirmatory testing be appropriate?`;
    case "hba1c":
      return `My recorded HbA1c was ${f.displayValue}. What does this mean for me, and when should it be checked again?`;
    case "bloodPressure":
      return `My blood pressure was recorded as ${f.displayValue}. How often should I check it, and how should I record it?`;
    case "bmi":
      return `My BMI was recorded as ${f.displayValue}. Could we discuss realistic goals for weight, activity and eating?`;
    case "symptoms":
      return `I have noticed some symptoms (${f.displayValue}). Could they be related to my blood glucose or to something else?`;
    case "familyHistory":
      return "I have a family history of diabetes. How often should I be checked?";
    case "diabetesStatus":
      return f.displayValue === "Not sure"
        ? "I am not sure whether I have been diagnosed with diabetes. Could we check my records?"
        : "Could we review how my diabetes care and monitoring are going?";
    case "activity":
      return "What kind and amount of physical activity is safe and suitable for me?";
    case "smoking":
      return "What support is available to help me stop smoking?";
    case "diet":
      return "Could I get advice, for example from a dietitian, about my eating pattern?";
    default:
      return null; // age: no separate question
  }
}

/* ------------------------------------------------------------------ */

export function buildDoctorSummary(
  history: HealthHistory,
  options: { displayName?: string; generatedOn: string },
): DoctorSummary {
  const { assessments, measurements, reports } = history;
  const latest = assessments[assessments.length - 1];
  const previous = assessments[assessments.length - 2];
  const sections: SummarySection[] = [];

  /* 1. Patient information (as entered by the user) */
  const inp = latest?.input;
  sections.push({
    id: "patient",
    title: "Patient information (as entered by the user)",
    empty: "No assessment has been completed yet.",
    rows: inp
      ? [
          ...(options.displayName?.trim() ? [{ label: "Name", value: options.displayName.trim() }] : []),
          { label: "Age", value: inp.age ? `${inp.age} years` : "Not provided" },
          { label: "Sex", value: show(inp.gender) },
          { label: "Told they have diabetes", value: show(inp.diabetesStatus) + (inp.diabetesType ? ` (${inp.diabetesType})` : "") },
          { label: "Family history of diabetes", value: show(inp.familyHistory) },
          { label: "Other conditions", value: show(inp.otherConditions), note: inp.otherConditions ? "Free text entered by the user" : undefined },
          { label: "Physical activity", value: show(inp.activityLevel) },
          { label: "Smoking", value: show(inp.smoking) },
          { label: "Usual eating pattern", value: show(inp.dietPattern) },
          { label: "Sleep", value: inp.sleepHours ? `${inp.sleepHours} hours per night` : "Not provided" },
        ]
      : [],
  });

  /* 2. Latest assessment */
  const r = latest?.result;
  sections.push({
    id: "assessment",
    title: "Latest GlucoCare assessment",
    empty: "No assessment has been completed yet.",
    rows: latest && r
      ? [
          { label: "Date", value: formatDate(latest.assessedOn) },
          {
            label: "Concern level (educational indicator)",
            value: r.concernLevel,
            note:
              r.levelBasis.type === "red-flag"
                ? `Set to High by a safety rule; on points alone it would be ${r.levelBasis.scoreLevel}.`
                : `From the score: Low below ${r.levelBasis.thresholds.moderate}, Moderate ${r.levelBasis.thresholds.moderate}-${r.levelBasis.thresholds.high - 1}, High ${r.levelBasis.thresholds.high}+.`,
          },
          { label: "Score", value: r.legacy ? String(r.concernScore) : `${r.concernScore} of ${r.maxScore} points` },
          { label: "GlucoCare engine version", value: r.engineVersion },
        ]
      : [],
  });

  /* 3. Safety flags */
  sections.push({
    id: "safety",
    title: "Safety flags in the latest assessment",
    empty: latest ? "None of GlucoCare's safety rules were triggered." : "No assessment has been completed yet.",
    rows: r?.safety.triggers.map((t) => ({ label: t.reason, value: t.evidence })) ?? [],
  });

  /* 4. Important factors */
  sections.push({
    id: "factors",
    title: "Factors that added to the score",
    empty: r?.legacy
      ? "Not available for an assessment saved by an earlier GlucoCare version."
      : "No factor added points in the latest assessment.",
    rows: (r?.factors ?? [])
      .filter((f) => f.points > 0)
      .sort((a, b) => b.points - a.points)
      .map((f) => ({ label: f.label, value: `${f.displayValue} (+${f.points})`, note: f.reason })),
  });

  /* 5. Current measurements */
  const latestM = latestByKind(measurements);
  sections.push({
    id: "measurements",
    title: "Most recent recorded measurements",
    empty: "No measurements recorded.",
    rows: MEASUREMENT_KINDS.filter((k) => latestM[k]).map((k: MeasurementKind) => {
      const m = latestM[k]!;
      return {
        label: MEASUREMENT_LABELS[k],
        value: `${formatNumber(m.value)} ${m.unit}`,
        note: `${formatDate(m.measuredOn)} · ${VERIFICATION_LABEL[m.verification]}${m.glucoseContext ? ` · ${GLUCOSE_CONTEXT_SHORT[m.glucoseContext]}` : ""}`,
      };
    }),
  });

  /* 6. Trends (observations only - no interpretation, no prediction) */
  const trends = analyseAll(measurements).filter((t) => t.points.length >= 2);
  sections.push({
    id: "trends",
    title: "How recorded values changed over time",
    empty: "Not enough repeated measurements to describe a change (at least two are needed).",
    rows: trends.map((t) => ({ label: t.label.charAt(0).toUpperCase() + t.label.slice(1), value: t.observation })),
  });

  /* 7. Changes since previous assessment */
  const cmp = previous && latest ? compareAssessments(previous, latest) : null;
  sections.push({
    id: "changes",
    title: "Changes since the previous assessment",
    empty: "Only one assessment has been saved.",
    rows: cmp
      ? [
          { label: "Compared", value: `${formatDate(previous!.assessedOn)} → ${formatDate(latest!.assessedOn)}` },
          ...describeComparison(cmp).map((line) => ({ label: "", value: line })),
        ]
      : [],
  });

  /* 8. Symptoms (latest assessment, as entered) */
  sections.push({
    id: "symptoms",
    title: "Symptoms reported in the latest assessment",
    empty: latest ? "No symptoms were selected." : "No assessment has been completed yet.",
    rows: inp
      ? [
          ...inp.symptoms.map((s) => ({ label: "Symptom", value: s })),
          ...inp.warningSigns.map((s) => ({ label: "Warning sign", value: s })),
          ...(inp.otherSymptoms ? [{ label: "Other (free text)", value: inp.otherSymptoms }] : []),
        ]
      : [],
  });

  /* 9. Previous assessments */
  sections.push({
    id: "history",
    title: "Assessment history (most recent first)",
    empty: "No assessments saved.",
    rows: [...assessments]
      .reverse()
      .slice(0, 8)
      .map((a) => ({
        label: formatDate(a.assessedOn),
        value: `${a.result.concernLevel} concern · score ${a.result.concernScore}${a.result.safety.isUrgent ? " · safety flag" : ""}`,
      })),
  });

  /* 10. Reports */
  sections.push({
    id: "reports",
    title: "Medical reports added (values reviewed by the user)",
    empty: "No reports added.",
    rows: reports.map((rep) => ({
      label: formatDate(rep.reportDate),
      value: `${rep.label} · ${rep.values.filter((v) => v.status !== "rejected").length} verified values`,
    })),
  });

  /* Questions */
  const questions: string[] = [];
  if (r?.safety.isUrgent) {
    questions.push(`GlucoCare showed a safety warning (${r.safety.reasons[0]}). Does this need urgent attention?`);
  }
  const ctxLabel = inp?.glucoseContext ? ` (${GLUCOSE_CONTEXT_SHORT[inp.glucoseContext].toLowerCase()})` : "";
  for (const f of [...(r?.factors ?? [])].filter((x) => x.points > 0).sort((a, b) => b.points - a.points)) {
    const q = factorQuestion(f, ctxLabel);
    if (q) questions.push(q);
  }
  for (const t of trends.filter((x) => x.direction === "increasing")) {
    questions.push(`My recorded ${t.label} increased across my last ${t.points.length} measurements. Is this something we should look at?`);
  }
  questions.push("Are there any tests you would recommend based on this information?");

  return {
    title: "GlucoCare - Health Summary",
    label: SUMMARY_LABEL,
    generatedOn: options.generatedOn,
    sections,
    questions: [...new Set(questions)].slice(0, 7),
    disclaimer: SUMMARY_DISCLAIMER,
  };
}

/** Plain-text version for "Copy" (email, messaging, notes). */
export function summaryToText(s: DoctorSummary): string {
  const out: string[] = [s.title.toUpperCase(), s.label, `Generated: ${formatDate(s.generatedOn)}`, ""];
  if (s.aiOverview) out.push(AI_OVERVIEW_LABEL.toUpperCase(), `  ${s.aiOverview}`, "");
  for (const sec of s.sections) {
    out.push(sec.title.toUpperCase());
    if (sec.rows.length === 0) out.push(`  ${sec.empty}`);
    for (const row of sec.rows) {
      out.push(`  ${row.label ? `${row.label}: ` : "- "}${row.value}${row.note ? ` (${row.note})` : ""}`);
    }
    out.push("");
  }
  out.push("QUESTIONS TO DISCUSS WITH A HEALTHCARE PROFESSIONAL");
  s.questions.forEach((q, i) => out.push(`  ${i + 1}. ${q}`));
  out.push("", s.disclaimer);
  return out.join("\n");
}
