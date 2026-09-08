import AssessmentPage from "./pages/Assessment";
import EducationPage from "./pages/Education";
import ResultsPage from "./pages/Results";
import type { ReactNode } from "react";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  FileText,
  HeartPulse,
  ShieldCheck,
  Stethoscope,
  Utensils,
} from "lucide-react";

import Navbar from "./components/Navbar";
import HealthCard from "./components/HealthCard";


/* =========================================================
   LAYOUT
========================================================= */

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#071512] text-white">
      <Navbar />
      {children}
    </div>
  );
}


/* =========================================================
   HOME
========================================================= */

function Home() {
  return (
    <Layout>

      {/* HERO */}

      <section className="relative overflow-hidden pt-20">

        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-emerald-400/10 rounded-full blur-[140px]" />

        <div className="absolute top-40 -left-40 w-80 h-80 bg-teal-400/10 rounded-full blur-[100px]" />

        <div className="relative max-w-7xl mx-auto px-6 py-24 md:py-32">

          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* LEFT */}

            <div>

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 text-emerald-400 text-sm">

                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />

                Diabetes-focused health assessment

              </div>


              <h1 className="mt-7 text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">

                Understand your
                <br />

                <span className="text-emerald-400">
                  diabetes health.
                </span>

              </h1>


              <p className="mt-7 text-lg text-slate-400 leading-relaxed max-w-xl">

                GlucoCare brings together health information, symptoms,
                medical reports and diabetes-related indicators into one
                simple health assessment experience.

              </p>


              <div className="mt-10 flex flex-wrap gap-4">

                <a
                  href="/assessment"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition shadow-lg shadow-emerald-400/10"
                >

                  Start Assessment

                  <ArrowRight size={18} />

                </a>


                <a
                  href="/education"
                  className="inline-flex items-center gap-2 px-7 py-4 rounded-xl border border-white/10 bg-white/5 font-semibold hover:bg-white/10 transition"
                >

                  Learn About Diabetes

                  <BookOpen size={18} />

                </a>

              </div>


              <div className="mt-12 flex items-center gap-8">

                <div>

                  <p className="text-2xl font-bold">
                    01
                  </p>

                  <p className="text-sm text-slate-500">
                    Patient Input
                  </p>

                </div>


                <div className="w-px h-10 bg-white/10" />


                <div>

                  <p className="text-2xl font-bold">
                    02
                  </p>

                  <p className="text-sm text-slate-500">
                    Assessment
                  </p>

                </div>


                <div className="w-px h-10 bg-white/10" />


                <div>

                  <p className="text-2xl font-bold">
                    03
                  </p>

                  <p className="text-sm text-slate-500">
                    Insights
                  </p>

                </div>

              </div>

            </div>


            {/* DASHBOARD PREVIEW */}

            <div className="relative">

              <div className="absolute inset-0 bg-emerald-400/10 blur-3xl rounded-full" />


              <div className="relative rounded-3xl border border-white/10 bg-[#0d211d] p-6 md:p-8 shadow-2xl">

                <div className="flex items-center justify-between mb-7">

                  <div>

                    <p className="text-sm text-slate-500">
                      Health Overview
                    </p>

                    <h2 className="text-2xl font-bold mt-1">
                      Diabetes Assessment
                    </h2>

                  </div>


                  <div className="w-12 h-12 rounded-2xl bg-emerald-400/10 flex items-center justify-center">

                    <HeartPulse
                      className="text-emerald-400"
                      size={24}
                    />

                  </div>

                </div>


                <div className="rounded-2xl bg-white/5 border border-white/5 p-5">

                  <div className="flex justify-between items-start">

                    <div>

                      <p className="text-sm text-slate-500">
                        Assessment status
                      </p>

                      <p className="text-2xl font-bold mt-2">
                        Ready
                      </p>

                    </div>


                    <span className="px-3 py-1 rounded-full bg-emerald-400/10 text-emerald-400 text-xs">
                      Start when ready
                    </span>

                  </div>


                  <div className="mt-6 h-2 bg-white/5 rounded-full overflow-hidden">

                    <div className="h-full w-[35%] bg-emerald-400 rounded-full" />

                  </div>

                </div>


                <div className="grid grid-cols-2 gap-4 mt-4">

                  <MiniCard
                    icon={<Activity size={18} />}
                    title="Glucose"
                    value="—"
                    unit="mg/dL"
                  />

                  <MiniCard
                    icon={<BarChart3 size={18} />}
                    title="HbA1c"
                    value="—"
                    unit="%"
                  />

                  <MiniCard
                    icon={<Activity size={18} />}
                    title="BMI"
                    value="—"
                    unit=""
                  />

                  <MiniCard
                    icon={<HeartPulse size={18} />}
                    title="Blood Pressure"
                    value="—"
                    unit=""
                  />

                </div>


                <div className="mt-5 flex gap-3 p-4 rounded-2xl border border-emerald-400/10 bg-emerald-400/5">

                  <CheckCircle2
                    className="text-emerald-400 shrink-0"
                    size={20}
                  />

                  <div>

                    <p className="text-sm font-semibold">
                      Your information stays organized
                    </p>

                    <p className="text-xs text-slate-500 mt-1">
                      View health indicators in one place.
                    </p>

                  </div>

                </div>

              </div>

            </div>

          </div>

        </div>

      </section>


      {/* FEATURES */}

      <section className="border-t border-white/10 bg-[#081a17]">

        <div className="max-w-7xl mx-auto px-6 py-24">

          <div className="max-w-2xl">

            <p className="text-emerald-400 text-sm font-semibold uppercase tracking-widest">
              One focused system
            </p>

            <h2 className="text-4xl md:text-5xl font-bold mt-4">

              Built around
              <span className="text-emerald-400">
                {" "}diabetes care.
              </span>

            </h2>

            <p className="text-slate-400 mt-5 leading-relaxed">

              GlucoCare combines assessment, education and healthcare
              resources into one easy-to-use platform.

            </p>

          </div>


          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mt-14">

            <HealthCard
              icon={Activity}
              title="Health Assessment"
              description="Record glucose, HbA1c, BMI, blood pressure and other relevant indicators."
            />

            <HealthCard
              icon={FileText}
              title="Report Support"
              description="Upload medical reports and use relevant information during assessment."
            />

            <HealthCard
              icon={BookOpen}
              title="Diabetes Education"
              description="Learn about diabetes types, symptoms, risk factors and management."
            />

            <HealthCard
              icon={Stethoscope}
              title="Healthcare Access"
              description="Find relevant healthcare facilities based on your locality."
            />

          </div>

        </div>

      </section>


      {/* HOW IT WORKS */}

      <section className="max-w-7xl mx-auto px-6 py-24">

        <div className="grid lg:grid-cols-2 gap-16 items-center">

          <div>

            <p className="text-emerald-400 text-sm font-semibold uppercase tracking-widest">
              How it works
            </p>

            <h2 className="text-4xl md:text-5xl font-bold mt-4">

              From information
              <br />
              to understanding.

            </h2>

            <p className="text-slate-400 mt-6 leading-relaxed max-w-xl">

              The system guides the user through a simple process,
              beginning with their health information and ending with
              a structured assessment and educational guidance.

            </p>

          </div>


          <div className="space-y-4">

            <ProcessStep
              number="01"
              icon={<Activity />}
              title="Enter health information"
              description="Provide your symptoms, measurements and relevant medical history."
            />

            <ProcessStep
              number="02"
              icon={<FileText />}
              title="Add a medical report"
              description="Upload a report when available and verify extracted information."
            />

            <ProcessStep
              number="03"
              icon={<BarChart3 />}
              title="Review your assessment"
              description="View your health indicators and assessment results."
            />

            <ProcessStep
              number="04"
              icon={<ShieldCheck />}
              title="Explore guidance"
              description="Access educational information, recommendations and healthcare resources."
            />

          </div>

        </div>

      </section>


      {/* BOTTOM CTA */}

      <section className="border-t border-white/10 bg-[#081a17]">

        <div className="max-w-5xl mx-auto px-6 py-24 text-center">

          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-400/10 flex items-center justify-center">

            <HeartPulse
              className="text-emerald-400"
              size={30}
            />

          </div>


          <h2 className="text-4xl md:text-5xl font-bold mt-7">

            Start understanding
            <br />
            your health today.

          </h2>


          <p className="text-slate-400 mt-5 max-w-xl mx-auto">

            Begin a diabetes-focused health assessment and explore
            information designed to help you better understand the
            factors that matter.

          </p>


          <a
            href="/assessment"
            className="inline-flex items-center gap-2 mt-8 px-7 py-4 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition"
          >

            Start Assessment

            <ArrowRight size={18} />

          </a>

        </div>

      </section>


      {/* FOOTER */}

      <footer className="border-t border-white/10">

        <div className="max-w-7xl mx-auto px-6 py-10">

          <div className="flex flex-col md:flex-row justify-between gap-6">

            <div className="flex items-center gap-3">

              <div className="w-9 h-9 rounded-lg bg-emerald-400 flex items-center justify-center">

                <Activity
                  size={20}
                  className="text-[#071512]"
                />

              </div>


              <div>

                <p className="font-semibold">
                  GlucoCare
                </p>

                <p className="text-xs text-slate-600">
                  Diabetes Health Assessment System
                </p>

              </div>

            </div>


            <p className="text-sm text-slate-600">

              Educational project · Not a substitute for professional medical advice

            </p>

          </div>

        </div>

      </footer>

    </Layout>
  );
}


