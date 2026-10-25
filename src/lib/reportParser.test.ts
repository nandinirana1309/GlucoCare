/**
 * Parser tests with SYNTHETIC report text (no real patient data).
 */
import { describe, it, expect } from "vitest";
import { detectFileType, ifccToNgsp, mmolToMgdl, normalizeReportText, parseReport } from "./reportParser";
import type { ExtractionCandidate } from "./reportParser";

const LAB_REPORT = `
SAMPLE DIAGNOSTICS LABORATORY
Patient Name: Test Patient          Age/Sex: 52 Y / F
Collected On: 14/09/2026 08:10      Reported On: 14/09/2026 13:22
Test Name                           Result    Unit       Bio. Ref. Interval
Glucose, Fasting (Plasma)           132       mg/dL      70 - 100
Glucose, Post Prandial (2 hr)       186       mg/dL      70 - 140
HbA1c (Glycated Haemoglobin)        7.1       %          4.0 - 5.6
Estimated Average Glucose (eAG)     157       mg/dL
Urine Glucose                       Nil
Blood Pressure: 134/86 mmHg
Weight: 78.3 kg   Height: 170 cm   BMI: 27.1 kg/m2
`;

const pick = (cs: ExtractionCandidate[], kind: string) => cs.filter((c) => c.kind === kind);

describe("parseReport - typical lab report (PDF text)", () => {
  const r = parseReport(LAB_REPORT, "pdf_text");

  it("finds fasting and post-meal glucose with their contexts", () => {
    const g = pick(r.candidates, "glucose");
    expect(g.map((c) => [c.value, c.glucoseContext, c.confidence])).toEqual([
      [132, "fasting", "high"],
      [186, "post_meal", "high"],
    ]);
  });

  it("never reads reference-range numbers, eAG or urine glucose as results", () => {
    const values = r.candidates.map((c) => c.value);
    for (const ref of [70, 100, 140, 4.0, 5.6, 157]) expect(values).not.toContain(ref);
  });

  it("finds HbA1c, BP (split into systolic/diastolic), weight, height and BMI", () => {
    expect(pick(r.candidates, "hba1c")[0]).toMatchObject({ value: 7.1, unit: "%", matchedLabel: "HbA1c" });
    expect(pick(r.candidates, "systolic")[0]).toMatchObject({ value: 134, unit: "mmHg" });
    expect(pick(r.candidates, "diastolic")[0]).toMatchObject({ value: 86, unit: "mmHg" });
    expect(pick(r.candidates, "weight")[0]).toMatchObject({ value: 78.3, unit: "kg" });
    expect(pick(r.candidates, "height")[0]).toMatchObject({ value: 170, unit: "cm" });
    expect(pick(r.candidates, "bmi")[0]).toMatchObject({ value: 27.1, unit: "kg/m2" });
    expect(r.candidates).toHaveLength(8);
  });

  it("reads the report date (day-first, unambiguous here)", () => {
    expect(r.reportDate).toBe("2026-09-14");
    expect(r.reportDateNote).toBeNull();
  });

  it("keeps the source line for review and a short label for storage", () => {
    const g = pick(r.candidates, "glucose")[0];
    expect(g.snippet).toMatch(/^Glucose, Fasting/);
    expect(g.matchedLabel.length).toBeLessThanOrEqual(60);
    expect(g.lineNumber).toBeGreaterThan(0);
  });
});

describe("parseReport - units and conversions", () => {
  it("converts mmol/L glucose and IFCC HbA1c with the standard formulas", () => {
    const r = parseReport("Fasting Blood Sugar  7.3 mmol/L\nHbA1c (IFCC)  54 mmol/mol", "pdf_text");
    expect(pick(r.candidates, "glucose")[0]).toMatchObject({ value: 132, originalValue: 7.3, originalUnit: "mmol/L", unit: "mg/dL" });
    expect(pick(r.candidates, "glucose")[0].notes[0]).toMatch(/Converted from 7\.3 mmol\/L/);
    expect(pick(r.candidates, "hba1c")[0]).toMatchObject({ value: 7.1, originalValue: 54, originalUnit: "mmol/mol" });
    expect(mmolToMgdl(5.6)).toBe(101);
    expect(ifccToNgsp(48)).toBe(6.5);
  });

  it("a value without a unit is medium confidence with a note", () => {
    const c = parseReport("RBS 145", "pdf_text").candidates[0];
    expect(c).toMatchObject({ kind: "glucose", glucoseContext: "random", value: 145, confidence: "medium" });
    expect(c.notes.join(" ")).toMatch(/No unit found/);
  });

  it("an implausible value is kept but marked low confidence", () => {
    const c = parseReport("Glucose 1320 mg/dL", "pdf_text").candidates[0];
    expect(c).toMatchObject({ value: 1320, confidence: "low" });
    expect(c.notes.join(" ")).toMatch(/outside the range/);
  });
});

describe("parseReport - OCR text", () => {
  it("fixes common OCR slips inside numbers only", () => {
    expect(normalizeReportText("FBS : l32 mg/dl")).toBe("FBS : 132 mg/dl");
    expect(normalizeReportText("HbAlc 6,8 %")).toBe("HbAlc 6.8 %");
    expect(normalizeReportText("Glucose 1O5")).toBe("Glucose 105");
    expect(normalizeReportText("Hello Lab")).toBe("Hello Lab");
  });

  it("parses OCR output and never marks OCR values high confidence", () => {
    const r = parseReport("FBS : l32 mg/dl\nHbAlc 6,8 %\nB.P. 128 / 84", "ocr");
    expect(r.candidates.map((c) => [c.kind, c.value])).toEqual([
      ["glucose", 132],
      ["hba1c", 6.8],
      ["systolic", 128],
      ["diastolic", 84],
    ]);
    expect(r.candidates.every((c) => c.confidence !== "high")).toBe(true);
    expect(r.candidates[0].notes.join(" ")).toMatch(/OCR/);
  });
});

describe("parseReport - nothing to find", () => {
  it("text without known labels gives no candidates", () => {
    expect(parseReport("Dear patient, your appointment is on Monday.", "pdf_text").candidates).toEqual([]);
  });

  it("a label with only a reference range gives no candidate", () => {
    expect(parseReport("Glucose 70-110 mg/dL\nHbA1c < 5.7 %\nGlucose Normal range: 70 to 100", "pdf_text").candidates).toEqual([]);
  });

  it("empty text", () => {
    expect(parseReport("", "ocr")).toEqual({ candidates: [], reportDate: null, reportDateNote: null });
  });
});

describe("report dates", () => {
  it("ambiguous dd/mm is read day-first with a note; named months and ISO dates parse", () => {
    expect(parseReport("Report date: 03/04/2026", "pdf_text")).toMatchObject({ reportDate: "2026-04-03", reportDateNote: expect.stringMatching(/day\/month\/year/) });
    expect(parseReport("Sample collected 5 Sep 2026", "pdf_text").reportDate).toBe("2026-09-05");
    expect(parseReport("Date: 2026-08-30", "pdf_text").reportDate).toBe("2026-08-30");
    expect(parseReport("Date: 31/02/2026", "pdf_text").reportDate).toBeNull();
  });
});

describe("detectFileType (magic bytes)", () => {
  it("recognises PDF, PNG and JPEG and rejects everything else", () => {
    expect(detectFileType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe("pdf");
    expect(detectFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(detectFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(detectFileType(new TextEncoder().encode("<html>not a pdf"))).toBeNull();
    expect(detectFileType(new Uint8Array([]))).toBeNull();
  });
});
