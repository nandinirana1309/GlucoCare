import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  /** Adds a hover highlight (for clickable / interactive cards). */
  interactive?: boolean;
};

/** Standard dark rounded card used across the app. */
export default function Card({
  children,
  className = "",
  interactive = false,
}: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-[#0b1d19] p-6 ${
        interactive
          ? "transition hover:border-emerald-400/25 hover:bg-[#0d211d]"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
