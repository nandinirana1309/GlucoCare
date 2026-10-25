import { AlertTriangle } from "lucide-react";

type EmergencyBannerProps = {
  /** Plain-language reasons the banner appeared (never a diagnosis). */
  reasons?: string[];
  /**
   * Reasons WITH the input that caused them (from result.safety.triggers).
   * When given, shown instead of `reasons`.
   */
  triggers?: { reason: string; evidence: string }[];
  /** Announce to screen readers as soon as it appears (e.g. on the form). */
  live?: boolean;
  className?: string;
};

/**
 * Red "please seek medical care" banner.
 * Created in Stage 1. Shown by the Results page when the assessment's safety
 * status (src/lib/safety.ts) is urgent, and on the assessment form as soon as
 * a warning sign is ticked. It never names a condition - it only tells the
 * user to contact a professional.
 */
export default function EmergencyBanner({
  reasons = [],
  triggers,
  live = false,
  className = "",
}: EmergencyBannerProps) {
  const items = triggers ?? reasons.map((reason) => ({ reason, evidence: "" }));

  return (
    <div
      className={`rounded-2xl border border-red-400/30 bg-red-400/10 p-6 ${className}`}
      role={live ? "alert" : undefined}
    >
      <div className="flex gap-4">
        <div className="w-11 h-11 shrink-0 rounded-xl bg-red-400/15 flex items-center justify-center">
          <AlertTriangle className="text-red-400" size={22} />
        </div>

        <div>
          <p className="text-xs text-red-300 uppercase tracking-widest font-semibold">
            Seek medical care
          </p>

          <h3 className="text-lg font-bold mt-1">
            Some of the information you entered may need prompt medical attention
          </h3>

          <p className="text-sm text-slate-300 mt-2 leading-relaxed max-w-2xl">
            Please contact a qualified healthcare professional or your local
            emergency service. GlucoCare cannot assess an emergency and does not
            provide a diagnosis.
          </p>

          {items.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {items.map((item) => (
                <li key={item.reason} className="text-sm text-slate-400 flex gap-2">
                  <span className="text-red-400">&bull;</span>
                  <span>
                    {item.reason}
                    {item.evidence && (
                      <span className="block text-xs text-slate-500 mt-0.5">{item.evidence}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
