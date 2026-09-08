import { describe, it, expect } from "vitest";
import { calculateBMI, bmiCategory } from "./bmi";

describe("calculateBMI", () => {
  it("computes a normal BMI", () => {
    expect(calculateBMI(170, 65)).toBeCloseTo(22.5, 1);
  });

  it("accepts string inputs from form fields", () => {
    expect(calculateBMI("160", "82")).toBeCloseTo(32.0, 1);
  });

  it("returns null when a value is missing", () => {
    expect(calculateBMI("", "70")).toBeNull();
    expect(calculateBMI(170, "")).toBeNull();
  });

  it("returns null for implausible values", () => {
    expect(calculateBMI(10, 70)).toBeNull(); // height too small
    expect(calculateBMI(170, 5)).toBeNull(); // weight too small
  });
});

describe("bmiCategory", () => {
  it("labels the WHO bands", () => {
    expect(bmiCategory(17)).toMatch(/below/i);
    expect(bmiCategory(22)).toMatch(/healthy-weight/i);
    expect(bmiCategory(27)).toMatch(/overweight/i);
    expect(bmiCategory(33)).toMatch(/obese/i);
  });

  it("handles null", () => {
    expect(bmiCategory(null)).toBe("Not calculated");
  });
});