/* =========================================================
   MINI CARD
========================================================= */

function MiniCard({
  icon,
  title,
  value,
  unit,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/5 p-4">

      <div className="flex items-center gap-2 text-slate-500 text-sm">

        <span className="text-emerald-400">
          {icon}
        </span>

        {title}

      </div>


      <p className="text-xl font-bold mt-3">

        {value}

        <span className="text-xs text-slate-500 font-normal ml-1">
          {unit}
        </span>

      </p>

    </div>
  );
}


/* =========================================================
   PROCESS STEP
========================================================= */

function ProcessStep({
  number,
  icon,
  title,
  description,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group flex gap-5 p-5 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-emerald-400/20 transition">

      <div className="w-12 h-12 shrink-0 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">

        {icon}

      </div>


      <div className="flex-1">

        <div className="flex items-center gap-3">

          <span className="text-xs text-emerald-400">
            {number}
          </span>

          <h3 className="font-semibold">
            {title}
          </h3>

        </div>


        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          {description}
        </p>

      </div>

    </div>
  );
}


/* =========================================================
   FOOD PAGE
========================================================= */

function Food() {
  return (
    <Placeholder
      icon={<Utensils />}
      title="Nutrition"
      description="Diabetes-friendly food information and nutrition guidance will appear here."
    />
  );
}


