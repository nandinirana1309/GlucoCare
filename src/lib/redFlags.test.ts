import { describe, it, expect } from "vitest";
import { checkRedFlags } from "./redFlags";
import { emptyAssessment } from "../types/assessment";

describe("checkRedFlags", () => {
  it("no flags for a blank assessment", () => {
    expect(checkRedFlags(emptyAssessment)).toEqual([]);
  });

  it("flags very high glucose", () => {
    const flags = checkRedFlags({ ...emptyAssessment, glucose: "320" });
    expect(flags.some((f) => f.id === "glucose-very-high")).toBe(true);
  });

  it("flags very low glucose", () => {
    const flags = checkRedFlags({ ...emptyAssessment, glucose: "45" });
    expect(flags.some((f) => f.id === "glucose-very-low")).toBe(true);
  });

  it("does not flag an ordinary glucose", () => {
    expect(checkRedFlags({ ...emptyAssessment, glucose: "150" })).toEqual([]);
  });

  it("flags a hypertensive-crisis blood pressure", () => {
    const flags = checkRedFlags({ ...emptyAssessment, systolic: "185", diastolic: "100" });
    expect(flags.some((f) => f.id === "bp-crisis")).toBe(true);
  });

  it("flags any serious warning sign", () => {
    const flags = checkRedFlags({
      ...emptyAssessment,
      warningSigns: ["Fainting or loss of consciousness"],
    });
    expect(flags.some((f) => f.id === "warning-signs")).toBe(true);
  });
});
