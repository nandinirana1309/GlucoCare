import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  HeartPulse,
  MapPin,
  Pill,
  ShieldAlert,
  Utensils,
} from "lucide-react";

type AssessmentData = {
  name: string;
  age: string;
  gender: string;
  diabetesStatus: string;
  diabetesType: string;
  familyHistory: string;
  otherConditions: string;
  glucose: string;
  hba1c: string;
  height: string;
  weight: string;
  systolic: string;
  diastolic: string;
  symptoms: string[];
  otherSymptoms: string;
  locality: string;
  report: string | null;
};

type ConcernLevel = "Low" | "Moderate" | "High";

export default function Results() {
  const storedData = localStorage.getItem("glucocare-assessment");

  if (!storedData) {
    return <NoAssessment />;
  }

  const data: AssessmentData = JSON.parse(storedData);

  const glucose = Number(data.glucose);
  const hba1c = Number(data.hba1c);
  const height = Number(data.height);
  const weight = Number(data.weight);
  const systolic = Number(data.systolic);
  const diastolic = Number(data.diastolic);

  const bmi =
    height > 0 && weight > 0
      ? weight / Math.pow(height / 100, 2)
      : null;

  const concern = calculateConcern(
    glucose,
    hba1c,
    systolic,
    diastolic,
    data.symptoms.length
  );

  return (
    <main className="min-h-screen bg-[#071512] text-white pt-28 pb-20">

      <div className="max-w-7xl mx-auto px-6">

        {/* HEADER */}

        <div className="max-w-4xl">

          <p className="text-emerald-400 text-sm font-semibold uppercase tracking-widest">
            Assessment Complete
          </p>

          <h1 className="text-4xl md:text-5xl font-bold mt-4">
            Your health overview
          </h1>

          <p className="text-slate-400 mt-4 leading-relaxed">
            Here's a summary based on the information you provided.
            Review the information carefully and discuss concerns with a
            qualified healthcare professional.
          </p>

        </div>


        {/* CONCERN CARD */}

        <section className="mt-10">

          <div
            className={`rounded-3xl border p-7 md:p-9 ${
              concern === "Low"
                ? "border-emerald-400/20 bg-emerald-400/5"
                : concern === "Moderate"
                ? "border-yellow-400/20 bg-yellow-400/5"
                : "border-red-400/20 bg-red-400/5"
            }`}
          >

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-7">

              <div className="flex gap-5">

                <div
                  className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center ${
                    concern === "Low"
                      ? "bg-emerald-400/10 text-emerald-400"
                      : concern === "Moderate"
                      ? "bg-yellow-400/10 text-yellow-400"
                      : "bg-red-400/10 text-red-400"
                  }`}
                >
                  {concern === "Low" ? (
                    <CheckCircle2 size={28} />
                  ) : concern === "Moderate" ? (
                    <AlertTriangle size={28} />
                  ) : (
                    <ShieldAlert size={28} />
                  )}
                </div>

                <div>

                  <p className="text-sm text-slate-500">
                    Overall assessment indicator
                  </p>

                  <h2 className="text-3xl font-bold mt-1">
                    {concern} Concern
                  </h2>

                  <p className="text-sm text-slate-400 mt-2 max-w-2xl">
                    This is an educational indicator generated from the
                    information entered in the assessment. It is not a
                    medical diagnosis.
                  </p>

                </div>

              </div>

              <div className="text-left md:text-right">

                <p className="text-xs text-slate-600">
                  Patient
                </p>

                <p className="font-semibold mt-1">
                  {data.name || "Patient"}
                </p>

              </div>

            </div>

          </div>

        </section>


        {/* HEALTH METRICS */}

        <section className="mt-10">

          <div className="flex items-end justify-between">

            <div>
              <p className="text-emerald-400 text-sm font-semibold uppercase tracking-widest">
                Key indicators
              </p>

              <h2 className="text-2xl font-bold mt-2">
                Health measurements
              </h2>
            </div>

          </div>


          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-6">

            <MetricCard
              icon={<Activity />}
              title="Blood Glucose"
              value={data.glucose || "—"}
              unit="mg/dL"
              status={getGlucoseStatus(glucose)}
            />

            <MetricCard
              icon={<Activity />}
              title="HbA1c"
              value={data.hba1c || "—"}
              unit="%"
              status={getHba1cStatus(hba1c)}
            />

            <MetricCard
              icon={<HeartPulse />}
              title="Blood Pressure"
              value={
                systolic && diastolic
                  ? `${systolic}/${diastolic}`
                  : "—"
              }
              unit="mmHg"
              status={getBPStatus(systolic, diastolic)}
            />

            <MetricCard
              icon={<Activity />}
              title="BMI"
              value={bmi ? bmi.toFixed(1) : "—"}
              unit=""
              status={getBMIStatus(bmi)}
            />

          </div>

        </section>


        {/* TWO COLUMN */}

        <section className="grid lg:grid-cols-2 gap-6 mt-10">

          {/* SYMPTOMS */}

          <div className="rounded-3xl border border-white/10 bg-[#0b1d19] p-7">

            <div className="flex items-center gap-3">

              <div className="w-11 h-11 rounded-xl bg-emerald-400/10 flex items-center justify-center">
                <HeartPulse
                  size={21}
                  className="text-emerald-400"
                />
              </div>

              <div>

                <p className="text-xs text-slate-600 uppercase tracking-widest">
                  Symptoms
                </p>

                <h2 className="text-xl font-bold mt-1">
                  Reported symptoms
                </h2>

              </div>

            </div>


            {data.symptoms.length === 0 &&
            !data.otherSymptoms ? (
              <div className="mt-7 p-5 rounded-2xl bg-white/[0.03]">

                <p className="text-sm text-slate-500">
                  No symptoms were selected.
                </p>

              </div>
            ) : (
              <div className="flex flex-wrap gap-2 mt-7">

                {data.symptoms.map((symptom) => (
                  <span
                    key={symptom}
                    className="px-3 py-2 rounded-lg bg-emerald-400/10 border border-emerald-400/10 text-emerald-300 text-xs"
                  >
                    {symptom}
                  </span>
                ))}

                {data.otherSymptoms && (
                  <span className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs">
                    {data.otherSymptoms}
                  </span>
                )}

              </div>
            )}

          </div>


          {/* PATIENT INFORMATION */}

          <div className="rounded-3xl border border-white/10 bg-[#0b1d19] p-7">

            <div className="flex items-center gap-3">

              <div className="w-11 h-11 rounded-xl bg-emerald-400/10 flex items-center justify-center">
                <Activity
                  size={21}
                  className="text-emerald-400"
                />
              </div>

              <div>

                <p className="text-xs text-slate-600 uppercase tracking-widest">
                  Profile
                </p>

                <h2 className="text-xl font-bold mt-1">
                  Patient information
                </h2>

              </div>

            </div>


            <div className="grid grid-cols-2 gap-5 mt-7">

              <InfoItem
                label="Age"
                value={data.age || "Not provided"}
              />

              <InfoItem
                label="Gender"
                value={data.gender || "Not provided"}
              />

              <InfoItem
                label="Diabetes"
                value={data.diabetesStatus || "Not provided"}
              />

              <InfoItem
                label="Diabetes Type"
                value={data.diabetesType || "—"}
              />

              <InfoItem
                label="Family History"
                value={data.familyHistory || "Not provided"}
              />

              <InfoItem
                label="Locality"
                value={data.locality || "Not provided"}
              />

            </div>

          </div>

        </section>


        {/* RECOMMENDATIONS */}

        <section className="mt-10">

          <div>

            <p className="text-emerald-400 text-sm font-semibold uppercase tracking-widest">
              General guidance
            </p>

            <h2 className="text-2xl font-bold mt-2">
              Recommendations
            </h2>

            <p className="text-sm text-slate-500 mt-2">
              General educational suggestions based on the information
              provided.
            </p>

          </div>


          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">

            <Recommendation
              icon={<Activity />}
              title="Monitor your health"
              description="Keep track of relevant glucose measurements and follow the monitoring plan recommended by your healthcare professional."
            />

            <Recommendation
              icon={<Utensils />}
              title="Focus on balanced nutrition"
              description="Prefer balanced meals with vegetables, whole grains, appropriate protein and sensible portions."
            />

            <Recommendation
              icon={<HeartPulse />}
              title="Stay physically active"
              description="Regular physical activity can support overall health. Choose activities appropriate for your condition."
            />

            <Recommendation
              icon={<Pill />}
              title="Medication safety"
              description="Do not start, stop or change diabetes medication based only on this assessment. Follow your clinician's instructions."
            />

            <Recommendation
              icon={<ShieldAlert />}
              title="Know when to seek help"
              description="If you experience severe or rapidly worsening symptoms, seek appropriate medical attention promptly."
            />

            <Recommendation
              icon={<FileIcon />}
              title="Keep medical records"
              description="Keep your test results and medical reports organized so they can be discussed with your healthcare professional."
            />

          </div>

        </section>


        {/* HEALTHCARE */}

        <section className="mt-10">

          <div className="rounded-3xl border border-white/10 bg-[#0b1d19] p-7 md:p-9">

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">

              <div className="flex gap-4">

                <div className="w-12 h-12 rounded-xl bg-emerald-400/10 flex items-center justify-center shrink-0">
                  <MapPin
                    className="text-emerald-400"
                    size={23}
                  />
                </div>

                <div>

                  <p className="text-xs text-slate-600 uppercase tracking-widest">
                    Healthcare
                  </p>

                  <h2 className="text-xl font-bold mt-1">
                    Find healthcare near you
                  </h2>

                  <p className="text-sm text-slate-500 mt-2">
                    {data.locality
                      ? `Healthcare search will be available for ${data.locality}.`
                      : "Add your locality in the assessment to find nearby healthcare facilities."}
                  </p>

                </div>

              </div>

              <a
                href="/hospitals"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/10 text-sm font-semibold hover:bg-white/5 transition"
              >
                Explore Healthcare
                <ArrowRight size={16} />
              </a>

            </div>

          </div>

        </section>


        {/* MEDICATION DISCLAIMER */}

        <section className="mt-8">

          <div className="rounded-2xl border border-yellow-400/10 bg-yellow-400/[0.03] p-5">

            <div className="flex gap-3">

              <Pill
                className="text-yellow-400 shrink-0"
                size={20}
              />

              <div>

                <p className="text-sm font-semibold">
                  Medication reminder
                </p>

                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  GlucoCare does not prescribe or recommend specific
                  medicines or dosages. Medication decisions should always
                  be made with a qualified healthcare professional.
                </p>

              </div>

            </div>

          </div>

        </section>


        {/* FOOTER NOTE */}

        <div className="text-center mt-12">

          <p className="text-xs text-slate-600 max-w-2xl mx-auto leading-relaxed">
            This assessment is for educational and informational purposes
            only. The indicators shown here are not a diagnosis and should
            not be used to make medical decisions without professional
            guidance.
          </p>

        </div>

      </div>

    </main>
  );
}


/* =========================================================
   CONCERN CALCULATION
========================================================= */

function calculateConcern(
  glucose: number,
  hba1c: number,
  systolic: number,
  diastolic: number,
  symptomCount: number
): ConcernLevel {
  let score = 0;

  if (glucose > 0) {
    if (glucose >= 200) score += 3;
    else if (glucose >= 126) score += 2;
    else if (glucose >= 100) score += 1;
  }

  if (hba1c > 0) {
    if (hba1c >= 6.5) score += 3;
    else if (hba1c >= 5.7) score += 1;
  }

  if (systolic > 0 && diastolic > 0) {
    if (systolic >= 140 || diastolic >= 90) score += 2;
    else if (systolic >= 130 || diastolic >= 80) score += 1;
  }

  if (symptomCount >= 4) score += 2;
  else if (symptomCount >= 2) score += 1;

  if (score >= 5) return "High";
  if (score >= 2) return "Moderate";

  return "Low";
}


/* =========================================================
   STATUS HELPERS
========================================================= */

function getGlucoseStatus(value: number) {
  if (!value) return "Not provided";
  if (value >= 200) return "High";
  if (value >= 126) return "Elevated";
  if (value >= 100) return "Borderline";
  return "Within reference range";
}

function getHba1cStatus(value: number) {
  if (!value) return "Not provided";
  if (value >= 6.5) return "Elevated";
  if (value >= 5.7) return "Borderline";
  return "Within reference range";
}

function getBPStatus(systolic: number, diastolic: number) {
  if (!systolic || !diastolic) return "Not provided";
  if (systolic >= 140 || diastolic >= 90) return "Elevated";
  if (systolic >= 130 || diastolic >= 80) return "Borderline";
  return "Within reference range";
}

function getBMIStatus(bmi: number | null) {
  if (!bmi) return "Not provided";
  if (bmi < 18.5) return "Below reference";
  if (bmi >= 25) return "Above reference";
  return "Within reference range";
}


/* =========================================================
   COMPONENTS
========================================================= */

function MetricCard({
  icon,
  title,
  value,
  unit,
  status,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  unit: string;
  status: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b1d19] p-6">

      <div className="flex items-center gap-3">

        <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">
          {icon}
        </div>

        <span className="text-sm text-slate-500">
          {title}
        </span>

      </div>

      <div className="mt-6">

        <span className="text-3xl font-bold">
          {value}
        </span>

        <span className="text-xs text-slate-600 ml-1">
          {unit}
        </span>

      </div>

      <p className="text-xs text-slate-500 mt-3">
        {status}
      </p>

    </div>
  );
}


function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>

      <p className="text-xs text-slate-600">
        {label}
      </p>

      <p className="text-sm text-slate-300 mt-1">
        {value}
      </p>

    </div>
  );
}


function Recommendation({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b1d19] p-6">

      <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">
        {icon}
      </div>

      <h3 className="font-semibold mt-5">
        {title}
      </h3>

      <p className="text-sm text-slate-500 leading-relaxed mt-2">
        {description}
      </p>

    </div>
  );
}


function FileIcon() {
  return <FileTextIcon />;
}

function FileTextIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  );
}


/* =========================================================
   NO ASSESSMENT
========================================================= */

function NoAssessment() {
  return (
    <main className="min-h-screen bg-[#071512] text-white pt-32 px-6">

      <div className="max-w-xl mx-auto text-center py-24">

        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-400/10 flex items-center justify-center">
          <Activity
            className="text-emerald-400"
            size={28}
          />
        </div>

        <h1 className="text-4xl font-bold mt-7">
          No assessment found
        </h1>

        <p className="text-slate-500 mt-4">
          Complete the diabetes health assessment first to view your
          results.
        </p>

        <a
          href="/assessment"
          className="inline-flex items-center gap-2 mt-8 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold"
        >
          Start Assessment
          <ArrowRight size={17} />
        </a>

      </div>

    </main>
  );
}