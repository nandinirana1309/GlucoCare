/**
 * GlucoCare - medical report parser (Phase 8)
 * -------------------------------------------------------------
 * Turns text extracted from a report (PDF text layer or OCR) into CANDIDATE
 * values. Pure functions - no browser APIs - so it is unit-tested with
 * synthetic report text.
 *
 * Candidates are NEVER trusted automatically. The user must confirm, edit or
 * reject every one before anything enters health history (ReportUpload page).
 *
 * How a value is found (deliberately conservative):
 *  1. A line must contain a known label (e.g. "FBS", "HbA1c", "BMI").
 *  2. The value is the first number AFTER the label that is not part of a
 *     reference range ("70 - 110"), not after "<" / ">" and not after words
 *     like "ref", "range", "normal", "interval".
 *  3. The unit is read from the text just after the value. Values in
 *     mmol/L (glucose) or mmol/mol (HbA1c) are converted with standard
 *     formulas (see UNIT CONVERSIONS below).
 *  4. Values outside the app's plausible data-entry limits are kept but
 *     marked low confidence, so the user can see and correct them.
 * Lines about urine glucose and "estimated average glucose" (which appears on
 * HbA1c reports) are ignored - they are not blood glucose readings.
 */

import type { ExtractionConfidence, GlucoseContext, MeasurementKind } from "../types/health";
import { MEASUREMENT_UNITS } from "../types/health";
import { validateField } from "./validation";
import type { ValidatableField } from "./validation";
import { isValidISODate } from "./healthRecords";

export const PARSER_VERSION = "1.0.0";

export type ExtractionMethodUsed = "pdf_text" | "ocr";

export interface ExtractionCandidate {
  /** Stable index within one parse, used as a React key. */
  key: string;
  kind: MeasurementKind;
  /** Value in the canonical unit (mg/dL, %, mmHg, kg, cm, kg/m2). */
  value: number;
  unit: string;
  /** The number and unit exactly as found, before any conversion. */
  originalValue: number;
  originalUnit: string | null;
  /** The label text that matched, e.g. "FBS" (short, safe to store). */
  matchedLabel: string;
  /** The report line, for the review screen ONLY - never stored. */
  snippet: string;
  lineNumber: number;
  confidence: ExtractionConfidence;
  glucoseContext?: GlucoseContext;
  /** Human-readable notes, e.g. "Converted from 7.3 mmol/L". */
  notes: string[];
}

export interface ParsedReport {
  candidates: ExtractionCandidate[];
  /** yyyy-mm-dd if a report/collection date was found (user must confirm). */
  reportDate: string | null;
  reportDateNote: string | null;
}

/* ------------------------------------------------------------------ */
/*  File type detection (magic bytes)                                  */
/* ------------------------------------------------------------------ */

export type DetectedFileType = "pdf" | "png" | "jpeg";

/** Reads the first bytes of a file - the extension or MIME type alone can lie. */
export function detectFileType(bytes: Uint8Array): DetectedFileType | null {
  const b = bytes;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "pdf"; // %PDF-
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  return null;
}

/* ------------------------------------------------------------------ */
/*  UNIT CONVERSIONS (standard, not GlucoCare-specific)                */
/* ------------------------------------------------------------------ */

/** Glucose: mg/dL = mmol/L x 18.016 (molar mass of glucose 180.16 g/mol). */
export const mmolToMgdl = (mmol: number) => Math.round(mmol * 18.016);

/** HbA1c: NGSP % = 0.09148 x IFCC (mmol/mol) + 2.152 (IFCC-NGSP master equation). */
export const ifccToNgsp = (mmolPerMol: number) => Math.round((0.09148 * mmolPerMol + 2.152) * 10) / 10;

/* ------------------------------------------------------------------ */
/*  Text normalisation                                                 */
/* ------------------------------------------------------------------ */

/**
 * Fixes common OCR slips ONLY inside numbers: "l32" -> "132", "1O5" -> "105",
 * "6,8" -> "6.8". Letters elsewhere are untouched.
 */
