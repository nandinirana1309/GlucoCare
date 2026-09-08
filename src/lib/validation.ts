/**
 * Input validation for the assessment form.
 * Each validator returns an error message string, or "" when the value is OK.
 * Empty input is always allowed (every measurement is optional).
 *
 * The ranges below are "plausible data entry" limits, NOT medical thresholds -
 * they only catch typos like a glucose of 15000.
 */

function between(
  value: string,
  low: number,
  high: number,
  unit: string,
): string {
  if (value.trim() === "") return "";
  const n = Number(value);
  if (Number.isNaN(n)) return "Enter a number.";
  if (n < low || n > high) {
    return `Enter a value between ${low} and ${high} ${unit}.`;
  }
  return "";
}

export const validators = {
  age: (v: string) => between(v, 1, 120, "years"),
  glucose: (v: string) => between(v, 20, 800, "mg/dL"),
  hba1c: (v: string) => between(v, 3, 20, "%"),
  height: (v: string) => between(v, 50, 260, "cm"),
  weight: (v: string) => between(v, 10, 400, "kg"),
  systolic: (v: string) => between(v, 60, 260, "mmHg"),
  diastolic: (v: string) => between(v, 30, 180, "mmHg"),
  sleepHours: (v: string) => between(v, 0, 24, "hours"),
};

export type ValidatableField = keyof typeof validators;

/** Validate one field. Returns "" when valid. */
export function validateField(field: ValidatableField, value: string): string {
  return validators[field](value);
}

/** Validate many fields; returns a map of field -> error message (only errors). */
export function validateFields(
  values: Partial<Record<ValidatableField, string>>,
): Partial<Record<ValidatableField, string>> {
  const errors: Partial<Record<ValidatableField, string>> = {};
  (Object.keys(values) as ValidatableField[]).forEach((field) => {
    const message = validateField(field, values[field] ?? "");
    if (message) errors[field] = message;
  });
  return errors;
}
