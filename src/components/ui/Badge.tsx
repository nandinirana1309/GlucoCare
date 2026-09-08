import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "positive"
  | "caution"
  | "critical"
  | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-white/15 bg-white/5 text-slate-300",
  positive: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  caution: "border-yellow-400/25 bg-yellow-400/10 text-yellow-300",
  critical: "border-red-400/30 bg-red-400/10 text-red-300",
  info: "border-sky-400/25 bg-sky-400/10 text-sky-300",
};

export default function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
