import { describe, it, expect } from "vitest";
import { analyseGlucose, analyseKind, toChartRows, trendDirection } from "./trends";
import type { Measurement } from "../types/health";

let seq = 0;
function m(kind: Measurement["kind"], value: number, measuredOn: string, extra: Partial<Measurement> = {}): Measurement {
  seq++;
  return {
    id: `m${seq}`, kind, value, unit: "", measuredOn, recordedAt: `${measuredOn}T00:00:${String(seq % 60).padStart(2, "0")}Z`,
    source: "assessment", verification: "manual", ...extra,
  };
}

const PREDICTIVE = /will (be|become|rise|fall|increase|decrease|reach)|predict|forecast|progress|expected to|likely to|worsen|improv/i;
const DIAGNOSTIC = /you have|diagnos(ed|is) with|you are diabetic/i;

describe("trendDirection - sign of each step only (no thresholds)", () => {
  it("0 / 1 / 2 points", () => {
    expect(trendDirection([])).toBe("none");
    expect(trendDirection([7])).toBe("insufficient");
    expect(trendDirection([7, 7.4])).toBe("changed-up");
    expect(trendDirection([7.4, 7])).toBe("changed-down");
    expect(trendDirection([7, 7])).toBe("unchanged");
  });

  it("3+ points", () => {
    expect(trendDirection([142, 151, 156])).toBe("increasing");
    expect(trendDirection([142, 142, 156])).toBe("increasing");
    expect(trendDirection([27.4, 27.2, 27.1])).toBe("decreasing");
    expect(trendDirection([6, 6, 6])).toBe("stable");
    expect(trendDirection([140, 160, 150])).toBe("mixed");
    expect(trendDirection([140, 160, 140])).toBe("mixed");
  });

  it("ignores floating-point noise below display precision", () => {
    expect(trendDirection([7.1, 7.1000001, 7.0999999])).toBe("stable");
  });
});

describe("analyseKind", () => {
  it("0 measurements -> no trend", () => {
    const t = analyseKind([], "hba1c");
    expect(t.direction).toBe("none");
    expect(t.observation).toMatch(/No HbA1c values recorded/);
    expect(t.interpretation).toBeNull();
  });

  it("1 measurement -> insufficient, never a direction", () => {
    const t = analyseKind([m("hba1c", 7.1, "2026-09-01")], "hba1c");
    expect(t.direction).toBe("insufficient");
    expect(t.observation).toMatch(/At least two are needed/);
    expect(t.observation).not.toMatch(/increas|decreas|trend in/i);
  });

  it("2 measurements -> only 'changed', no trend word", () => {
    const t = analyseKind([m("hba1c", 7.1, "2026-09-01"), m("hba1c", 7.6, "2026-10-01")], "hba1c");
    expect(t.direction).toBe("changed-up");
    expect(t.observation).toBe(
      "Your recorded HbA1c was higher in the second of your two measurements (7.1 % on 01 Sep 2026 to 7.6 % on 01 Oct 2026).",
    );
    expect(t.observation).not.toMatch(/increased across|trend/);
  });

  it("3 measurements -> direction described, sorted by date regardless of input order", () => {
    const t = analyseKind([m("hba1c", 7.8, "2026-10-01"), m("hba1c", 7.1, "2026-09-01"), m("hba1c", 7.4, "2026-09-15")], "hba1c");
    expect(t.points.map((p) => p.value)).toEqual([7.1, 7.4, 7.8]);
    expect(t.direction).toBe("increasing");
    expect(t.observation).toMatch(/increased across your 3 measurements/);
  });

  it("interpretation uses only the existing reference ranges, and separately from the observation", () => {
    const t = analyseKind([m("hba1c", 6.0, "2026-08-01"), m("hba1c", 6.4, "2026-09-01"), m("hba1c", 6.8, "2026-10-01")], "hba1c");
    expect(t.interpretation).toBe(
      "The earliest value was borderline (prediabetes range); the latest is elevated compared with the reference range [R2].",
    );
    const same = analyseKind([m("bmi", 26, "2026-08-01"), m("bmi", 27, "2026-09-01")], "bmi");
    expect(same.interpretation).toMatch(/^Both the earliest and the latest values are above the healthy-weight range/);
    expect(same.caveats[0]).toMatch(/body composition/);
  });

  it("no reference interpretation for weight or single BP numbers", () => {
    expect(analyseKind([m("weight", 80, "2026-08-01"), m("weight", 79, "2026-09-01")], "weight").interpretation).toBeNull();
    expect(analyseKind([m("systolic", 130, "2026-08-01")], "systolic").interpretation).toBeNull();
  });

  it("filters to the requested kind only", () => {
    const t = analyseKind([m("weight", 80, "2026-08-01"), m("bmi", 27, "2026-08-01")], "weight");
    expect(t.points).toHaveLength(1);
  });

  it("keeps source and verification on each point", () => {
    const t = analyseKind([m("hba1c", 7, "2026-08-01", { source: "report", verification: "report_edited" })], "hba1c");
    expect(t.points[0]).toMatchObject({ source: "report", verification: "report_edited" });
  });
});

