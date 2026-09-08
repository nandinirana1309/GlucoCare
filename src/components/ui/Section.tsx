import type { ReactNode } from "react";

type SectionProps = {
  /** Small uppercase label shown above the title (optional). */
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
};

/**
 * Standard section heading used across pages so every section looks the same:
 * emerald eyebrow, bold title, muted description.
 */
export default function Section({
  eyebrow,
  title,
  description,
  children,
  className = "",
}: SectionProps) {
  return (
    <div className={className}>
      {eyebrow && (
        <p className="text-emerald-400 text-sm font-semibold uppercase tracking-widest">
          {eyebrow}
        </p>
      )}

      <h2 className="text-2xl md:text-3xl font-bold mt-2">{title}</h2>

      {description && (
        <p className="text-slate-400 mt-3 leading-relaxed max-w-2xl">
          {description}
        </p>
      )}

      {children}
    </div>
  );
}
