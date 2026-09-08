/**
 * The single, consistent "this is not a diagnosis" notice.
 * Use this everywhere instead of writing the sentence by hand, so the wording
 * can never drift and every page carries the same safety message.
 */

type DisclaimerProps = {
  /** "inline" = small centred text. "card" = bordered box. */
  variant?: "inline" | "card";
  className?: string;
};

const DISCLAIMER_TEXT =
  "GlucoCare is an educational health assessment and support project. It does not provide a medical diagnosis and is not a substitute for advice, diagnosis or treatment from a qualified healthcare professional. Always consult a professional for personal medical guidance.";

export default function Disclaimer({
  variant = "inline",
  className = "",
}: DisclaimerProps) {
  if (variant === "card") {
    return (
      <div
        className={`rounded-2xl border border-white/10 bg-white/[0.02] p-5 ${className}`}
      >
        <p className="text-xs text-slate-500 leading-relaxed">
          {DISCLAIMER_TEXT}
        </p>
      </div>
    );
  }

  return (
    <p
      className={`text-center text-xs text-slate-600 max-w-2xl mx-auto leading-relaxed ${className}`}
    >
      {DISCLAIMER_TEXT}
    </p>
  );
}