describe("analyseGlucose - contexts are never mixed", () => {
  const list = [
    m("glucose", 120, "2026-08-01", { glucoseContext: "fasting" }),
    m("glucose", 190, "2026-08-15", { glucoseContext: "random" }),
    m("glucose", 128, "2026-09-01", { glucoseContext: "fasting" }),
    m("glucose", 135, "2026-10-01", { glucoseContext: "fasting" }),
    m("glucose", 160, "2026-10-02"),
  ];

  it("one summary per context, each from its own readings only", () => {
    const g = analyseGlucose(list);
    expect(g.mixedContexts).toBe(true);
    expect(g.summaries.map((s) => [s.context, s.points.length, s.direction])).toEqual([
      ["fasting", 3, "increasing"],
      ["random", 1, "insufficient"],
      ["unknown", 1, "insufficient"],
    ]);
  });

  it("the fasting reference range is applied to fasting readings only", () => {
    const g = analyseGlucose(list);
    expect(g.summaries[0].interpretation).toMatch(/fasting/);
    expect(g.summaries[1].interpretation).toBeNull();
    expect(g.summaries[2].interpretation).toBeNull();
    expect(g.summaries[2].caveats[0]).toMatch(/not recorded whether/);
  });

  it("no glucose -> a single 'none' summary", () => {
    const g = analyseGlucose([]);
    expect(g.summaries).toHaveLength(1);
    expect(g.summaries[0].direction).toBe("none");
    expect(g.mixedContexts).toBe(false);
  });

  it("descriptions never predict and never diagnose", () => {
    const all = [
      ...analyseGlucose(list).summaries,
      analyseKind([m("weight", 80, "2026-08-01"), m("weight", 82, "2026-09-01"), m("weight", 85, "2026-10-01")], "weight"),
      analyseKind([m("bmi", 31, "2026-08-01"), m("bmi", 30, "2026-09-01"), m("bmi", 29, "2026-10-01")], "bmi"),
    ];
    for (const t of all) {
      for (const text of [t.observation, t.interpretation ?? "", ...t.caveats]) {
        expect(text, text).not.toMatch(PREDICTIVE);
        expect(text, text).not.toMatch(DIAGNOSTIC);
      }
    }
  });
});

describe("toChartRows", () => {
  it("merges series by date and keeps same-date duplicates visible", () => {
    const rows = toChartRows({
      systolic: [{ date: "2026-09-01", value: 128, source: "assessment", verification: "manual" }, { date: "2026-09-01", value: 132, source: "report", verification: "report_confirmed" }],
      diastolic: [{ date: "2026-09-01", value: 82, source: "assessment", verification: "manual" }],
    });
    expect(rows).toEqual([
      { date: "2026-09-01", systolic: 128, systolic__v: "manual", diastolic: 82, diastolic__v: "manual" },
      { date: "2026-09-01", systolic: 132, systolic__v: "report_confirmed" },
    ]);
  });
});
