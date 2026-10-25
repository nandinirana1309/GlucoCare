/**
 * GlucoCare - AI output guard (Phase 9)
 * -------------------------------------------------------------
 * Every AI response passes through validateAiResponse() before anything is
 * shown. The guard is deterministic code - the AI cannot override it.
 *
 * The response is checked SENTENCE BY SENTENCE against the evidence that was
 * sent. A sentence is removed if it:
 *   - mentions a concern level other than the one in the evidence
 *   - states a score other than the evidence score
 *   - contains a number that does not appear in the evidence (invented value)
 *   - claims a diagnosis ("you have diabetes", "this confirms you are ...")
 *   - names a medicine, gives a dose or tells the user to change treatment
 *   - guarantees an outcome or predicts a future value
 *   - gives false reassurance ("nothing to worry about", "no need to see a doctor")
 *   - contradicts the evidence ("no risk factors" when factors contributed)
 * A factor explanation is removed if its factorId is not a contributing
 * factor in the evidence (the AI cannot invent reasons).
 *
 * Outcome:
 *   passed     - nothing removed
 *   sanitized  - some sentences removed, the rest is shown with a notice
 *   blocked    - nothing usable left, the summary failed, more than half was
 *                removed, the shape was invalid, or safety is urgent
 */

import type { AiEvidence, AiExplanationContent, AiGuardIssue } from "../types/ai";
import { evidenceNumbers } from "./aiEvidence";

export type GuardStatus = "passed" | "sanitized" | "blocked";

export interface GuardResult {
  status: GuardStatus;
  content: AiExplanationContent | null;
  issues: AiGuardIssue[];
}

const LIMITS = { summary: 900, text: 450, items: 5, term: 60 };

/* ------------------------------------------------------------------ */
/*  Prohibited content (each rule documented)                          */
/* ------------------------------------------------------------------ */

const CONDITIONS =
  "(?:type\\s*[12]\\s+)?(?:diabetes|diabetic|pre-?diabetes|pre-?diabetic|hypertension|hypertensive|high blood pressure|obesity|obese|kidney disease|neuropathy|retinopathy|ketoacidosis|hypo-?glyc(?:a)?emia|hyper-?glyc(?:a)?emia|insulin resistance|metabolic syndrome|a (?:serious |medical )?condition)";

/** Diagnostic claims about the user. */
const DIAGNOSIS: RegExp[] = [
  new RegExp(`\\byou\\s+(?:definitely\\s+|probably\\s+|likely\\s+|clearly\\s+|most likely\\s+|may\\s+|might\\s+)?(?:have|has|are suffering from|suffer from|are diagnosed with|have been diagnosed with|are developing|have developed)\\s+${CONDITIONS}`, "i"),
  new RegExp(`\\byou\\s+are\\s+(?:a\\s+)?${CONDITIONS}`, "i"),
  new RegExp(`\\b(?:confirms?|proves?|indicates?|means?|shows?)\\s+(?:that\\s+)?you\\s+(?:have|are)\\b`, "i"),
  /\byour diagnosis\b/i,
  /\bdiagnos(?:e|ed|es|ing)\s+(?:you|with)\b/i,
];

const MEDICINES =
  /\b(metformin|insulin\s+(?:dose|units|injections?|therapy)|glipizide|glimepiride|gliclazide|glibenclamide|sitagliptin|vildagliptin|linagliptin|empagliflozin|dapagliflozin|canagliflozin|liraglutide|semaglutide|dulaglutide|tirzepatide|pioglitazone|acarbose|lisinopril|enalapril|ramipril|losartan|telmisartan|amlodipine|atenolol|metoprolol|hydrochlorothiazide|atorvastatin|rosuvastatin|simvastatin|statins?|aspirin)\b/i;
/** A dose: number + mg/mcg/units/IU/ml - but NOT the measurement unit mg/dL. */
const DOSE = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|units?|iu|ml)\b(?!\s*\/\s*d)/i;
const TREATMENT_CHANGE =
  /\b(?:start|stop|begin|increase|decrease|reduce|double|halve|skip|change|adjust|switch)\s+(?:taking\s+|using\s+)?(?:your\s+|any\s+|a\s+)?(?:medication|medicines?|medicine|dose|dosage|insulin|tablets?|pills?|treatment|prescription)\b/i;

/** Guarantees, cures and predictions of future values. */
const GUARANTEE: RegExp[] = [
  /\bguarantee[sd]?\b/i,
  /\b(?:will|can|would)\s+(?:cure|reverse|eliminate|prevent|fix)\b/i,
  /\bcure[sd]?\b/i,
  /\b100\s?%/,
  /\byour\s+(?:glucose|blood sugar|hba1c|a1c|blood pressure|bp|weight|bmi|score|level|risk|concern)\s+(?:will|is going to|is expected to|is likely to|should)\s+(?:be|become|drop|fall|rise|increase|decrease|go|reach|improve|return|normali[sz]e)\b/i,
  /\byou\s+will\s+(?:develop|get|become|not develop|never)\b/i,
];

