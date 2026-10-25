/**
 * Phase 2 - safety layer wired into the assessment result and the AI gate.
 * Rule thresholds themselves are tested in safety.test.ts / redFlags.test.ts;
 * score behaviour is locked in scoreLock.test.ts.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { runAssessment } from "./assessmentEngine";
import { evaluateSafety } from "./safety";
import { checkRedFlags } from "./redFlags";
import { explainResults } from "../services/aiService";
import { WARNING_SIGNS } from "../data/symptoms";
import { emptyAssessment } from "../types/assessment";
import type { AssessmentData } from "../types/assessment";
import type { AiExplanationRequest } from "../types/ai";

function make(overrides: Partial<AssessmentData>): AssessmentData {
  return { ...emptyAssessment, ...overrides };
}

const SAMPLES: Partial<AssessmentData>[] = [
  {},
  { glucose: "120", age: "50", familyHistory: "Yes" },
  { glucose: "45" },
  { glucose: "320", hba1c: "9" },
  { systolic: "185", diastolic: "95" },
  { warningSigns: ["Fruity-smelling breath"], smoking: "Yes" },
];

describe("result.safety is the single safety evaluation", () => {
  it("equals evaluateSafety(input) for every sample", () => {
    for (const input of SAMPLES) {
      const data = make(input);
      expect(runAssessment(data).safety, JSON.stringify(input)).toEqual(evaluateSafety(data));
    }
  });

  it("result.redFlags (kept for compatibility) matches the red-flag rules exactly", () => {
    for (const input of SAMPLES) {
      const data = make(input);
      expect(runAssessment(data).redFlags, JSON.stringify(input)).toEqual(checkRedFlags(data));
    }
  });

  it("levelBasis rule ids come from result.safety", () => {
    for (const input of SAMPLES) {
      const r = runAssessment(make(input));
      if (r.safety.isUrgent) {
        expect(r.levelBasis).toMatchObject({ type: "red-flag", ruleIds: r.safety.triggeredRules });
      } else {
        expect(r.levelBasis.type).toBe("score");
      }
    }
  });

  it("a safety trigger never adds points to the score", () => {
    const base = make({ glucose: "130", age: "50", familyHistory: "Yes" });
    const withWarning = { ...base, warningSigns: ["Severe abdominal pain"] };
    const a = runAssessment(base);
    const b = runAssessment(withWarning);
    expect(b.concernScore).toBe(a.concernScore);
    expect(b.factors).toEqual(a.factors);
    expect(a.concernLevel).toBe("Moderate");
    expect(b.concernLevel).toBe("High");
  });
});

describe("CRITICAL: low score but urgent", () => {
  const data = make({ warningSigns: ["Confusion or difficulty staying awake"] });
  const r = runAssessment(data);

  it("score stays 0, score-only level Low, final level High via safety override", () => {
    expect(r.concernScore).toBe(0);
    expect(r.levelBasis).toEqual({
      type: "red-flag",
      thresholds: { moderate: 3, high: 6 },
      ruleIds: ["warning-signs"],
      scoreLevel: "Low",
    });
    expect(r.concernLevel).toBe("High");
  });

  it("safety is urgent, blocks AI and carries a visible reason with evidence", () => {
    expect(r.safety.level).toBe("urgent");
    expect(r.safety.isUrgent).toBe(true);
    expect(r.safety.aiAllowed).toBe(false);
    expect(r.safety.reasons).toEqual(["You reported one or more serious warning signs."]);
    expect(r.safety.triggers[0].evidence).toBe(
      "Warning signs reported: Confusion or difficulty staying awake",
    );
  });
});

describe("normal assessment", () => {
  it("no triggers, normal level, AI allowed, score thresholds decide the level", () => {
    const cases: [Partial<AssessmentData>, number, string][] = [
      [{ familyHistory: "Yes", smoking: "Yes" }, 2, "Low"],
      [{ familyHistory: "Yes", smoking: "Yes", age: "50" }, 3, "Moderate"],
      [{ glucose: "130", familyHistory: "Yes", smoking: "Yes", age: "50", activityLevel: "Sedentary" }, 6, "High"],
    ];
    for (const [input, score, level] of cases) {
      const r = runAssessment(make(input));
      expect(r.safety).toMatchObject({ level: "normal", isUrgent: false, triggeredRules: [], aiAllowed: true });
      expect(r.concernScore).toBe(score);
      expect(r.concernLevel).toBe(level);
      expect(r.levelBasis.type).toBe("score");
    }
  });
});

describe("multiple red flags", () => {
  it("keeps every rule, reason and piece of evidence in stable order", () => {
    const r = runAssessment(
      make({
        glucose: "45",
        systolic: "185",
        diastolic: "125",
        warningSigns: ["Fruity-smelling breath", "Fainting or loss of consciousness"],
      }),
    );
    expect(r.safety.triggeredRules).toEqual(["glucose-very-low", "bp-crisis", "warning-signs"]);
    expect(r.levelBasis).toMatchObject({ type: "red-flag", ruleIds: ["glucose-very-low", "bp-crisis", "warning-signs"] });
    expect(r.safety.reasons).toHaveLength(3);
    expect(r.safety.triggers.map((t) => t.evidence)).toEqual([
      "Blood glucose entered: 45 mg/dL",
      "Blood pressure entered: 185/125 mmHg",
      "Warning signs reported: Fruity-smelling breath, Fainting or loss of consciousness",
    ]);
    expect(r.safety.triggers.map((t) => t.sourceFields)).toEqual([
      ["glucose"],
      ["systolic", "diastolic"],
      ["warningSigns"],
    ]);
  });
});

describe("red-flag rules unchanged from the Phase 2 starting state", () => {
  const ids = (input: Partial<AssessmentData>) => evaluateSafety(make(input)).triggeredRules;

  it("glucose >= 300; 0 < glucose < 54; glucose 0 unflagged", () => {
    expect(ids({ glucose: "300" })).toEqual(["glucose-very-high"]);
    expect(ids({ glucose: "299.9" })).toEqual([]);
    expect(ids({ glucose: "53.9" })).toEqual(["glucose-very-low"]);
    expect(ids({ glucose: "54" })).toEqual([]);
    expect(ids({ glucose: "0" })).toEqual([]);
  });

  it("systolic >= 180 OR diastolic >= 120", () => {
    expect(ids({ systolic: "180", diastolic: "60" })).toEqual(["bp-crisis"]);
    expect(ids({ systolic: "100", diastolic: "120" })).toEqual(["bp-crisis"]);
    expect(ids({ systolic: "179", diastolic: "119" })).toEqual([]);
  });

  it("each of the six existing warning signs triggers on its own", () => {
    expect(WARNING_SIGNS).toHaveLength(6);
    for (const sign of WARNING_SIGNS) expect(ids({ warningSigns: [sign] }), sign).toEqual(["warning-signs"]);
  });
});

describe("AI safety gate (aiService)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function request(data: AssessmentData): AiExplanationRequest {
    return {
      result: runAssessment(data),
      context: {
        age: data.age,
        gender: data.gender,
        diabetesStatus: data.diabetesStatus,
        familyHistory: data.familyHistory,
        activityLevel: data.activityLevel,
        smoking: data.smoking,
        dietPattern: data.dietPattern,
        symptoms: data.symptoms,
      },
    };
  }

  it("urgent: returns blocked-by-safety and makes NO network request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const out = await explainResults(request(make({ glucose: "320" })));
    expect(out.status).toBe("blocked-by-safety");
    expect(out.summary).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("normal: behaviour unchanged (not-configured when no AI URL is set)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const out = await explainResults(request(make({ glucose: "120" })));
    expect(out.status).toBe("not-configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