/* =========================================================
   HOSPITAL PAGE
========================================================= */

function Hospitals() {
  return (
    <Placeholder
      icon={<Stethoscope />}
      title="Nearby Healthcare"
      description="Healthcare facilities near the patient's locality will appear here."
    />
  );
}


/* =========================================================
   PLACEHOLDER
========================================================= */

function Placeholder({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Layout>

      <main className="min-h-screen pt-32 px-6">

        <div className="max-w-3xl mx-auto text-center py-24">

          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">

            {icon}

          </div>


          <h1 className="text-4xl md:text-5xl font-bold mt-7">
            {title}
          </h1>


          <p className="text-slate-400 mt-5 leading-relaxed">
            {description}
          </p>

        </div>

      </main>

    </Layout>
  );
}


/* =========================================================
   ROUTES
========================================================= */

function App() {
  return (
    <BrowserRouter>

      <Routes>

        <Route
          path="/"
          element={<Home />}
        />

        <Route
          path="/assessment"
          element={<AssessmentPage />}
        />

        <Route
          path="/results"
          element={<ResultsPage />}
        />

        <Route
          path="/education"
          element={<EducationPage />}
        />

        <Route
          path="/food"
          element={<Food />}
        />

        <Route
          path="/hospitals"
          element={<Hospitals />}
        />

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />

      </Routes>

    </BrowserRouter>
  );
}


export default App;