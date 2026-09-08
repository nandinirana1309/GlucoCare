import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen pt-32 px-6">
      <div className="max-w-xl mx-auto text-center py-24">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">
          <Compass size={28} />
        </div>

        <h1 className="text-4xl font-bold mt-7">Page not found</h1>

        <p className="text-slate-400 mt-4">
          The page you are looking for does not exist or may have moved.
        </p>

        <Link
          to="/"
          className="inline-flex items-center gap-2 mt-8 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
