import { describe, it, expect } from "vitest";
import { FACTOR_TOPICS, rankEducation, recommendedReading } from "./personalize";
import { runAssessment } from "./assessmentEngine";
import { analyseKind } from "./trends";
import { EDUCATION_LIBRARY } from "../data/educationLibrary";
import { emptyAssessment } from "../types/assessment";
import type { AssessmentData } from "../types/assessment";
import type { Measurement } from "../types/health";

const result = (o: Partial<AssessmentData>) => runAssessment({ ...emptyAssessment, ...o });
const ids = (r: ReturnType<typeof rankEducation>) => r.map((x) => x.item.id);

describe("education library", () => {
  it("has unique ids, in-app links and no diagnostic / medication / guarantee wording", () => {
    const seen = new Set<string>();
    for (const item of EDUCATION_LIBRARY) {
      expect(seen.has(item.id)).toBe(false);
      seen.add(item.id);
      expect(item.href.startsWith("/")).toBe(true);
      const text = `${item.title} ${item.summary}`;
      expect(text, item.id).not.toMatch(/you have (diabetes|prediabetes)|you are diabetic|metformin|insulin dose|\d+\s?mg\b(?!\/)|cure|guarantee|will (prevent|reverse)/i);
    }
  });

  it("every factor maps to at least one library topic", () => {
    for (const topics of Object.values(FACTOR_TOPICS)) {
      expect(EDUCATION_LIBRARY.some((i) => i.tags.some((t) => topics.includes(t)))).toBe(true);
    }
  });
});

describe("rankEducation", () => {
  it("User A: high glucose + sedentary -> glucose and activity content first", () => {
    const r = rankEducation(result({ glucose: "160", activityLevel: "Sedentary" }));
    const top = ids(r).slice(0, 4);
    expect(top).toContain("glucose-readings");
    expect(top).toContain("regular-activity");
    expect(r.find((x) => x.item.id === "regular-activity")!.because).toEqual(["Physical activity: Sedentary (+1 point)"]);
  });

  it("User B: BMI + sugary diet -> nutrition / weight content first", () => {
    const top = ids(rankEducation(result({ height: "160", weight: "85", dietPattern: "Often high in sugary food or drinks" }))).slice(0, 3);
    expect(top).toEqual(expect.arrayContaining(["gradual-weight", "balanced-plate"]));
    expect(top).not.toContain("smoking");
  });

  it("points weight the ranking (HbA1c +3 outranks smoking +1)", () => {
    const r = ids(rankEducation(result({ hba1c: "7", smoking: "Yes" })));
    expect(r.indexOf("understanding-hba1c")).toBeLessThan(r.indexOf("smoking"));
    expect(r.indexOf("smoking")).toBeLessThan(r.indexOf("what-is-diabetes"));
  });

  it("no contributing factors -> general education, nothing marked personalised", () => {
    const r = rankEducation(result({}));
    expect(r.every((x) => !x.personalised && x.because.length === 0)).toBe(true);
    expect(r[0].item.id).toBe("warning-signs"); // highest base priority
    expect(rankEducation(null).length).toBe(EDUCATION_LIBRARY.length);
  });

  it("urgent safety puts urgent-care content first", () => {
    const r = rankEducation(result({ glucose: "320", hba1c: "9" }));
    expect(r[0].item.id).toBe("warning-signs");
    expect(r[0].because[0]).toMatch(/safety warning/);
  });

  it("an increasing trend adds relevance and says why", () => {
    const ms: Measurement[] = ["2026-08-01", "2026-09-01", "2026-10-01"].map((d, i) => ({
      id: d, kind: "hba1c", value: 6 + i * 0.3, unit: "%", measuredOn: d, recordedAt: d, source: "assessment", verification: "manual",
    }));
    const r = rankEducation(result({}), [analyseKind(ms, "hba1c")]);
    const hb = r.find((x) => x.item.id === "understanding-hba1c")!;
    expect(hb.score).toBe(1);
    expect(hb.because[0]).toMatch(/HbA1c values increased across 3 measurements/);
  });

  it("is deterministic and never changes the content itself", () => {
    const res = result({ glucose: "140", smoking: "Yes" });
    expect(rankEducation(res)).toEqual(rankEducation(res));
    for (const x of rankEducation(res)) expect(EDUCATION_LIBRARY).toContain(x.item);
  });

  it("recommendedReading limits count and can filter by topic", () => {
    const res = result({ hba1c: "7", height: "160", weight: "85" });
    expect(recommendedReading(res, [], 3)).toHaveLength(3);
    const nutrition = recommendedReading(res, [], 10, ["nutrition", "activity", "bmi"]);
    expect(nutrition.every((x) => x.item.tags.some((t) => ["nutrition", "activity", "bmi"].includes(t)))).toBe(true);
  });
});
