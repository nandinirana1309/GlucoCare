import { describe, it, expect } from "vitest";
import { runAssessment } from "./assessmentEngine";
import { emptyAssessment } from "../types/assessment";
import type { AssessmentData } from "../types/assessment";

function make(overrides: Partial<AssessmentData>): AssessmentData {
  return { ...emptyAssessment, ...overrides };
}

describe("runAssessment", () => {
  it("a blank assessment is Low concern with no usable input", () => {
    const result = runAssessment(emptyAssessment);
    expect(result.concernLevel).toBe("Low");
    expect(result.hasUsableInput).toBe(false);
    expect(result.redFlags).toEqual([]);
  });

  it("every indicator reads 'not-provided' when nothing is entered", () => {
    const result = runAssessment(emptyAssessment);
    expect(result.indicators).toHaveLength(4);
    expect(result.indicators.every((i) => i.rating === "not-provided")).toBe(true);
  });

  it("classifies an elevated glucose and HbA1c", () => {
    const result = runAssessment(make({ glucose: "168", hba1c: "6.3" }));
    const glucose = result.indicators.find((i) => i.key === "glucose");
    const hba1c = result.indicators.find((i) => i.key === "hba1c");
    expect(glucose?.rating).toBe("above-reference");
    expect(hba1c?.rating).toBe("borderline");
  });

  it("computes BMI from height and weight", () => {
    const result = runAssessment(make({ height: "160", weight: "82" }));
    const bmi = result.indicators.find((i) => i.key === "bmi");
    expect(bmi?.value).toBe("32.0");
    expect(bmi?.rating).toBe("above-reference");
  });

  it("raises concern to High when a red flag is present", () => {
    const result = runAssessment(make({ glucose: "310" }));
    expect(result.redFlags.length).toBeGreaterThan(0);
    expect(result.concernLevel).toBe("High");
  });

  it("collects risk factors from history and lifestyle", () => {
    const result = runAssessment(
      make({
        age: "52",
        familyHistory: "Yes",
        activityLevel: "Sedentary",
        smoking: "Yes",
      }),
    );
    const labels = result.riskFactors.map((r) => r.label);
    expect(labels).toContain("Family history of diabetes");
    expect(labels).toContain("Age 45 or above");
    expect(labels).toContain("Low physical activity");
    expect(labels).toContain("Current smoking");
  });

  it("always includes the medication-safety recommendation", () => {
    const result = runAssessment(make({ glucose: "110" }));
    expect(result.recommendations.some((r) => r.id === "medication-safety")).toBe(true);
  });

  it("never returns a diagnosis-style concern label", () => {
    const result = runAssessment(make({ glucose: "260", hba1c: "9" }));
    expect(["Low", "Moderate", "High"]).toContain(result.concernLevel);
  });
});
