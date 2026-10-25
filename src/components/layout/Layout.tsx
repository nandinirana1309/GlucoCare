import { useEffect } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "../Navbar";
import Footer from "./Footer";

/**
 * App shell: fixed top Navbar, page content, Footer.
 * Every route is rendered inside this (see App.tsx), so the Navbar and Footer
 * now appear on every page - previously only the Home page had them.
 */
export default function Layout({ children }: { children: ReactNode }) {
  const { pathname, hash } = useLocation();

  // Links such as /education#symptoms (personalised education) scroll to the
  // section. React Router does not do this by itself.
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 50);
    return () => window.clearTimeout(timer);
  }, [pathname, hash]);

  return (
    <div className="min-h-screen bg-[#071512] text-white flex flex-col">
      <Navbar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
