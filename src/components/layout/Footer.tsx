import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import { useAssessment } from "../../hooks/useAssessment";
import { useHealthHistory } from "../../hooks/useHealthHistory";
import { useClearAllData } from "../../hooks/useClearAllData";
import { describeRepositoryError } from "../../services/health";

export default function Footer() {
  const { hasStarted } = useAssessment();
  const { history } = useHealthHistory();
  const clearAll = useClearAllData();
  const [error, setError] = useState("");

  const hasHistory = history.assessments.length > 0 || history.reports.length > 0;

  const handleClear = async () => {
    try {
      await clearAll();
      setError("");
    } catch (e) {
      setError(describeRepositoryError(e));
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
            {(hasStarted || hasHistory) && (
              <button
                onClick={handleClear}
                className="text-xs text-slate-600 hover:text-red-400 transition mt-2"
              >
                Delete all my GlucoCare data
              </button>
            )}
            {error && <p role="alert" className="text-xs text-red-400 mt-1">{error}</p>}
          </div>

        </div>
      </div>
    </footer>
  );
}
