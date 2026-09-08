import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import { useAssessment } from "../../hooks/useAssessment";

export default function Footer() {
  const { hasStarted, reset } = useAssessment();

  const handleClear = () => {
    if (
      window.confirm(
        "This deletes the assessment saved in this browser. Continue?",
      )
    ) {
      reset();
    }
  };

  return (
    <footer className="border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row justify-between gap-6">

          <Link to="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-400 flex items-center justify-center">
              <Activity size={20} className="text-[#071512]" />
            </div>

            <div>
              <p className="font-semibold">GlucoCare</p>
              <p className="text-xs text-slate-600">
                Diabetes Health Assessment and Support System
              </p>
            </div>
          </Link>

          <div className="md:text-right">
            <p className="text-sm text-slate-600 max-w-sm">
              Educational project &middot; Not a substitute for professional
              medical advice or diagnosis
            </p>
            {hasStarted && (
              <button
                onClick={handleClear}
                className="text-xs text-slate-600 hover:text-red-400 transition mt-2"
              >
                Clear my data from this browser
              </button>
            )}
          </div>

        </div>
      </div>
    </footer>
  );
}
