import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AssessmentProvider } from "./context/AssessmentProvider";
import { HealthHistoryProvider } from "./context/HealthHistoryProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/layout/Layout";

import Home from "./pages/Home";
import Assessment from "./pages/Assessment";
import Results from "./pages/Results";
import Education from "./pages/Education";
import Nutrition from "./pages/Nutrition";
import Healthcare from "./pages/Healthcare";
import NotFound from "./pages/NotFound";

// Loaded on demand: the Journey page carries the charting library.
const Journey = lazy(() => import("./pages/Journey"));
// Loaded on demand: report reading pulls in pdf.js / OCR only when used.
const ReportUpload = lazy(() => import("./pages/ReportUpload"));
const DoctorSummary = lazy(() => import("./pages/DoctorSummary"));
const Scenarios = lazy(() => import("./pages/Scenarios"));

function PageLoading() {
  return (
    <main className="min-h-screen pt-32 px-6">
      <p role="status" className="text-center text-slate-500">Loading...</p>
    </main>
  );
}

/**
 * App root.
 *  - ErrorBoundary      -> friendly fallback instead of a blank screen on error
 *  - HealthHistoryProvider -> saved, immutable health history (Project-II)
 *  - AssessmentProvider -> the current DRAFT assessment
 *  - Layout             -> Navbar + Footer on every page
 *  - Routes             -> which page to show for each URL
 *
 * "/food" and "/hospitals" stay as aliases so older links keep working.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <HealthHistoryProvider>
          <AssessmentProvider>
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/assessment" element={<Assessment />} />
                <Route path="/results" element={<Results />} />
                <Route path="/results/:id" element={<Results />} />
                <Route path="/journey" element={<Suspense fallback={<PageLoading />}><Journey /></Suspense>} />
                <Route path="/reports/new" element={<Suspense fallback={<PageLoading />}><ReportUpload /></Suspense>} />
                <Route path="/journey/summary" element={<Suspense fallback={<PageLoading />}><DoctorSummary /></Suspense>} />
                <Route path="/journey/scenarios" element={<Suspense fallback={<PageLoading />}><Scenarios /></Suspense>} />
                <Route path="/education" element={<Education />} />
                <Route path="/nutrition" element={<Nutrition />} />
                <Route path="/food" element={<Nutrition />} />
                <Route path="/healthcare" element={<Healthcare />} />
                <Route path="/hospitals" element={<Healthcare />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          </AssessmentProvider>
        </HealthHistoryProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
