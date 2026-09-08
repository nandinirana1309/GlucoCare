import { Link } from "react-router-dom";
import { Activity, Menu, X } from "lucide-react";
import { useState } from "react";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#071512]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6">
        <div className="h-20 flex items-center justify-between">

          <Link to="/" className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-400 flex items-center justify-center">
              <Activity className="text-[#071512]" size={24} />
            </div>

            <div>
              <div className="font-bold text-lg text-white">
                GlucoCare
              </div>

              <div className="text-[11px] text-slate-500">
                Diabetes Health System
              </div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm">
            <Link
              to="/"
              className="text-white hover:text-emerald-400 transition"
            >
              Home
            </Link>

            <Link
              to="/assessment"
              className="text-slate-400 hover:text-emerald-400 transition"
            >
              Assessment
            </Link>

            <Link
              to="/education"
              className="text-slate-400 hover:text-emerald-400 transition"
            >
              Education
            </Link>

            <Link
              to="/food"
              className="text-slate-400 hover:text-emerald-400 transition"
            >
              Nutrition
            </Link>

            <Link
              to="/hospitals"
              className="text-slate-400 hover:text-emerald-400 transition"
            >
              Healthcare
            </Link>
          </div>

          <Link
            to="/assessment"
            className="hidden md:block px-5 py-3 rounded-xl bg-emerald-400 text-[#071512] font-semibold hover:bg-emerald-300 transition"
          >
            Start Assessment
          </Link>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden text-white"
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden py-5 border-t border-white/10 space-y-4">

            <Link
              to="/"
              onClick={() => setMenuOpen(false)}
              className="block text-slate-300"
            >
              Home
            </Link>

            <Link
              to="/assessment"
              onClick={() => setMenuOpen(false)}
              className="block text-slate-300"
            >
              Assessment
            </Link>

            <Link
              to="/education"
              onClick={() => setMenuOpen(false)}
              className="block text-slate-300"
            >
              Education
            </Link>

            <Link
              to="/food"
              onClick={() => setMenuOpen(false)}
              className="block text-slate-300"
            >
              Nutrition
            </Link>

            <Link
              to="/hospitals"
              onClick={() => setMenuOpen(false)}
              className="block text-slate-300"
            >
              Healthcare
            </Link>

          </div>
        )}
      </div>
    </nav>
  );
}