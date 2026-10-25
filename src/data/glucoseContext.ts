/**
 * Labels for when a glucose reading was taken. The fasting description
 * follows the ADA definition of fasting (no caloric intake for at least
 * 8 hours) [R2]. Context is used to keep readings apart in history/trends;
 * it never changes the assessment score.
 */
export const GLUCOSE_CONTEXT_LABELS: Record<string, string> = {
  fasting: "Fasting (no food for at least 8 hours)",
  random: "Random (any time of day)",
  post_meal: "After a meal",
  unknown: "Not sure",
};

/** Short labels for charts and tables. */
export const GLUCOSE_CONTEXT_SHORT: Record<string, string> = {
  fasting: "Fasting",
  random: "Random",
  post_meal: "After meal",
  unknown: "Context not recorded",
};
