import type { ReactNode } from "react";
import Navbar from "../Navbar";
import Footer from "./Footer";

/**
 * App shell: fixed top Navbar, page content, Footer.
 * Every route is rendered inside this (see App.tsx), so the Navbar and Footer
 * now appear on every page - previously only the Home page had them.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#071512] text-white flex flex-col">
      <Navbar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
