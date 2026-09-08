import type { BadgeTone } from "../components/ui/Badge";

/** Maps an indicator rating (from the assessment engine) to a Badge tone. */
export function ratingToTone(rating: string): BadgeTone {
  switch (rating) {
    case "within-reference":
      return "positive";
    case "borderline":
      return "caution";
    case "above-reference":
      return "critical";
    case "below-reference":
      return "info";
    default:
      return "neutral";
  }
}
