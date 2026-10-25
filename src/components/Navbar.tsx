import { Link, useLocation } from "react-router-dom";
import { Activity, Menu, X } from "lucide-react";
import { useState } from "react";

/**
 * Top navigation. The current page is highlighted and marked with
 * aria-current="page". Older paths (/food, /hospitals) still route to the
 * same pages and count as Nutrition / Healthcare.
 */
const LINKS: { to: string; label: string; end?: boolean; alias?: string }[] = [
  { to: "/", label: "Home", end: true },
  { to: "/assessment", label: "Assessment" },
  { to: "/journey", label: "My Health" },
  { to: "/education", label: "Education" },
  { to: "/nutrition", label: "Nutrition", alias: "/food" },
  { to: "/healthcare", label: "Healthcare", alias: "/hospitals" },
];

function isActive(pathname: string, link: (typeof LINKS)[number]): boolean {
  const matches = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  if (link.end) return pathname === link.to;
  return matches(link.to) || (link.alias !== undefined && matches(link.alias));
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <nav aria-label="Main" className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#071512]/90 backdrop-blur-xl">
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

          <div className="hidden lg:flex items-center gap-7 text-sm">
            {LINKS.map((link) => {
              const active = isActive(pathname, link);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  className={`transition hover:text-emerald-400 ${active ? "text-white font-semibold" : "text-slate-400"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <Link
            to="/assessment"
            className="hidden lg:block px-5 py-3 rounded-xl bg-emerald-400 text-[#071512] font-semibold hover:bg-emerald-300 transition"
          >
            Start Assessment
          </Link>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden text-white"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {menuOpen && (
          <div id="mobile-menu" className="lg:hidden py-5 border-t border-white/10 space-y-4">
            {LINKS.map((link) => {
              const active = isActive(pathname, link);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`block ${active ? "text-emerald-400 font-semibold" : "text-slate-300"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
