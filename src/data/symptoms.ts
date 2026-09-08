/**
 * GlucoCare - symptom and warning-sign lists (educational)
 * -------------------------------------------------------------
 * Common diabetes-related symptoms [R1][R2]. Selecting symptoms never produces
 * a diagnosis - it only contributes to the educational concern indicator and
 * is shown back to the user on the results page.
 *
 * WARNING_SIGNS are potentially serious symptoms. Ticking any of them shows the
 * "seek medical care" banner. GlucoCare does not decide what they mean - it
 * only tells the user to contact a professional.
 */

export const DIABETES_SYMPTOMS: string[] = [
  "Excessive thirst",
  "Frequent urination",
  "Increased hunger",
  "Unexplained weight change",
  "Fatigue",
  "Blurred vision",
  "Slow wound healing",
  "Tingling or numbness in hands or feet",
];

export const WARNING_SIGNS: string[] = [
  "Confusion or difficulty staying awake",
  "Vomiting and unable to keep fluids down",
  "Fruity-smelling breath",
  "Rapid or deep breathing / shortness of breath",
  "Severe abdominal pain",
  "Fainting or loss of consciousness",
];
