/**
 * BMI helpers. Pure functions - no React, easy to unit test (Stage 9).
 */

import { BMI_REFERENCE, classify } from "../data/referenceRanges";

/**
 * Body Mass Index from height in centimetres and weight in kilograms.
 * Returns null if either input is missing or not a sensible number.
 */
export function calculateBMI(
  heightCm: number | string,
  weightKg: number | string,
): number | null {
  const h = typeof heightCm === "string" ? parseFloat(heightCm) : heightCm;
  const w = typeof weightKg === "string" ? parseFloat(weightKg) : weightKg;

  if (!Number.isFinite(h) || !Number.isFinite(w)) return null;
  if (h < 50 || h > 260) return null; // outside plausible human height (cm)
  if (w < 10 || w > 400) return null; // outside plausible human weight (kg)

  const metres = h / 100;
  const bmi = w / (metres * metres);
  return Math.round(bmi * 10) / 10;
}

/** Plain-language WHO category for a BMI value. */
export function bmiCategory(bmi: number | null): string {
  if (bmi === null) return "Not calculated";
  return classify(BMI_REFERENCE, bmi).statusText;
}
