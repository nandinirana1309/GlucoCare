/**
 * GlucoCare - reference criteria
 * -------------------------------------------------------------
 * These are widely published EDUCATIONAL reference points, not GlucoCare's
 * own thresholds and not a diagnostic rule set. Sources are cited with
 * placeholders [R1]-[R3] that map to the References list:
 *   [R1] World Health Organization - Diabetes
 *   [R2] American Diabetes Association - Standards of Care in Diabetes
 *   [R3] American College of Cardiology / American Heart Association - Blood Pressure
 *
 * Limitation shown to the user: GlucoCare does not know whether a glucose
 * reading was taken fasting or randomly, so glucose is treated as indicative
 * only.
 */

export interface ReferenceBand {
  /** inclusive lower bound (or -Infinity) */
  min: number;
  /** exclusive upper bound (or Infinity) */
  max: number;
  rating:
    | "within-reference"
    | "borderline"
    | "above-reference"
    | "below-reference";
  statusText: string;
}

export interface ReferenceRange {
  label: string;
  unit: string;
  citation: string;
  /** One-line description of the criteria, shown in "what this means". */
  referenceText: string;
  bands: ReferenceBand[];
}

export const GLUCOSE_REFERENCE: ReferenceRange = {
  label: "Blood Glucose",
  unit: "mg/dL",
  citation: "[R2]",
  referenceText:
    "Fasting reference: below 100 within range, 100-125 borderline (prediabetes range), 126 or above elevated. GlucoCare cannot tell if a reading was fasting.",
  bands: [
    { min: -Infinity, max: 70, rating: "below-reference", statusText: "Below the usual reference range" },
    { min: 70, max: 100, rating: "within-reference", statusText: "Within the fasting reference range" },
    { min: 100, max: 126, rating: "borderline", statusText: "Borderline (prediabetes fasting range)" },
    { min: 126, max: Infinity, rating: "above-reference", statusText: "Elevated compared with the fasting reference range" },
  ],
};

export const HBA1C_REFERENCE: ReferenceRange = {
  label: "HbA1c",
  unit: "%",
  citation: "[R2]",
  referenceText:
    "Reference: below 5.7% within range, 5.7-6.4% borderline (prediabetes range), 6.5% or above elevated.",
  bands: [
    { min: -Infinity, max: 5.7, rating: "within-reference", statusText: "Within the reference range" },
    { min: 5.7, max: 6.5, rating: "borderline", statusText: "Borderline (prediabetes range)" },
    { min: 6.5, max: Infinity, rating: "above-reference", statusText: "Elevated compared with the reference range" },
  ],
};

/** BMI - World Health Organization adult categories. */
export const BMI_REFERENCE: ReferenceRange = {
  label: "BMI",
  unit: "kg/m2",
  citation: "[R1]",
  referenceText:
    "WHO adult categories: below 18.5 underweight, 18.5-24.9 healthy range, 25-29.9 overweight, 30 or above obese. BMI is a general screen and does not measure body composition.",
  bands: [
    { min: -Infinity, max: 18.5, rating: "below-reference", statusText: "Below the healthy-weight range" },
    { min: 18.5, max: 25, rating: "within-reference", statusText: "Within the healthy-weight range" },
    { min: 25, max: 30, rating: "borderline", statusText: "Above the healthy-weight range (overweight)" },
    { min: 30, max: Infinity, rating: "above-reference", statusText: "Well above the healthy-weight range (obese)" },
  ],
};

/**
 * Blood pressure is scored on the higher-risk of the two numbers.
 * ACC/AHA adult categories.
 */
export const BLOOD_PRESSURE_REFERENCE = {
  label: "Blood Pressure",
  unit: "mmHg",
  citation: "[R3]",
  referenceText:
    "ACC/AHA categories: below 120/80 within range, 120-129 systolic elevated, 130/80 stage 1, 140/90 or above stage 2.",
};

/** Result of classifying a value against a ReferenceRange. */
export function classify(range: ReferenceRange, value: number): ReferenceBand {
  const band = range.bands.find((b) => value >= b.min && value < b.max);
  return band ?? range.bands[range.bands.length - 1];
}
