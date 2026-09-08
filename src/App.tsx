import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AssessmentProvider } from "./context/AssessmentProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/layout/Layout";

import Home from "./pages/Home";
import Assessment from "./pages/Assessment";
import Results from "./pages/Results";
import Education from "./pages/Education";
import Nutrition from "./pages/Nutrition";
import Healthcare from "./pages/Healthcare";
import NotFound from "./pages/NotFound";

/**
 * App root.
 *  - ErrorBoundary      -> friendly fallback instead of a blank screen on error
 *  - AssessmentProvider -> one shared assessment state for the whole app
 *  - Layout             -> Navbar + Footer on every page
 *  - Routes             -> which page to show for each URL
 *
 * "/food" and "/hospitals" stay as aliases so older links keep working.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AssessmentProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/assessment" element={<Assessment />} />
              <Route path="/results" element={<Results />} />
              <Route path="/education" element={<Education />} />
              <Route path="/nutrition" element={<Nutrition />} />
              <Route path="/food" element={<Nutrition />} />
              <Route path="/healthcare" element={<Healthcare />} />
              <Route path="/hospitals" element={<Healthcare />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </AssessmentProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
