import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  HeartPulse,
  MapPin,
  Salad,
  Upload,
  User,
} from "lucide-react";

import { useAssessment } from "../hooks/useAssessment";
import type { AssessmentData } from "../types/assessment";
import { DIABETES_SYMPTOMS, WARNING_SIGNS } from "../data/symptoms";
import { GLUCOSE_CONTEXT_LABELS } from "../data/glucoseContext";
import { validateField } from "../lib/validation";
import type { ValidatableField } from "../lib/validation";
import { calculateBMI, bmiCategory } from "../lib/bmi";
import { evaluateSafety } from "../lib/safety";
import { todayISO, validateRecordDate } from "../lib/healthRecords";
import { useHealthHistory } from "../hooks/useHealthHistory";
import { describeRepositoryError } from "../services/health";
import Disclaimer from "../components/ui/Disclaimer";
import EmergencyBanner from "../components/ui/EmergencyBanner";

const STEPS = [
  { number: 1, title: "Patient Information", icon: User },
  { number: 2, title: "Medical History", icon: HeartPulse },
  { number: 3, title: "Health Measurements", icon: Activity },
  { number: 4, title: "Lifestyle", icon: Salad },
  { number: 5, title: "Location & Report", icon: MapPin },
] as const;

const VALIDATABLE_FIELDS = new Set<keyof AssessmentData>([
  "age",
  "glucose",
  "hba1c",
  "height",
  "weight",
  "systolic",
  "diastolic",
  "sleepHours",
]);

/** Which validatable fields belong to which step - used to block "Continue". */
const STEP_FIELDS: Record<number, ValidatableField[]> = {
  1: ["age"],
  2: [],
  3: ["glucose", "hba1c", "height", "weight", "systolic", "diastolic"],
  4: ["sleepHours"],
  5: [],
};