/** Reassurance that could discourage seeking care. */
const FALSE_REASSURANCE =
  /\b(?:nothing to worry about|no need to (?:worry|see|consult|visit|talk)|(?:is|are) not (?:serious|urgent|concerning|a concern)|you are (?:fine|healthy|perfectly healthy|in good health|safe)|perfectly normal|no cause for concern|safe to ignore|(?:do not|don't) need (?:to see )?(?:a|any) (?:doctor|professional|clinician))\b/i;

/* ------------------------------------------------------------------ */

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function numbersIn(text: string): number[] {
  // ignore numbers that are part of words like "HbA1c", "Type 2" handled via evidence
  return [...text.replace(/hb\s?a1c|a1c/gi, "").matchAll(/(?<![\w.])\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

type RuleHit = { rule: AiGuardIssue["rule"] };

function checkSentence(s: string, e: AiEvidence, allowedNumbers: Set<number>): RuleHit | null {
  if (DIAGNOSIS.some((r) => r.test(s))) return { rule: "diagnosis" };
  if (MEDICINES.test(s) || DOSE.test(s) || TREATMENT_CHANGE.test(s)) return { rule: "medication" };
  if (GUARANTEE.some((r) => r.test(s))) return { rule: "guarantee-or-prediction" };
  if (FALSE_REASSURANCE.test(s)) return { rule: "false-reassurance" };

  const level = e.assessment.concernLevel.toLowerCase();
  for (const m of s.matchAll(/\b(low|moderate|medium|high|elevated|severe)\s+(?:concern|level|indicator|risk|category)\b/gi)) {
    if (m[1].toLowerCase() !== level) return { rule: "wrong-level" };
  }

  const score = /\bscore(?:\s+(?:of|is|was|at|stands at|=)|:)?\s+(\d+(?:\.\d+)?)/i.exec(s);
  if (score && Number(score[1]) !== e.assessment.score) return { rule: "wrong-score" };
  // "N out of M points": must be the total score, or one factor's points/max ("3 of 3 points for HbA1c").
  const outOf = /\b(\d+)\s*(?:out of|\/|of)\s*(\d+)\s*(?:possible\s+)?points?\b/i.exec(s);
  if (outOf) {
    const [a, b] = [Number(outOf[1]), Number(outOf[2])];
    const isTotal = a === e.assessment.score && b === e.assessment.maxScore;
    const isFactor = e.factors.some((f) => f.points === a && f.maxPoints === b);
    if (!isTotal && !isFactor) return { rule: "wrong-score" };
  }

  const contributing = e.factors.some((f) => f.points > 0);
  if (contributing && /\b(?:no|none of the)\s+(?:risk\s+)?factors?\b|\bnothing (?:contributed|added)\b/i.test(s)) {
    return { rule: "contradicts-evidence" };
  }

  for (const n of numbersIn(s)) {
    const known = [...allowedNumbers].some((a) => Math.abs(a - n) < 1e-9);
    if (!known) return { rule: "invented-number" };
  }
  return null;
}

function clampString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/* ------------------------------------------------------------------ */

export function validateAiResponse(raw: unknown, evidence: AiEvidence): GuardResult {
  const issues: AiGuardIssue[] = [];

  if (evidence.safety.urgent) {
    return { status: "blocked", content: null, issues: [{ field: "*", rule: "safety-urgent", text: "" }] };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { status: "blocked", content: null, issues: [{ field: "*", rule: "invalid-shape", text: String(raw).slice(0, 80) }] };
  }
  const r = raw as Record<string, unknown>;
  const allowedNumbers = evidenceNumbers(evidence);
  let total = 0;
  let removed = 0;

  /** Keeps only the sentences of `text` that pass every rule. */
  const clean = (field: string, text: string | null): string | null => {
    if (!text) return null;
    const kept: string[] = [];
    for (const s of sentences(text)) {
      total++;
      const hit = checkSentence(s, evidence, allowedNumbers);
      if (hit) {
        removed++;
        issues.push({ field, rule: hit.rule, text: s.slice(0, 200) });
      } else {
        kept.push(s);
      }
    }
    return kept.length ? kept.join(" ") : null;
  };

  const summary = clean("summary", clampString(r.summary, LIMITS.summary));

  const contributing = new Set(evidence.factors.filter((f) => f.points > 0).map((f) => f.id));
  const factorExplanations: AiExplanationContent["factorExplanations"] = [];
  if (Array.isArray(r.factorExplanations)) {
    for (const item of r.factorExplanations.slice(0, 11)) {
      const it = item as Record<string, unknown>;
      const id = typeof it?.factorId === "string" ? it.factorId : "";
      if (!contributing.has(id)) {
        total++;
        removed++;
        issues.push({ field: "factorExplanations", rule: "invented-factor", text: id || "(missing id)" });
        continue;
      }
      if (factorExplanations.some((f) => f.factorId === id)) continue;
      const text = clean(`factorExplanations.${id}`, clampString(it.text, LIMITS.text));
      if (text) factorExplanations.push({ factorId: id, text });
    }
  }

  const changeExplanation = evidence.changes ? clean("changeExplanation", clampString(r.changeExplanation, LIMITS.text)) : null;

  const list = (field: string, v: unknown): string[] =>
    (Array.isArray(v) ? v : [])
      .slice(0, LIMITS.items)
      .map((x) => clean(field, clampString(x, LIMITS.text)))
      .filter((x): x is string => Boolean(x));

  const generalTips = list("generalTips", r.generalTips);
  const questionsForClinician = list("questionsForClinician", r.questionsForClinician);

  const terms: AiExplanationContent["terms"] = [];
  if (Array.isArray(r.terms)) {
    for (const t of r.terms.slice(0, LIMITS.items)) {
      const tt = t as Record<string, unknown>;
      const term = clampString(tt?.term, LIMITS.term);
      const meaning = clean("terms", clampString(tt?.meaning, LIMITS.text));
      if (term && meaning) terms.push({ term, meaning });
    }
  }

  if (!summary || total === 0 || removed / total > 0.5) {
    return { status: "blocked", content: null, issues };
  }
  return {
    status: removed > 0 ? "sanitized" : "passed",
    content: { summary, factorExplanations, changeExplanation, generalTips, questionsForClinician, terms },
    issues,
  };
}
