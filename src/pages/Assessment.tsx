import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  MapPin,
  Upload,
  User,
  Activity,
  HeartPulse,
} from "lucide-react";

type FormData = {
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
  report: File | null;
};

const initialData: FormData = {
  name: "",
  age: "",
  gender: "",
  diabetesStatus: "",
  diabetesType: "",
  familyHistory: "",
  otherConditions: "",
  glucose: "",
  hba1c: "",
  height: "",
  weight: "",
  systolic: "",
  diastolic: "",
  symptoms: [],
  otherSymptoms: "",
  locality: "",
  report: null,
};

const symptomsList = [
  "Excessive thirst",
  "Frequent urination",
  "Increased hunger",
  "Unexplained weight change",
  "Fatigue",
  "Blurred vision",
  "Slow wound healing",
  "Tingling or numbness",
];

const steps = [
  {
    number: 1,
    title: "Patient Information",
    icon: User,
  },
  {
    number: 2,
    title: "Medical History",
    icon: HeartPulse,
  },
  {
    number: 3,
    title: "Health Measurements",
    icon: Activity,
  },
  {
    number: 4,
    title: "Location & Report",
    icon: MapPin,
  },
];

export default function Assessment() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(initialData);

  const updateField = (field: keyof FormData, value: string) => {
    setData((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const toggleSymptom = (symptom: string) => {
    setData((previous) => ({
      ...previous,
      symptoms: previous.symptoms.includes(symptom)
        ? previous.symptoms.filter((item) => item !== symptom)
        : [...previous.symptoms, symptom],
    }));
  };

  const nextStep = () => {
    if (step < 4) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const previousStep = () => {
    if (step > 1) {
      setStep(step - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const submitAssessment = () => {
    localStorage.setItem(
      "glucocare-assessment",
      JSON.stringify({
        ...data,
        report: data.report?.name || null,
      })
    );

    window.location.href = "/results";
  };

  return (
    <main className="min-h-screen bg-[#071512] text-white pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-6">

        {/* HEADER */}

        <div className="text-center max-w-2xl mx-auto pt-8">

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 text-emerald-400 text-sm">
            <Activity size={16} />
            Diabetes Health Assessment
          </div>

          <h1 className="text-4xl md:text-5xl font-bold mt-6">
            Tell us about your
            <span className="text-emerald-400"> health.</span>
          </h1>

          <p className="text-slate-400 mt-4 leading-relaxed">
            Provide the information below to create your health assessment.
            You can skip measurements you do not have available.
          </p>

        </div>


        {/* PROGRESS */}

        <div className="mt-12">

          <div className="flex items-center justify-between max-w-3xl mx-auto">

            {steps.map((item, index) => {
              const Icon = item.icon;
              const completed = step > item.number;
              const active = step === item.number;

              return (
                <div
                  key={item.number}
                  className="flex items-center flex-1"
                >

                  <div className="flex flex-col items-center">

                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center border transition ${
                        completed
                          ? "bg-emerald-400 border-emerald-400 text-[#071512]"
                          : active
                          ? "bg-emerald-400/10 border-emerald-400 text-emerald-400"
                          : "bg-white/5 border-white/10 text-slate-600"
                      }`}
                    >
                      {completed ? (
                        <Check size={19} />
                      ) : (
                        <Icon size={19} />
                      )}
                    </div>

                    <span
                      className={`hidden sm:block text-xs mt-2 text-center ${
                        active || completed
                          ? "text-white"
                          : "text-slate-600"
                      }`}
                    >
                      {item.title}
                    </span>

                  </div>

                  {index < steps.length - 1 && (
                    <div
                      className={`h-px flex-1 mx-3 ${
                        step > item.number
                          ? "bg-emerald-400"
                          : "bg-white/10"
                      }`}
                    />
                  )}

                </div>
              );
            })}

          </div>

        </div>


        {/* FORM CARD */}

        <div className="mt-12 max-w-3xl mx-auto">

          <div className="rounded-3xl border border-white/10 bg-[#0b1d19] p-6 md:p-10">

            {step === 1 && (
              <PatientInformation
                data={data}
                updateField={updateField}
              />
            )}

            {step === 2 && (
              <MedicalHistory
                data={data}
                updateField={updateField}
              />
            )}

            {step === 3 && (
              <HealthMeasurements
                data={data}
                updateField={updateField}
                toggleSymptom={toggleSymptom}
              />
            )}

            {step === 4 && (
              <LocationReport
                data={data}
                updateField={updateField}
                setData={setData}
              />
            )}


            {/* BUTTONS */}

            <div className="flex items-center justify-between mt-10 pt-7 border-t border-white/10">

              {step > 1 ? (
                <button
                  onClick={previousStep}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 transition"
                >
                  <ArrowLeft size={17} />
                  Back
                </button>
              ) : (
                <div />
              )}

              {step < 4 ? (
                <button
                  onClick={nextStep}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition"
                >
                  Continue
                  <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  onClick={submitAssessment}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition"
                >
                  Complete Assessment
                  <Check size={17} />
                </button>
              )}

            </div>

          </div>

        </div>


        {/* DISCLAIMER */}

        <p className="text-center text-xs text-slate-600 max-w-2xl mx-auto mt-7 leading-relaxed">
          GlucoCare is an educational health assessment project and does not
          provide a medical diagnosis or replace advice from a qualified
          healthcare professional.
        </p>

      </div>
    </main>
  );
}


/* =========================================================
   STEP 1 — PATIENT INFORMATION
========================================================= */

function PatientInformation({
  data,
  updateField,
}: {
  data: FormData;
  updateField: (field: keyof FormData, value: string) => void;
}) {
  return (
    <div>

      <SectionHeader
        icon={<User />}
        eyebrow="Step 01"
        title="Patient Information"
        description="Basic information helps us organize your assessment."
      />

      <div className="grid md:grid-cols-2 gap-5 mt-8">

        <Input
          label="Full Name"
          placeholder="Enter your name"
          value={data.name}
          onChange={(value) => updateField("name", value)}
        />

        <Input
          label="Age"
          type="number"
          placeholder="e.g. 21"
          value={data.age}
          onChange={(value) => updateField("age", value)}
        />

        <Select
          label="Gender"
          value={data.gender}
          onChange={(value) => updateField("gender", value)}
          options={[
            "Female",
            "Male",
            "Other",
            "Prefer not to say",
          ]}
        />

      </div>

    </div>
  );
}


/* =========================================================
   STEP 2 — MEDICAL HISTORY
========================================================= */

function MedicalHistory({
  data,
  updateField,
}: {
  data: FormData;
  updateField: (field: keyof FormData, value: string) => void;
}) {
  return (
    <div>

      <SectionHeader
        icon={<HeartPulse />}
        eyebrow="Step 02"
        title="Medical History"
        description="Tell us about your diabetes history and relevant health conditions."
      />

      <div className="space-y-7 mt-8">

        <RadioGroup
          label="Have you been diagnosed with diabetes?"
          value={data.diabetesStatus}
          onChange={(value) => updateField("diabetesStatus", value)}
          options={[
            "Yes",
            "No",
            "Not sure",
          ]}
        />

        {data.diabetesStatus === "Yes" && (
          <Select
            label="Diabetes Type"
            value={data.diabetesType}
            onChange={(value) => updateField("diabetesType", value)}
            options={[
              "Type 1",
              "Type 2",
              "Gestational",
              "Other",
              "Not sure",
            ]}
          />
        )}

        <RadioGroup
          label="Family history of diabetes?"
          value={data.familyHistory}
          onChange={(value) => updateField("familyHistory", value)}
          options={[
            "Yes",
            "No",
            "Not sure",
          ]}
        />

        <TextArea
          label="Other medical conditions"
          placeholder="Enter any relevant conditions..."
          value={data.otherConditions}
          onChange={(value) => updateField("otherConditions", value)}
        />

      </div>

    </div>
  );
}


/* =========================================================
   STEP 3 — HEALTH MEASUREMENTS
========================================================= */

function HealthMeasurements({
  data,
  updateField,
  toggleSymptom,
}: {
  data: FormData;
  updateField: (field: keyof FormData, value: string) => void;
  toggleSymptom: (symptom: string) => void;
}) {
  return (
    <div>

      <SectionHeader
        icon={<Activity />}
        eyebrow="Step 03"
        title="Health Measurements"
        description="Enter available measurements. You can leave anything you don't know blank."
      />


      <div className="mt-8">

        <p className="text-sm font-semibold text-white mb-4">
          Blood glucose
        </p>

        <div className="grid md:grid-cols-2 gap-5">

          <Input
            label="Blood Glucose"
            placeholder="e.g. 120"
            type="number"
            value={data.glucose}
            onChange={(value) => updateField("glucose", value)}
            suffix="mg/dL"
          />

          <Input
            label="HbA1c"
            placeholder="e.g. 6.2"
            type="number"
            value={data.hba1c}
            onChange={(value) => updateField("hba1c", value)}
            suffix="%"
          />

        </div>

      </div>


      <div className="mt-8">

        <p className="text-sm font-semibold text-white mb-4">
          Body measurements
        </p>

        <div className="grid md:grid-cols-2 gap-5">

          <Input
            label="Height"
            placeholder="e.g. 170"
            type="number"
            value={data.height}
            onChange={(value) => updateField("height", value)}
            suffix="cm"
          />

          <Input
            label="Weight"
            placeholder="e.g. 65"
            type="number"
            value={data.weight}
            onChange={(value) => updateField("weight", value)}
            suffix="kg"
          />

        </div>

      </div>


      <div className="mt-8">

        <p className="text-sm font-semibold text-white mb-4">
          Blood pressure
        </p>

        <div className="grid md:grid-cols-2 gap-5">

          <Input
            label="Systolic"
            placeholder="e.g. 120"
            type="number"
            value={data.systolic}
            onChange={(value) => updateField("systolic", value)}
            suffix="mmHg"
          />

          <Input
            label="Diastolic"
            placeholder="e.g. 80"
            type="number"
            value={data.diastolic}
            onChange={(value) => updateField("diastolic", value)}
            suffix="mmHg"
          />

        </div>

      </div>


      {/* SYMPTOMS */}

      <div className="mt-10">

        <p className="text-sm font-semibold text-white">
          Current symptoms
        </p>

        <p className="text-xs text-slate-500 mt-1">
          Select anything you have experienced recently.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mt-5">

          {symptomsList.map((symptom) => {

            const selected = data.symptoms.includes(symptom);

            return (
              <button
                key={symptom}
                type="button"
                onClick={() => toggleSymptom(symptom)}
                className={`text-left p-4 rounded-xl border transition ${
                  selected
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                    : "border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05]"
                }`}
              >

                <div className="flex items-center gap-3">

                  <div
                    className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                      selected
                        ? "bg-emerald-400 border-emerald-400 text-[#071512]"
                        : "border-white/20"
                    }`}
                  >
                    {selected && <Check size={13} />}
                  </div>

                  <span className="text-sm">
                    {symptom}
                  </span>

                </div>

              </button>
            );
          })}

        </div>


        <div className="mt-4">

          <TextArea
            label="Other symptoms"
            placeholder="Describe any other symptoms..."
            value={data.otherSymptoms}
            onChange={(value) => updateField("otherSymptoms", value)}
          />

        </div>

      </div>

    </div>
  );
}


/* =========================================================
   STEP 4 — LOCATION + REPORT
========================================================= */

function LocationReport({
  data,
  updateField,
  setData,
}: {
  data: FormData;
  updateField: (field: keyof FormData, value: string) => void;
  setData: React.Dispatch<React.SetStateAction<FormData>>;
}) {
  return (
    <div>

      <SectionHeader
        icon={<MapPin />}
        eyebrow="Step 04"
        title="Location & Medical Report"
        description="Your locality can later be used to find nearby healthcare facilities."
      />


      <div className="mt-8">

        <Input
          label="City / Locality"
          placeholder="e.g. Vellore, Tamil Nadu"
          value={data.locality}
          onChange={(value) => updateField("locality", value)}
        />

        <p className="text-xs text-slate-600 mt-2">
          This will be used later for the nearby healthcare feature.
        </p>

      </div>


      {/* REPORT UPLOAD */}

      <div className="mt-10">

        <p className="text-sm font-semibold text-white">
          Medical report
          <span className="text-slate-600 font-normal ml-2">
            Optional
          </span>
        </p>

        <p className="text-xs text-slate-500 mt-1">
          Upload a PDF or image of a relevant medical report.
        </p>


        <label className="block mt-5 cursor-pointer">

          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;

              setData((previous) => ({
                ...previous,
                report: file,
              }));
            }}
          />

          <div className="border-2 border-dashed border-white/10 rounded-2xl p-8 text-center hover:border-emerald-400/30 hover:bg-emerald-400/[0.02] transition">

            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-400/10 flex items-center justify-center">
              {data.report ? (
                <FileText
                  className="text-emerald-400"
                  size={25}
                />
              ) : (
                <Upload
                  className="text-emerald-400"
                  size={25}
                />
              )}
            </div>


            {data.report ? (
              <>
                <p className="text-sm font-semibold mt-4">
                  {data.report.name}
                </p>

                <p className="text-xs text-emerald-400 mt-2">
                  Report selected
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold mt-4">
                  Upload your medical report
                </p>

                <p className="text-xs text-slate-600 mt-2">
                  PDF, JPG or PNG
                </p>
              </>
            )}

          </div>

        </label>

      </div>


      {/* PRIVACY */}

      <div className="mt-7 p-4 rounded-xl bg-white/[0.02] border border-white/5">

        <div className="flex gap-3">

          <FileText
            className="text-slate-500 shrink-0"
            size={18}
          />

          <p className="text-xs text-slate-500 leading-relaxed">
            In the current prototype, your assessment information is stored
            locally in your browser. A secure database will be connected in a
            later stage of development.
          </p>

        </div>

      </div>

    </div>
  );
}


/* =========================================================
   REUSABLE COMPONENTS
========================================================= */

function SectionHeader({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>

      <div className="flex items-center gap-3">

        <div className="w-11 h-11 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">
          {icon}
        </div>

        <span className="text-xs text-emerald-400 uppercase tracking-widest font-semibold">
          {eyebrow}
        </span>

      </div>

      <h2 className="text-2xl md:text-3xl font-bold mt-5">
        {title}
      </h2>

      <p className="text-sm text-slate-500 mt-2">
        {description}
      </p>

    </div>
  );
}


function Input({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  suffix,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  suffix?: string;
}) {
  return (
    <label className="block">

      <span className="text-sm text-slate-300">
        {label}
      </span>

      <div className="relative mt-2">

        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-slate-700 outline-none focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10 transition ${
            suffix ? "pr-20" : ""
          }`}
        />

        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-600">
            {suffix}
          </span>
        )}

      </div>

    </label>
  );
}


function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">

      <span className="text-sm text-slate-300">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full mt-2 bg-[#10241f] border border-white/10 rounded-xl px-4 py-3.5 text-white outline-none focus:border-emerald-400/50 transition"
      >

        <option value="">
          Select an option
        </option>

        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}

      </select>

    </label>
  );
}


function RadioGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div>

      <p className="text-sm text-slate-300 mb-3">
        {label}
      </p>

      <div className="flex flex-wrap gap-3">

        {options.map((option) => {

          const selected = value === option;

          return (
            <button
              type="button"
              key={option}
              onClick={() => onChange(option)}
              className={`px-5 py-3 rounded-xl border text-sm transition ${
                selected
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                  : "border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05]"
              }`}
            >
              {option}
            </button>
          );
        })}

      </div>

    </div>
  );
}


function TextArea({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">

      <span className="text-sm text-slate-300">
        {label}
      </span>

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full mt-2 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-slate-700 outline-none resize-none focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10 transition"
      />

    </label>
  );
}