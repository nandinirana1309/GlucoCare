import { Sparkles } from "lucide-react";

/**
 * A small pill that marks something as not-yet-built, so the UI is always
 * honest about what is a working prototype vs. a planned feature.
 * Used for report extraction, AI explanations, live hospital data, etc.
 */
export default function FutureBadge({
  label = "Proposed Feature",
}: {
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-400/20 bg-emerald-400/5 text-emerald-400 text-xs font-medium">
      <Sparkles size={13} />
      {label}
    </span>
  );
}
