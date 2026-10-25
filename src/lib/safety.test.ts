import { describe, it, expect } from "vitest";
import { evaluateSafety, SAFETY_RULE_INFO } from "./safety";
import { checkRedFlags, RED_FLAG_RULE_IDS } from "./redFlags";
import { runAssessment } from "./assessmentEngine";
import { emptyAssessment } from "../types/assessment";
import type { AssessmentData } from "../types/assessment";

function make(overrides: Partial<AssessmentData>): AssessmentData {
  return { ...emptyAssessment, ...overrides };
}

const urgent = (input: Partial<AssessmentData>) => evaluateSafety(make(input)).isUrgent;

describe("evaluateSafety - normal state", () => {
  it("a blank assessment is normal and allows AI", () => {
    expect(evaluateSafety(emptyAssessment)).toEqual({
      level: "normal",
      isUrgent: false,
      triggeredRules: [],
      reasons: [],
      triggers: [],
      aiAllowed: true,
    });
  });
});

describe("evaluateSafety - thresholds are the existing red-flag thresholds", () => {
  it("very high glucose: 299 normal, 300 urgent", () => {
    expect(urgent({ glucose: "299" })).toBe(false);
    expect(urgent({ glucose: "299.9" })).toBe(false);
    expect(urgent({ glucose: "300" })).toBe(true);
  });

  it("very low glucose: 54 normal, 53.9 urgent, 0 and blank not flagged (as before)", () => {
    expect(urgent({ glucose: "54" })).toBe(false);
    expect(urgent({ glucose: "53.9" })).toBe(true);
    expect(urgent({ glucose: "1" })).toBe(true);
    expect(urgent({ glucose: "0" })).toBe(false);
    expect(urgent({ glucose: "" })).toBe(false);
  });

  it("blood pressure: 179/119 normal; 180 systolic OR 120 diastolic alone is urgent", () => {
    expect(urgent({ systolic: "179", diastolic: "119" })).toBe(false);
    expect(urgent({ systolic: "180", diastolic: "70" })).toBe(true);
    expect(urgent({ systolic: "110", diastolic: "120" })).toBe(true);
    expect(urgent({ systolic: "180" })).toBe(true); // diastolic missing
    expect(urgent({ diastolic: "120" })).toBe(true); // systolic missing
  });

  it("any ticked warning sign is urgent; free-text symptoms are not", () => {
    expect(urgent({ warningSigns: ["Fruity-smelling breath"] })).toBe(true);
    expect(urgent({ otherSymptoms: "confusion and vomiting" })).toBe(false);
    expect(urgent({ symptoms: ["Excessive thirst", "Fatigue", "Blurred vision", "Frequent urination"] })).toBe(false);
  });
});

describe("evaluateSafety - agrees exactly with checkRedFlags", () => {
  const glucose = ["", "0", "1", "53.9", "54", "100", "299", "300", "500"];
  const systolic = ["", "120", "179", "180"];
  const diastolic = ["", "80", "119", "120"];
  const warnings = [[], ["Fainting or loss of consciousness"]];

  it("same rule ids and reasons, in the same order, for every combination", () => {
    for (const g of glucose)
      for (const s of systolic)
        for (const d of diastolic)
          for (const w of warnings) {
            const data = make({ glucose: g, systolic: s, diastolic: d, warningSigns: w });
            const flags = checkRedFlags(data);
            const status = evaluateSafety(data);
            const ctx = JSON.stringify({ g, s, d, w });
            expect(status.triggeredRules, ctx).toEqual(flags.map((f) => f.id));
            expect(status.reasons, ctx).toEqual(flags.map((f) => f.reason));
            expect(status.isUrgent, ctx).toBe(flags.length > 0);
          }
  });

  it("describes every existing red-flag rule (no rule left uncategorised)", () => {
    for (const id of RED_FLAG_RULE_IDS) expect(SAFETY_RULE_INFO[id], id).toBeDefined();
    expect(Object.keys(SAFETY_RULE_INFO).sort()).toEqual([...RED_FLAG_RULE_IDS].sort());
  });
});

describe("evaluateSafety - status shape", () => {
  it("level, isUrgent and aiAllowed are always consistent", () => {
    for (const input of [{}, { glucose: "320" }, { glucose: "120" }, { warningSigns: ["x"] }]) {
      const s = evaluateSafety(make(input));
      expect(s.level === "urgent").toBe(s.isUrgent);
      expect(s.aiAllowed).toBe(!s.isUrgent);
      expect(s.triggers).toHaveLength(s.triggeredRules.length);
    }
  });

  it("an urgent status blocks AI", () => {
    expect(evaluateSafety(make({ glucose: "45" })).aiAllowed).toBe(false);
  });

  it("collects several triggers in rule order", () => {
    const s = evaluateSafety(make({ glucose: "350", systolic: "190", diastolic: "125", warningSigns: ["Fainting or loss of consciousness"] }));
    expect(s.triggeredRules).toEqual(["glucose-very-high", "bp-crisis", "warning-signs"]);
    expect(s.triggers.map((t) => t.category)).toEqual(["glucose-high", "blood-pressure", "warning-sign"]);
  });

  it("evidence quotes exactly what the user entered", () => {
    const s = evaluateSafety(make({ glucose: " 45 ", diastolic: "121", warningSigns: ["Fruity-smelling breath", "Severe abdominal pain"] }));
    expect(s.triggers.map((t) => t.evidence)).toEqual([
      "Blood glucose entered: 45 mg/dL",
      "Blood pressure entered: --/121 mmHg",
      "Warning signs reported: Fruity-smelling breath, Severe abdominal pain",
    ]);
    expect(s.triggers[0].sourceFields).toEqual(["glucose"]);
    expect(s.triggers[1].sourceFields).toEqual(["systolic", "diastolic"]);
  });

  it("reasons never use diagnostic language", () => {
    const s = evaluateSafety(make({ glucose: "350", systolic: "190", warningSigns: ["x"] }));
    for (const reason of s.reasons) {
      expect(reason).not.toMatch(/you have|diagnos|you are diabetic|ketoacidosis|hypoglycaemia|hypoglycemia/i);
    }
  });
});

describe("evaluateSafety - independent of the concern score", () => {
  it("score 0 can still be urgent", () => {
    const data = make({ warningSigns: ["Fainting or loss of consciousness"] });
    expect(runAssessment(data).concernScore).toBe(0);
    expect(evaluateSafety(data).isUrgent).toBe(true);
  });

  it("the maximum score of 18 without a red flag is not urgent", () => {
    const data = make({
      glucose: "250", hba1c: "9", systolic: "150", diastolic: "95", height: "160", weight: "90",
      symptoms: ["a", "b", "c", "d"], familyHistory: "Yes", diabetesStatus: "Yes", age: "60",
      activityLevel: "Sedentary", smoking: "Yes", dietPattern: "Often high in sugary food or drinks",
    });
    expect(runAssessment(data).concernScore).toBe(18);
    expect(evaluateSafety(data).isUrgent).toBe(false);
  });

  it("is deterministic", () => {
    const data = make({ glucose: "330", warningSigns: ["Fruity-smelling breath"] });
    expect(evaluateSafety(data)).toEqual(evaluateSafety(data));
  });
});
