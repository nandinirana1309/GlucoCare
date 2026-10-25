/**
 * GlucoCare - shared assessment data model
 * -------------------------------------------------------------
 * This describes ONE diabetes assessment record exactly as it is SAVED
 * (browser localStorage now; also a database from Stage 7).
 *
 * Rules:
 *  - Every measurement field is a `string` because it comes straight from an
 *    <input>. Parsing + range checks live in `src/lib/` - never in components.
 *  - The uploaded medical report is stored here only as a file NAME. The real
 *    File object stays in the Assessment page's local state. Automatic reading
 *    of reports is a Proposed Feature (Stage 6).
 *  - Fields are only ever ADDED, never renamed, so old saved data still loads.
 */

export type YesNoUnsure = "Yes" | "No" | "Not sure" | "";

export type ActivityLevel =
  | ""
  | "Sedentary"
  | "Lightly active"
  | "Moderately active"
  | "Very active";

export type SmokingStatus = "" | "No" | "Former smoker" | "Yes";

export type DietPattern =
  | ""
  | "Generally balanced"
  | "Often high in sugary food or drinks"
  | "Irregular / skipped meals"
  | "Not sure";

/** When a glucose reading was taken. "" = not answered (treated as unknown). */
export type GlucoseContext = "fasting" | "random" | "post_meal" | "unknown";

export interface AssessmentData {
  /* Step 1 - Patient information */
  name: string;
  age: string;
  gender: string;

  /* Step 2 - Medical history */
  diabetesStatus: YesNoUnsure;
  diabetesType: string;
  familyHistory: YesNoUnsure;
  otherConditions: string;

  /* Step 3 - Health measurements */
  glucose: string;
  /** Added in Project-II. Display/trend context only - never changes scoring. */
  glucoseContext: GlucoseContext | "";
  hba1c: string;
  height: string;
  weight: string;
  systolic: string;
  diastolic: string;
  symptoms: string[];
  otherSymptoms: string;
  /** Serious warning signs the user ticked (drives the emergency banner). */
  warningSigns: string[];

  /* Step 4 - Lifestyle */
  activityLevel: ActivityLevel;
  smoking: SmokingStatus;
  dietPattern: DietPattern;
  sleepHours: string;

  /* Step 5 - Location & report */
  locality: string;
  /** Legacy (Stage 6) attached-file name. Never copied into health history. */
  report: string | null;
  /**
   * Added in Project-II: the date these values refer to (yyyy-mm-dd).
   * "" = today. Lets users record older readings in their history.
   */
  assessedOn: string;
}

/** A blank assessment - the starting point for a new user. */
export const emptyAssessment: AssessmentData = {
  name: "",
  age: "",
  gender: "",
  diabetesStatus: "",
  diabetesType: "",
  familyHistory: "",
  otherConditions: "",
  glucose: "",
  glucoseContext: "",
  hba1c: "",
  height: "",
  weight: "",
  systolic: "",
  diastolic: "",
  symptoms: [],
  otherSymptoms: "",
  warningSigns: [],
  activityLevel: "",
  smoking: "",
  dietPattern: "",
  sleepHours: "",
  locality: "",
  report: null,
  assessedOn: "",
};

/**
 * Older saved data may be missing newer fields. This fills any gaps so the
 * rest of the app can trust the shape.
 */
export function normalizeAssessment(
  input: Partial<AssessmentData> | null | undefined,
): AssessmentData {
  return {
    ...emptyAssessment,
    ...(input ?? {}),
    symptoms: Array.isArray(input?.symptoms) ? input!.symptoms : [],
    warningSigns: Array.isArray(input?.warningSigns) ? input!.warningSigns : [],
  };
}

/** localStorage key. Keep this stable so saved data keeps loading. */
export const ASSESSMENT_STORAGE_KEY = "glucocare-assessment";
