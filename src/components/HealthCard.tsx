import type { LucideIcon } from "lucide-react";

type HealthCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export default function HealthCard({
  icon: Icon,
  title,
  description,
}: HealthCardProps) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.06] hover:border-emerald-400/20 transition-all duration-300">

      <div className="w-12 h-12 rounded-xl bg-emerald-400/10 flex items-center justify-center mb-5">
        <Icon className="text-emerald-400" size={23} />
      </div>

      <h3 className="text-lg font-semibold text-white">
        {title}
      </h3>

      <p className="text-sm text-slate-500 leading-relaxed mt-2">
        {description}
      </p>

    </div>
  );
}
