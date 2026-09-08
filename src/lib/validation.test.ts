import { describe, it, expect } from "vitest";
import { validateField, validateFields } from "./validation";

describe("validateField", () => {
  it("allows empty values (every measurement is optional)", () => {
    expect(validateField("glucose", "")).toBe("");
    expect(validateField("age", "")).toBe("");
  });

  it("accepts values inside the plausible range", () => {
    expect(validateField("glucose", "120")).toBe("");
    expect(validateField("hba1c", "6.2")).toBe("");
    expect(validateField("systolic", "130")).toBe("");
  });

  it("rejects out-of-range typos", () => {
    expect(validateField("glucose", "15000")).not.toBe("");
    expect(validateField("age", "999")).not.toBe("");
    expect(validateField("hba1c", "0")).not.toBe("");
  });

  it("rejects non-numbers", () => {
    expect(validateField("weight", "abc")).toBe("Enter a number.");
  });
});

describe("validateFields", () => {
  it("returns only the fields that have errors", () => {
    const errors = validateFields({ glucose: "120", age: "500" });
    expect(errors.glucose).toBeUndefined();
    expect(errors.age).toBeDefined();
  });
});