export function normalizeReportText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/(\d)[oO](?=\d|\b)/g, (_m, d: string) => `${d}0`) // "1O5" -> "105", "1O" -> "10"
    .replace(/\b[lI](?=\d{1,3}(?:\.\d+)?\b)/g, "1") // "l32" -> "132"
    .replace(/(\d)[lI](?=\d)/g, (_m, d: string) => `${d}1`) // "1l2" -> "112"
    .replace(/(\d),(\d{1,2})\b/g, (_m, a: string, b: string) => `${a}.${b}`) // "6,8" -> "6.8"
    .replace(/[ ]{2,}/g, "  ");
}

/* ------------------------------------------------------------------ */
/*  Label dictionary                                                   */
/* ------------------------------------------------------------------ */

interface LabelRule {
  kind: MeasurementKind | "bp";
  context?: GlucoseContext;
  pattern: RegExp;
}

// Order matters: specific glucose contexts before the generic glucose label.
const LABELS: LabelRule[] = [
  { kind: "hba1c", pattern: /\b(hb\s?a[1l]c|a1c|glyc(?:at|osyl)ated\s+ha?emoglobin|glycohaemoglobin|glycohemoglobin)\b/i },
  { kind: "glucose", context: "fasting", pattern: /\b(fasting\s+(?:plasma\s+|blood\s+)?(?:glucose|sugar)|f\.?b\.?s|f\.?b\.?g|f\.?p\.?g|(?:glucose|sugar)[\s,(-]*fasting)\b/i },
  { kind: "glucose", context: "post_meal", pattern: /\b(post[\s-]?prandial\s+(?:plasma\s+|blood\s+)?(?:glucose|sugar)|pp\.?b\.?s|pp\.?b\.?g|(?:glucose|sugar)[\s,(-]*(?:pp|post[\s-]?prandial))\b/i },
  { kind: "glucose", context: "random", pattern: /\b(random\s+(?:plasma\s+|blood\s+)?(?:glucose|sugar)|r\.?b\.?s|r\.?b\.?g|(?:glucose|sugar)[\s,(-]*random)\b/i },
  { kind: "glucose", context: "unknown", pattern: /\b((?:plasma|blood)\s+(?:glucose|sugar)|glucose)\b/i },
  { kind: "bp", pattern: /\b(blood\s+pressure|b\.?p\.?)\b/i },
  { kind: "bmi", pattern: /\b(bmi|body\s+mass\s+index)\b/i },
  { kind: "weight", pattern: /\b(weight|wt\.?)\b/i },
  { kind: "height", pattern: /\b(height|ht\.?)\b/i },
];

/** Lines that mention glucose but are NOT a blood glucose reading. */
const NOT_BLOOD_GLUCOSE = /urine|urinary|average\s+glucose|e\.?a\.?g\b|mean\s+(?:blood\s+|plasma\s+)?glucose/i;

/** Words after which a number belongs to a reference range, not a result. */
const RANGE_WORDS = /(ref(?:erence)?|range|normal|interval|expected|target|desirable|up\s*to|less\s+than|more\s+than)[\s.:]*$/i;

const UNIT_PATTERNS: { unit: string; pattern: RegExp }[] = [
  { unit: "mg/dL", pattern: /^\s*mg\s*\/\s*d[lL1]/i },
  { unit: "mmol/L", pattern: /^\s*mmol\s*\/\s*[lL1]\b/i },
  { unit: "mmol/mol", pattern: /^\s*mmol\s*\/\s*mol/i },
  { unit: "%", pattern: /^\s*%/ },
  { unit: "mmHg", pattern: /^\s*mm\s*hg/i },
  { unit: "kg/m2", pattern: /^\s*kg\s*\/\s*m\s*(?:2|²|\^2)/i },
  { unit: "kg", pattern: /^\s*kgs?\b/i },
  { unit: "lb", pattern: /^\s*(?:lbs?|pounds?)\b/i },
  { unit: "cm", pattern: /^\s*cms?\b/i },
  { unit: "m", pattern: /^\s*m(?:etres?|eters?)?\b(?!\s*\/)/i },
];

function readUnit(after: string): string | null {
  for (const u of UNIT_PATTERNS) if (u.pattern.test(after)) return u.unit;
  return null;
}

const NUMBER = /\d+(?:\.\d+)?/g;

/** First number after `start` that is not part of a reference range. */
function firstResultNumber(line: string, start: number): { value: number; end: number; raw: string } | null {
  NUMBER.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = NUMBER.exec(line))) {
    const before = line.slice(start, m.index);
    const after = line.slice(m.index + m[0].length);
    const prevChar = line.slice(0, m.index).trimEnd().slice(-1);
    const isRangeStart = /^\s*(?:-|–|to)\s*\d/i.test(after);
    const isRangeEnd = /\d\s*(?:-|–|to)\s*$/i.test(line.slice(0, m.index));
    // "(2 hr)", "after 120 min" - timing information, not a result
    const isDuration = /^\s*(?:h|hr|hrs|hour|hours|min|mins|minutes)\b/i.test(after);
    if (isRangeStart || isRangeEnd || isDuration || prevChar === "<" || prevChar === ">" || RANGE_WORDS.test(before)) {
      // skip the rest of this range ("70 - 110") and keep looking
      continue;
    }
    return { value: Number(m[0]), end: m.index + m[0].length, raw: m[0] };
  }
  return null;
}

/** Data-entry plausibility (same limits as the form; BMI mirrors the DB check). */
function plausible(kind: MeasurementKind, value: number): boolean {
  if (kind === "bmi") return value >= 5 && value <= 150;
  return validateField(kind as ValidatableField, String(value)) === "";
}

/* ------------------------------------------------------------------ */
/*  Main parser                                                        */
/* ------------------------------------------------------------------ */

export function parseReport(rawText: string, method: ExtractionMethodUsed): ParsedReport {
  const lines = normalizeReportText(rawText).split("\n");
  const candidates: ExtractionCandidate[] = [];
  let n = 0;

  const push = (c: Omit<ExtractionCandidate, "key" | "confidence"> & { unitFound: boolean }) => {
    const ok = plausible(c.kind, c.value);
    let confidence: ExtractionConfidence = c.unitFound && method === "pdf_text" ? "high" : "medium";
    const notes = [...c.notes];
    if (!c.unitFound) notes.push("No unit found next to the value - please check it.");
    if (method === "ocr") notes.push("Read by OCR - please check digits carefully.");
    if (!ok) {
      confidence = "low";
      notes.push("This value is outside the range GlucoCare accepts for data entry - it may have been misread.");
    }
    const { unitFound: _u, ...rest } = c;
    candidates.push({ ...rest, notes, confidence, key: `c${n++}` });
  };

  lines.forEach((line, index) => {
    const text = line.trim();
    if (!text) return;

    for (const rule of LABELS) {
      const label = rule.pattern.exec(text);
      if (!label) continue;
      if (rule.kind === "glucose" && NOT_BLOOD_GLUCOSE.test(text)) continue;
      // A generic "glucose" match inside an HbA1c line is not a glucose value.
      if (rule.kind === "glucose" && LABELS[0].pattern.test(text)) continue;

      const start = label.index + label[0].length;
      const snippet = text.length > 120 ? `${text.slice(0, 117)}...` : text;
      const matchedLabel = label[0].trim().slice(0, 60);

      if (rule.kind === "bp") {
        const bp = /(\d{2,3})\s*\/\s*(\d{2,3})/.exec(text.slice(start));
        if (bp) {
          const unitFound = /mm\s*hg/i.test(text.slice(start));
          for (const [kind, raw] of [["systolic", bp[1]], ["diastolic", bp[2]]] as const) {
            push({
              kind, value: Number(raw), unit: "mmHg", originalValue: Number(raw), originalUnit: unitFound ? "mmHg" : null,
              matchedLabel, snippet, lineNumber: index + 1, notes: [], unitFound,
            });
          }
        }
        break;
      }

      const kind = rule.kind;
      const num = firstResultNumber(text, start);
      if (!num) break; // label present but no result value on this line
      const foundUnit = readUnit(text.slice(num.end));
      const notes: string[] = [];
      let value = num.value;
      let unit = MEASUREMENT_UNITS[kind];

      if (kind === "glucose" && foundUnit === "mmol/L") {
        value = mmolToMgdl(num.value);
        notes.push(`Converted from ${num.raw} mmol/L (x 18.016).`);
      } else if (kind === "hba1c" && foundUnit === "mmol/mol") {
        value = ifccToNgsp(num.value);
        notes.push(`Converted from ${num.raw} mmol/mol (IFCC) to % (NGSP).`);
      } else if (kind === "weight" && foundUnit === "lb") {
        value = Math.round(num.value * 0.45359237 * 10) / 10;
        notes.push(`Converted from ${num.raw} lb.`);
      } else if (kind === "height" && foundUnit === "m" && num.value < 3) {
        value = Math.round(num.value * 1000) / 10;
        notes.push(`Converted from ${num.raw} m.`);
      }
      unit = MEASUREMENT_UNITS[kind];

      // A unit that does not belong to this measurement means we probably read the wrong number.
      const expectedUnits: Record<MeasurementKind, string[]> = {
        glucose: ["mg/dL", "mmol/L"], hba1c: ["%", "mmol/mol"], systolic: ["mmHg"], diastolic: ["mmHg"],
        weight: ["kg", "lb"], height: ["cm", "m"], bmi: ["kg/m2"],
      };
      if (foundUnit && !expectedUnits[kind].includes(foundUnit)) {
        notes.push(`Unexpected unit "${foundUnit}" for ${kind} - please check.`);
      }

      push({
        kind, value, unit, originalValue: num.value, originalUnit: foundUnit, matchedLabel, snippet,
        lineNumber: index + 1, notes, unitFound: Boolean(foundUnit) && expectedUnits[kind].includes(foundUnit!),
        ...(kind === "glucose" ? { glucoseContext: rule.context } : {}),
      });
      break; // one candidate per line (the most specific label wins)
    }

    // Weight/height/BMI often share a line: look for the others too.
    if (/\b(weight|wt\.?)\b/i.test(text) && /\b(bmi|height|ht\.?)\b/i.test(text)) {
      for (const rule of LABELS.filter((r) => r.kind === "weight" || r.kind === "height" || r.kind === "bmi")) {
        if (candidates.some((c) => c.lineNumber === index + 1 && c.kind === rule.kind)) continue;
        const label = rule.pattern.exec(text);
        if (!label) continue;
        const num = firstResultNumber(text, label.index + label[0].length);
        if (!num) continue;
        const kind = rule.kind as MeasurementKind;
        const foundUnit = readUnit(text.slice(num.end));
        push({
          kind, value: num.value, unit: MEASUREMENT_UNITS[kind], originalValue: num.value, originalUnit: foundUnit,
          matchedLabel: label[0].trim(), snippet: text.slice(0, 120), lineNumber: index + 1, notes: [],
          unitFound: Boolean(foundUnit),
        });
      }
    }
  });

  return { candidates, ...findReportDate(lines) };
}

/* ------------------------------------------------------------------ */
/*  Report date                                                        */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function findReportDate(lines: string[]): { reportDate: string | null; reportDateNote: string | null } {
  const DATE_LINE = /(collect|report|sample|receiv|registered|date)/i;
  for (const line of lines) {
    if (!DATE_LINE.test(line)) continue;

    const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(line);
    if (iso && isValidISODate(iso[0])) return { reportDate: iso[0], reportDateNote: null };

    const named = /\b(\d{1,2})[\s-]*([A-Za-z]{3,9})[\s,-]*(\d{4})\b/.exec(line);
    if (named) {
      const name = named[2].toLowerCase();
      const month = MONTHS[name.slice(0, 4)] ?? MONTHS[name.slice(0, 3)];
      if (month) {
        const date = `${named[3]}-${pad(month)}-${pad(Number(named[1]))}`;
        if (isValidISODate(date)) return { reportDate: date, reportDateNote: null };
      }
    }

    const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(line);
    if (numeric) {
      const a = Number(numeric[1]);
      const b = Number(numeric[2]);
      let year = Number(numeric[3]);
      if (year < 100) year += 2000;
      // Day-first (dd/mm/yyyy) is assumed unless impossible.
      const [day, month] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b];
      const date = `${year}-${pad(month)}-${pad(day)}`;
      if (isValidISODate(date)) {
        return {
          reportDate: date,
          reportDateNote: a <= 12 && b <= 12 ? "The date was read as day/month/year - please check it." : null,
        };
      }
    }
  }
  return { reportDate: null, reportDateNote: null };
}
