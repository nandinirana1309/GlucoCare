import { describe, it, expect } from "vitest";
import { buildTimeline, factorFrequency, groupByMonth, journeyStats, kindsWithData, latestByKind } from "./journey";
import { runAssessment } from "./assessmentEngine";
import { sanitizeAssessmentInput } from "./healthRecords";
import { daysBetween, formatDate, formatNumber, formatShortDate } from "./format";
import { emptyAssessment } from "../types/assessment";
import type { AssessmentData } from "../types/assessment";
import type { HealthHistory, Measurement, StoredAssessment } from "../types/health";

function stored(id: string, assessedOn: string, overrides: Partial<AssessmentData>): StoredAssessment {
  const data = { ...emptyAssessment, ...overrides };
  return {
    id,
    clientId: id,
    createdAt: `${assessedOn}T10:00:00.000Z`,
    assessedOn,
    engineVersion: "1.1.0",
    input: sanitizeAssessmentInput(data),
    result: runAssessment(data),
  };
}

function m(kind: Measurement["kind"], value: number, measuredOn: string, recordedAt = `${measuredOn}T00:00:00Z`): Measurement {
  return { id: `${kind}-${measuredOn}-${value}`, kind, value, unit: "", measuredOn, recordedAt, source: "assessment", verification: "manual" };
}

describe("latestByKind", () => {
  it("picks the newest by date, then by save time", () => {
    const latest = latestByKind([
      m("glucose", 140, "2026-09-01"),
      m("glucose", 160, "2026-09-15"),
      m("glucose", 150, "2026-09-15", "2026-09-16T00:00:00Z"),
      m("hba1c", 6.8, "2026-08-01"),
    ]);
    expect(latest.glucose?.value).toBe(150);
    expect(latest.hba1c?.value).toBe(6.8);
    expect(latest.weight).toBeUndefined();
  });
});

describe("timeline", () => {
  const history: HealthHistory = {
    assessments: [stored("a1", "2026-08-20", { glucose: "130" }), stored("a2", "2026-09-10", { glucose: "150" })],
    measurements: [],
    reports: [
      {
        id: "r1", clientId: "r1", createdAt: "2026-09-02T00:00:00Z", label: "Lab", reportDate: "2026-09-01",
        fileType: "pdf", extractionMethod: "pdf_text", parserVersion: "1",
        values: [
          { id: "v1", kind: "hba1c", extractedValue: 7, finalValue: 7, confidence: "high", status: "confirmed" },
          { id: "v2", kind: "weight", extractedValue: null, finalValue: null, confidence: "low", status: "rejected" },
        ],
      },
    ],
  };

  it("merges assessments and reports newest first", () => {
    const t = buildTimeline(history);
    expect(t.map((e) => e.date)).toEqual(["2026-09-10", "2026-09-01", "2026-08-20"]);
    expect(t[1]).toMatchObject({ type: "report", valueCount: 1 });
  });

  it("groups by month", () => {
    expect(groupByMonth(buildTimeline(history)).map((g) => [g.month, g.events.length])).toEqual([
      ["2026-09", 2],
      ["2026-08", 1],
    ]);
  });

  it("empty history -> empty timeline", () => {
    expect(buildTimeline({ assessments: [], measurements: [], reports: [] })).toEqual([]);
  });

  it("journeyStats counts records and days since latest", () => {
    const s = journeyStats({ ...history, measurements: [m("glucose", 1, "2026-09-10"), { ...m("bmi", 25, "2026-09-10"), verification: "calculated" }] }, "2026-09-20");
    expect(s).toMatchObject({ assessmentCount: 2, reportCount: 1, measurementCount: 2, userVerifiedCount: 1, daysSinceLatest: 10, firstDate: "2026-08-20", lastDate: "2026-09-10" });
    expect(journeyStats({ assessments: [], measurements: [], reports: [] }, "2026-09-20").daysSinceLatest).toBeNull();
  });
});

describe("factorFrequency", () => {
  it("counts how often each factor added points, using stored factors only", () => {
    const list = [
      stored("a1", "2026-08-01", { hba1c: "6.8", activityLevel: "Sedentary" }),
      stored("a2", "2026-09-01", { hba1c: "6.9", activityLevel: "Very active" }),
      stored("a3", "2026-10-01", { hba1c: "7.2" }),
    ];
    const f = factorFrequency(list);
    expect(f[0]).toMatchObject({ id: "hba1c", contributed: 3, total: 3, latestPoints: 3 });
    expect(f.find((x) => x.id === "activity")).toMatchObject({ contributed: 1, latestPoints: 0 });
    expect(f.find((x) => x.id === "glucose")).toBeUndefined();
  });

  it("ignores legacy results without a breakdown", () => {
    const legacy = stored("old", "2026-01-01", { hba1c: "7" });
    legacy.result = { ...legacy.result, factors: [], legacy: true };
    expect(factorFrequency([legacy])).toEqual([]);
  });
});

describe("kindsWithData + formatting", () => {
  it("lists kinds in a fixed order", () => {
    expect(kindsWithData([m("weight", 70, "2026-01-01"), m("glucose", 100, "2026-01-01")])).toEqual(["glucose", "weight"]);
  });

  it("formats dates without time-zone drift", () => {
    expect(formatDate("2026-09-01")).toBe("01 Sep 2026");
    expect(formatShortDate("2026-12-31")).toBe("31 Dec");
    expect(daysBetween("2026-02-27", "2026-03-01")).toBe(2);
    expect(formatNumber(7.1)).toBe("7.1");
    expect(formatNumber(150)).toBe("150");
  });
});
