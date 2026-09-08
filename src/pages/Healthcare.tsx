import { useState } from "react";
import {
  Building2,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  Search,
  Stethoscope,
} from "lucide-react";

import { useAssessment } from "../hooks/useAssessment";
import { geocodeLocality, findFacilities } from "../services/healthcareService";
import type { HealthcareSearchState } from "../types/healthcare";
import Disclaimer from "../components/ui/Disclaimer";

export default function Healthcare() {
  const { data } = useAssessment();
  const [query, setQuery] = useState(data.locality ?? "");
  const [state, setState] = useState<HealthcareSearchState>({ status: "idle" });

  const search = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setState({ status: "loading" });
    try {
      const origin = await geocodeLocality(trimmed);
      const facilities = await findFacilities(origin);
      setState(
        facilities.length === 0
          ? { status: "empty", origin }
          : { status: "done", origin, facilities },
      );
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Something went wrong. Please try again.",
      });
    }
  };

  return (
    <main className="min-h-screen pt-28 pb-20">
      <div className="max-w-6xl mx-auto px-6">

        {/* HERO */}
        <section className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 text-emerald-400 text-sm">
            <Stethoscope size={16} />
            Healthcare Finder
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mt-7 leading-tight">
            Find healthcare
            <span className="text-emerald-400"> near you.</span>
          </h1>
          <p className="text-slate-400 mt-6 text-lg leading-relaxed">
            Search hospitals, clinics and doctors around your locality. Results
            come from OpenStreetMap and depend on what has been mapped in your
            area. GlucoCare does not endorse any facility.
          </p>
        </section>

        {/* SEARCH */}
        <section className="mt-10">
          <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
            <div className="relative flex-1">
              <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && search()}
                placeholder="City or locality, e.g. Vellore, Tamil Nadu"
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-white placeholder:text-slate-700 outline-none focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10 transition"
              />
            </div>
            <button
              onClick={search}
              disabled={state.status === "loading" || !query.trim()}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Search size={17} />
              {state.status === "loading" ? "Searching..." : "Search"}
            </button>
          </div>
        </section>

        {/* RESULTS */}
        <section className="mt-10">
          {state.status === "idle" && (
            <EmptyHint />
          )}

          {state.status === "loading" && (
            <p className="text-slate-500 text-sm">
              Looking up your locality and searching nearby facilities...
            </p>
          )}

          {state.status === "error" && (
            <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-6">
              <p className="text-sm text-red-300">{state.message}</p>
            </div>
          )}

          {state.status === "empty" && (
            <div className="rounded-2xl border border-white/10 bg-[#0b1d19] p-6">
              <p className="text-sm text-slate-400">
                No mapped hospitals or clinics were found within about 7 km of{" "}
                <span className="text-white">{state.origin.label}</span>. Try a
                nearby larger town, or search again later.
              </p>
            </div>
          )}

          {state.status === "done" && (
            <>
              <p className="text-sm text-slate-500">
                {state.facilities.length} places near{" "}
                <span className="text-slate-300">{state.origin.label}</span>
              </p>

              <div className="grid md:grid-cols-2 gap-4 mt-5">
                {state.facilities.map((facility) => (
                  <div
                    key={facility.id}
                    className="rounded-2xl border border-white/10 bg-[#0b1d19] p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400 shrink-0">
                          <Building2 size={18} />
                        </div>
                        <div>
                          <p className="font-semibold leading-tight">{facility.name}</p>
                          <p className="text-xs text-emerald-400 mt-1">{facility.category}</p>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 shrink-0 flex items-center gap-1">
                        <Navigation size={12} />
                        {facility.distanceKm} km
                      </span>
                    </div>

                    {facility.address && (
                      <p className="text-xs text-slate-500 mt-3 leading-relaxed">{facility.address}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 mt-4">
                      {facility.phone && (
                        <a
                          href={`tel:${facility.phone}`}
                          className="text-xs text-slate-300 inline-flex items-center gap-1.5 hover:text-emerald-400 transition"
                        >
                          <Phone size={13} />
                          {facility.phone}
                        </a>
                      )}
                      <a
                        href={facility.osmUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-300 inline-flex items-center gap-1.5 hover:text-emerald-400 transition"
                      >
                        <ExternalLink size={13} />
                        View on map
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-slate-600 mt-6">
                Data &copy; OpenStreetMap contributors. Listings may be incomplete
                or out of date - always confirm before travelling.
              </p>
            </>
          )}
        </section>

        <Disclaimer className="mt-16" />
      </div>
    </main>
  );
}

function EmptyHint() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b1d19] p-8 text-center">
      <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">
        <Search size={22} />
      </div>
      <p className="text-sm text-slate-400 mt-4">
        Enter a city or locality above to search for nearby hospitals, clinics
        and doctors.
      </p>
    </div>
  );
}