export default function Assessment() {
  const navigate = useNavigate();
  const { data, update, draftId, startNewDraft, hasStarted } = useAssessment();
  const history = useHealthHistory();

  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState("");
  const dateError = validateRecordDate(data.assessedOn);

  const setField = (field: keyof AssessmentData, value: string) => {
    update({ [field]: value } as Partial<AssessmentData>);
    if (VALIDATABLE_FIELDS.has(field)) {
      const message = validateField(field as ValidatableField, value);
      setErrors((prev) => ({ ...prev, [field]: message }));
    }
  };

  const toggleInArray = (field: "symptoms" | "warningSigns", value: string) => {
    const current = data[field];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    update({ [field]: next } as Partial<AssessmentData>);
  };

  const stepHasErrors = useMemo(() => {
    return STEP_FIELDS[step].some((field) => validateField(field, data[field] ?? ""));
  }, [step, data]);

  const goNext = () => {
    if (stepHasErrors) return;
    if (step < STEPS.length) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const goBack = () => {
    if (step > 1) {
      setStep(step - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  /**
   * Saves the draft to history as a NEW immutable snapshot (idempotent on
   * draftId, so a double click cannot create two), then starts a fresh draft.
   * On failure the draft is kept untouched and the user can retry.
   */
  const finish = async () => {
    // Synchronous guard: React state updates are async, so a fast double
    // click could otherwise run finish() twice - the second time AFTER the
    // first save had already started a new draft (saving an extra record).
    if (savingRef.current) return;
    if (!hasStarted) {
      setSaveError("Nothing has been entered yet. Add at least one answer before completing the assessment.");
      return;
    }
    if (dateError) {
      setSaveError(dateError);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const stored = await history.saveAssessment(data, draftId);
      startNewDraft();
      navigate(`/results/${stored.id}`);
      // stay locked: this page is leaving, no further completes allowed
    } catch (error) {
      setSaveError(
        `${describeRepositoryError(error)} Your answers are still here - you can try again.`,
      );
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen pt-24 pb-16">
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
            Provide the information below to create your health assessment. Every
            measurement is optional - you can skip anything you do not have.
          </p>
        </div>

        {/* PROGRESS */}
        <div className="mt-12">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            {STEPS.map((item, index) => {
              const Icon = item.icon;
              const completed = step > item.number;
              const active = step === item.number;

              return (
                <div key={item.number} className="flex items-center flex-1">
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
                      {completed ? <Check size={19} /> : <Icon size={19} />}
                    </div>

                    <span
                      className={`hidden sm:block text-xs mt-2 text-center ${
                        active || completed ? "text-white" : "text-slate-600"
                      }`}
                    >
                      {item.title}
                    </span>
                  </div>

                  {index < STEPS.length - 1 && (
                    <div
                      className={`h-px flex-1 mx-3 ${
                        step > item.number ? "bg-emerald-400" : "bg-white/10"
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
              <StepPatient data={data} setField={setField} errors={errors} />
            )}
            {step === 2 && <StepHistory data={data} setField={setField} />}
            {step === 3 && (
              <StepMeasurements
                data={data}
                setField={setField}
                errors={errors}
                toggleInArray={toggleInArray}
              />
            )}
            {step === 4 && <StepLifestyle data={data} setField={setField} errors={errors} />}
            {step === 5 && (
              <StepLocationReport data={data} setField={setField} />
            )}

            {/* BUTTONS */}
            <div className="flex items-center justify-between mt-10 pt-7 border-t border-white/10">
              {step > 1 ? (
                <button
                  onClick={goBack}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 transition"
                >
                  <ArrowLeft size={17} />
                  Back
                </button>
              ) : (
                <div />
              )}

              {step < STEPS.length ? (
                <button
                  onClick={goNext}
                  disabled={stepHasErrors}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue
                  <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  onClick={finish}
                  disabled={saving || Boolean(dateError)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Complete Assessment"}
                  <Check size={17} />
                </button>
              )}
            </div>
            {saveError && (
              <p role="alert" className="text-sm text-red-400 mt-4 text-right">
                {saveError}
              </p>
            )}
            {step === STEPS.length && !saveError && (
              <p className="text-xs text-slate-600 mt-4 text-right">
                {history.mode === "supabase"
                  ? "Completing saves this assessment to your secure GlucoCare history."
                  : "Completing saves this assessment to the history on this device."}
              </p>
            )}
          </div>
        </div>

        <Disclaimer className="mt-7" />
      </div>
    </main>
  );
}

/* ================================================================== */
/*  STEP 1 - PATIENT INFORMATION                                        */
/* ================================================================== */

type StepProps = {
  data: AssessmentData;
  setField: (field: keyof AssessmentData, value: string) => void;
  errors?: Partial<Record<string, string>>;
};

function StepPatient({ data, setField, errors }: StepProps) {
  return (
    <div>
      <SectionHeader
        icon={<User />}
        eyebrow="Step 01"
        title="Patient Information"
        description="Basic information helps us organise your assessment. Your name is optional."
      />

      <div className="grid md:grid-cols-2 gap-5 mt-8">
        <Input
          label="Full Name (optional)"
          placeholder="Enter your name"
          value={data.name}
          onChange={(v) => setField("name", v)}
        />
        <Input
          label="Age"
          type="number"
          placeholder="e.g. 21"
          value={data.age}
          onChange={(v) => setField("age", v)}
          error={errors?.age}
        />
        <Select
          label="Gender"
          value={data.gender}
          onChange={(v) => setField("gender", v)}
          options={["Female", "Male", "Other", "Prefer not to say"]}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  STEP 2 - MEDICAL HISTORY                                            */
/* ================================================================== */

function StepHistory({ data, setField }: StepProps) {
  return (
    <div>
      <SectionHeader
        icon={<HeartPulse />}
        eyebrow="Step 02"
        title="Medical History"
        description="Tell us about your diabetes history and any relevant conditions."
      />

      <div className="space-y-7 mt-8">
        <RadioGroup
          label="Have you been diagnosed with diabetes?"
          value={data.diabetesStatus}
          onChange={(v) => setField("diabetesStatus", v)}
          options={["Yes", "No", "Not sure"]}
        />

        {data.diabetesStatus === "Yes" && (
          <Select
            label="Diabetes Type"
            value={data.diabetesType}
            onChange={(v) => setField("diabetesType", v)}
            options={["Type 1", "Type 2", "Gestational", "Other", "Not sure"]}
          />
        )}

        <RadioGroup
          label="Family history of diabetes?"
          value={data.familyHistory}
          onChange={(v) => setField("familyHistory", v)}
          options={["Yes", "No", "Not sure"]}
        />

        <TextArea
          label="Other medical conditions (optional)"
          placeholder="Enter any relevant conditions..."
          value={data.otherConditions}
          onChange={(v) => setField("otherConditions", v)}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  STEP 3 - HEALTH MEASUREMENTS                                        */
/* ================================================================== */

function StepMeasurements({
  data,
  setField,
  errors,
  toggleInArray,
}: StepProps & {
  toggleInArray: (field: "symptoms" | "warningSigns", value: string) => void;
}) {
  const bmi = calculateBMI(data.height, data.weight);
  const warningSignTriggers = evaluateSafety(data).triggers.filter(
    (t) => t.category === "warning-sign",
  );

  return (
    <div>
      <SectionHeader
        icon={<Activity />}
        eyebrow="Step 03"
        title="Health Measurements"
        description="Enter what you have available. Leave anything you do not know blank."
      />

      <div className="mt-8">
        <p className="text-sm font-semibold text-white mb-4">Blood glucose</p>
        <div className="grid md:grid-cols-2 gap-5">
          <Input
            label="Blood Glucose"
            placeholder="e.g. 120"
            type="number"
            value={data.glucose}
            onChange={(v) => setField("glucose", v)}
            suffix="mg/dL"
            error={errors?.glucose}
          />
          <Input
            label="HbA1c"
            placeholder="e.g. 6.2"
            type="number"
            value={data.hba1c}
            onChange={(v) => setField("hba1c", v)}
            suffix="%"
            error={errors?.hba1c}
          />
          {data.glucose.trim() !== "" && (
            <div className="md:col-span-2">
              <Select
                label="When was this glucose reading taken? (optional)"
                value={data.glucoseContext}
                onChange={(v) => setField("glucoseContext", v)}
                options={["fasting", "random", "post_meal", "unknown"]}
                optionLabels={GLUCOSE_CONTEXT_LABELS}
              />
              <p className="text-xs text-slate-600 mt-2">
                Used to keep fasting and non-fasting readings apart in your
                history. It does not change the assessment.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <p className="text-sm font-semibold text-white mb-4">Body measurements</p>
        <div className="grid md:grid-cols-2 gap-5">
          <Input
            label="Height"
            placeholder="e.g. 170"
            type="number"
            value={data.height}
            onChange={(v) => setField("height", v)}
            suffix="cm"
            error={errors?.height}
          />
          <Input
            label="Weight"
            placeholder="e.g. 65"
            type="number"
            value={data.weight}
            onChange={(v) => setField("weight", v)}
            suffix="kg"
            error={errors?.weight}
          />
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <span className="text-sm text-slate-400">Calculated BMI</span>
          <span className="text-sm font-semibold text-white">
            {bmi !== null ? `${bmi.toFixed(1)} - ${bmiCategory(bmi)}` : "Enter height and weight"}
          </span>
        </div>
      </div>

      <div className="mt-8">
        <p className="text-sm font-semibold text-white mb-4">Blood pressure</p>
        <div className="grid md:grid-cols-2 gap-5">
          <Input
            label="Systolic"
            placeholder="e.g. 120"
            type="number"
            value={data.systolic}
            onChange={(v) => setField("systolic", v)}
            suffix="mmHg"
            error={errors?.systolic}
          />
          <Input
            label="Diastolic"
            placeholder="e.g. 80"
            type="number"
            value={data.diastolic}
            onChange={(v) => setField("diastolic", v)}
            suffix="mmHg"
            error={errors?.diastolic}
          />
        </div>
      </div>

      {/* SYMPTOMS */}
      <div className="mt-10">
        <p className="text-sm font-semibold text-white">Current symptoms</p>
        <p className="text-xs text-slate-500 mt-1">
          Select anything you have experienced recently.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mt-5" role="group" aria-label="Current symptoms">
          {DIABETES_SYMPTOMS.map((symptom) => (
            <CheckButton
              key={symptom}
              label={symptom}
              selected={data.symptoms.includes(symptom)}
              onClick={() => toggleInArray("symptoms", symptom)}
            />
          ))}
        </div>

        <div className="mt-4">
          <TextArea
            label="Other symptoms (optional)"
            placeholder="Describe any other symptoms..."
            value={data.otherSymptoms}
            onChange={(v) => setField("otherSymptoms", v)}
          />
        </div>
      </div>

      {/* WARNING SIGNS */}
      <div className="mt-10">
        <p className="text-sm font-semibold text-red-300">Serious warning signs</p>
        <p className="text-xs text-slate-500 mt-1">
          Tick any that apply now. If you select any of these, GlucoCare will
          advise you to seek medical care - it does not decide what they mean.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mt-5" role="group" aria-label="Serious warning signs">
          {WARNING_SIGNS.map((sign) => (
            <CheckButton
              key={sign}
              label={sign}
              tone="danger"
              selected={data.warningSigns.includes(sign)}
              onClick={() => toggleInArray("warningSigns", sign)}
            />
          ))}
        </div>

        {/* Immediate feedback. Uses the same safety evaluation as Results -
            no separate rule here. Only the warning-sign rule is shown live:
            glucose/BP values would flash warnings while being typed
            (e.g. "45" on the way to "450"), so those appear on Results. */}
        {warningSignTriggers.length > 0 && (
          <div className="mt-5">
            <EmergencyBanner triggers={warningSignTriggers} live />
            <p className="text-xs text-slate-500 mt-2">
              You can still continue the assessment. This warning will also
              appear at the top of your results.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  STEP 4 - LIFESTYLE                                                  */
/* ================================================================== */

function StepLifestyle({ data, setField, errors }: StepProps) {
  return (
    <div>
      <SectionHeader
        icon={<Salad />}
        eyebrow="Step 04"
        title="Lifestyle"
        description="Lifestyle factors are part of diabetes risk and management. All optional."
      />

      <div className="space-y-7 mt-8">
        <RadioGroup
          label="How active are you day to day?"
          value={data.activityLevel}
          onChange={(v) => setField("activityLevel", v)}
          options={["Sedentary", "Lightly active", "Moderately active", "Very active"]}
        />

        <RadioGroup
          label="Do you smoke?"
          value={data.smoking}
          onChange={(v) => setField("smoking", v)}
          options={["No", "Former smoker", "Yes"]}
        />

        <RadioGroup
          label="Which best describes your usual eating pattern?"
          value={data.dietPattern}
          onChange={(v) => setField("dietPattern", v)}
          options={[
            "Generally balanced",
            "Often high in sugary food or drinks",
            "Irregular / skipped meals",
            "Not sure",
          ]}
        />

        <Input
          label="Average sleep per night (optional)"
          type="number"
          placeholder="e.g. 7"
          value={data.sleepHours}
          onChange={(v) => setField("sleepHours", v)}
          suffix="hours"
          error={errors?.sleepHours}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  STEP 5 - LOCATION & REPORT                                          */
/* ================================================================== */

function StepLocationReport({ data, setField }: StepProps) {
  return (
    <div>
      <SectionHeader
        icon={<MapPin />}
        eyebrow="Step 05"
        title="Location & Medical Report"
        description="Your locality is used later to find nearby healthcare facilities."
      />

      <div className="mt-8">
        <Input
          label="Date of these measurements"
          type="date"
          value={data.assessedOn || todayISO()}
          onChange={(v) => setField("assessedOn", v)}
          error={validateRecordDate(data.assessedOn)}
        />
        <p className="text-xs text-slate-600 mt-2">
          Defaults to today. Choose an earlier date if you are recording older
          readings, so your history stays in the right order.
        </p>
      </div>

      <div className="mt-8">
        <Input
          label="City / Locality"
          placeholder="e.g. Vellore, Tamil Nadu"
          value={data.locality}
          onChange={(v) => setField("locality", v)}
        />
        <p className="text-xs text-slate-600 mt-2">
          Used on the Healthcare page to search for nearby hospitals and clinics.
        </p>
      </div>

      {/* MEDICAL REPORT (Phase 8): reports are read and reviewed on their own
          page, so verified report values go to history with their own date. */}
      <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex gap-3">
          <FileText className="text-emerald-400 shrink-0" size={20} />
          <div>
            <p className="text-sm font-semibold text-white">
              Medical report
              <span className="text-slate-600 font-normal ml-2">Optional</span>
            </p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Add a lab report to your health history. GlucoCare reads the values in
              your browser and you check each one before it is saved. You can do
              this before or after completing this assessment.
            </p>
            <Link
              to="/reports/new"
              className="inline-flex items-center gap-1.5 mt-3 text-sm text-emerald-400 hover:text-emerald-300 transition"
            >
              <Upload size={15} /> Add a medical report
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-7 p-4 rounded-xl bg-white/[0.02] border border-white/5">
        <div className="flex gap-3">
          <FileText className="text-slate-500 shrink-0" size={18} />
          <p className="text-xs text-slate-500 leading-relaxed">
            Completing the assessment adds it to your health history. Your name
            and locality stay on this device and are never added to your
            history. The report file itself is not uploaded anywhere.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  REUSABLE FORM CONTROLS                                              */
/* ================================================================== */

function SectionHeader({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: ReactNode;
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
      <h2 className="text-2xl md:text-3xl font-bold mt-5">{title}</h2>
      <p className="text-sm text-slate-500 mt-2">{description}</p>
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
  error,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  suffix?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="relative mt-2">
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`w-full bg-white/[0.03] border rounded-xl px-4 py-3.5 text-white placeholder:text-slate-700 outline-none transition ${
            error
              ? "border-red-400/50 focus:border-red-400"
              : "border-white/10 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
          } ${suffix ? "pr-20" : ""}`}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-600">
            {suffix}
          </span>
        )}
      </div>
      {error && <span className="text-xs text-red-400 mt-1 block">{error}</span>}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  optionLabels,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  /** Optional display text per option value (value is shown otherwise). */
  optionLabels?: Record<string, string>;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full mt-2 bg-[#10241f] border border-white/10 rounded-xl px-4 py-3.5 text-white outline-none focus:border-emerald-400/50 transition"
      >
        <option value="">Select an option</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? option}
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
    <div role="group" aria-label={label}>
      <p className="text-sm text-slate-300 mb-3">{label}</p>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => {
          const selected = value === option;
          return (
            <button
              type="button"
              key={option}
              onClick={() => onChange(option)}
              aria-pressed={selected}
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
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-300">{label}</span>
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

function CheckButton({
  label,
  selected,
  onClick,
  tone = "emerald",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  tone?: "emerald" | "danger";
}) {
  const selectedClasses =
    tone === "danger"
      ? "border-red-400/40 bg-red-400/10 text-red-200"
      : "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
  const boxClasses =
    tone === "danger"
      ? "bg-red-400 border-red-400 text-[#071512]"
      : "bg-emerald-400 border-emerald-400 text-[#071512]";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`text-left p-4 rounded-xl border transition ${
        selected
          ? selectedClasses
          : "border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-5 h-5 rounded-md border flex items-center justify-center ${
            selected ? boxClasses : "border-white/20"
          }`}
        >
          {selected && <Check size={13} />}
        </div>
        <span className="text-sm">{label}</span>
      </div>
    </button>
  );
}
