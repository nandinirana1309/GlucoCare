import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  HeartPulse,
  Info,
  ShieldCheck,
  Utensils,
} from "lucide-react";

const diabetesTypes = [
  {
    title: "Type 1 Diabetes",
    description:
      "A condition in which the immune system attacks insulin-producing cells in the pancreas. People with Type 1 diabetes require insulin to manage blood glucose.",
    points: [
      "Often develops at a younger age",
      "Requires insulin treatment",
      "Needs regular glucose monitoring",
    ],
  },
  {
    title: "Type 2 Diabetes",
    description:
      "The most common form of diabetes. The body becomes resistant to insulin or does not produce enough insulin to maintain healthy blood glucose levels.",
    points: [
      "More common in adults",
      "Lifestyle and genetics can contribute",
      "Management may include lifestyle changes and medication",
    ],
  },
  {
    title: "Gestational Diabetes",
    description:
      "Diabetes that develops during pregnancy. It usually requires careful monitoring and management during pregnancy.",
    points: [
      "Occurs during pregnancy",
      "Usually monitored during pregnancy",
      "Can increase future risk of Type 2 diabetes",
    ],
  },
];

const symptoms = [
  "Increased thirst",
  "Frequent urination",
  "Increased hunger",
  "Unexplained weight changes",
  "Fatigue",
  "Blurred vision",
  "Slow-healing wounds",
  "Tingling or numbness",
];

const lifestyleTips = [
  {
    icon: <Utensils />,
    title: "Balanced Nutrition",
    text: "Choose balanced meals with vegetables, whole grains, appropriate protein and sensible portions.",
  },
  {
    icon: <Activity />,
    title: "Regular Activity",
    text: "Regular physical activity can support cardiovascular health and healthy glucose management.",
  },
  {
    icon: <HeartPulse />,
    title: "Monitor Health",
    text: "Keep track of measurements recommended by your healthcare professional.",
  },
  {
    icon: <ShieldCheck />,
    title: "Regular Checkups",
    text: "Routine healthcare visits can help identify changes early and support long-term health.",
  },
];

export default function Education() {
  return (
    <main className="min-h-screen bg-[#071512] text-white pt-28 pb-20">

      <div className="max-w-7xl mx-auto px-6">

        {/* HERO */}

        <section className="max-w-4xl mx-auto text-center pt-10">

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 text-emerald-400 text-sm">
            <Info size={16} />
            Diabetes Education
          </div>

          <h1 className="text-4xl md:text-6xl font-bold mt-7 leading-tight">
            Understand diabetes.
            <br />
            <span className="text-emerald-400">
              Take control of your health.
            </span>
          </h1>

          <p className="text-slate-400 mt-6 text-lg leading-relaxed max-w-2xl mx-auto">
            Learn about diabetes, its different types, common symptoms,
            lifestyle factors and ways to support long-term health.
          </p>

        </section>


        {/* WHAT IS DIABETES */}

        <section className="mt-20">

          <div className="grid lg:grid-cols-2 gap-8 items-stretch">

            <div className="rounded-3xl border border-white/10 bg-[#0b1d19] p-8 md:p-10">

              <div className="w-12 h-12 rounded-xl bg-emerald-400/10 flex items-center justify-center">
                <Activity
                  size={24}
                  className="text-emerald-400"
                />
              </div>

              <p className="text-xs text-emerald-400 uppercase tracking-widest font-semibold mt-7">
                The basics
              </p>

              <h2 className="text-3xl font-bold mt-3">
                What is diabetes?
              </h2>

              <p className="text-slate-400 leading-relaxed mt-5">
                Diabetes is a chronic condition that affects how the body
                regulates blood glucose. Glucose is an important source of
                energy for the body.
              </p>

              <p className="text-slate-400 leading-relaxed mt-4">
                Insulin helps glucose move from the bloodstream into cells.
                When the body does not produce enough insulin or cannot use
                insulin effectively, blood glucose levels can rise.
              </p>

              <div className="mt-7 p-5 rounded-2xl bg-emerald-400/[0.04] border border-emerald-400/10">

                <p className="text-sm text-emerald-300 leading-relaxed">
                  Understanding your risk factors, symptoms and health
                  measurements can help you have more informed conversations
                  with your healthcare professional.
                </p>

              </div>

            </div>


            {/* SIMPLE PROCESS */}

            <div className="rounded-3xl border border-white/10 bg-[#0b1d19] p-8 md:p-10">

              <p className="text-xs text-emerald-400 uppercase tracking-widest font-semibold">
                How it works
              </p>

              <h2 className="text-3xl font-bold mt-3">
                Glucose & insulin
              </h2>

              <div className="space-y-5 mt-8">

                <EducationStep
                  number="01"
                  title="Food provides glucose"
                  text="Digested carbohydrates can contribute to the glucose available in the bloodstream."
                />

                <EducationStep
                  number="02"
                  title="Insulin helps cells"
                  text="Insulin helps the body's cells use glucose for energy."
                />

                <EducationStep
                  number="03"
                  title="Diabetes affects regulation"
                  text="Problems with insulin production or insulin action can result in elevated blood glucose."
                />

              </div>

            </div>

          </div>

        </section>


        {/* TYPES */}

        <section className="mt-20">

          <div className="max-w-2xl">

            <p className="text-xs text-emerald-400 uppercase tracking-widest font-semibold">
              Know the differences
            </p>

            <h2 className="text-3xl md:text-4xl font-bold mt-3">
              Types of diabetes
            </h2>

            <p className="text-slate-500 mt-3 leading-relaxed">
              Diabetes is not a single condition. Different types have
              different causes and management approaches.
            </p>

          </div>


          <div className="grid lg:grid-cols-3 gap-5 mt-8">

            {diabetesTypes.map((item) => (
              <div
                key={item.title}
                className="rounded-3xl border border-white/10 bg-[#0b1d19] p-7 hover:border-emerald-400/20 transition"
              >

                <div className="w-11 h-11 rounded-xl bg-emerald-400/10 flex items-center justify-center">
                  <HeartPulse
                    size={21}
                    className="text-emerald-400"
                  />
                </div>

                <h3 className="text-xl font-bold mt-6">
                  {item.title}
                </h3>

                <p className="text-sm text-slate-500 leading-relaxed mt-3">
                  {item.description}
                </p>

                <div className="space-y-3 mt-6">

                  {item.points.map((point) => (
                    <div
                      key={point}
                      className="flex gap-2 items-start"
                    >
                      <CheckCircle2
                        size={16}
                        className="text-emerald-400 shrink-0 mt-0.5"
                      />

                      <span className="text-xs text-slate-400">
                        {point}
                      </span>
                    </div>
                  ))}

                </div>

              </div>
            ))}

          </div>

        </section>


        {/* SYMPTOMS */}

        <section className="mt-20">

          <div className="rounded-3xl border border-white/10 bg-[#0b1d19] p-8 md:p-10">

            <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-10">

              <div>

                <div className="w-12 h-12 rounded-xl bg-yellow-400/10 flex items-center justify-center">
                  <AlertTriangle
                    size={24}
                    className="text-yellow-400"
                  />
                </div>

                <p className="text-xs text-yellow-400 uppercase tracking-widest font-semibold mt-7">
                  Be aware
                </p>

                <h2 className="text-3xl font-bold mt-3">
                  Common symptoms
                </h2>

                <p className="text-slate-500 leading-relaxed mt-4">
                  Some people with diabetes may experience symptoms,
                  while others may have few or no noticeable symptoms.
                </p>

              </div>


              <div className="grid sm:grid-cols-2 gap-3">

                {symptoms.map((symptom) => (
                  <div
                    key={symptom}
                    className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/5"
                  >

                    <div className="w-7 h-7 rounded-lg bg-emerald-400/10 flex items-center justify-center">
                      <CheckCircle2
                        size={15}
                        className="text-emerald-400"
                      />
                    </div>

                    <span className="text-sm text-slate-300">
                      {symptom}
                    </span>

                  </div>
                ))}

              </div>

            </div>

          </div>

        </section>


        {/* LIFESTYLE */}

        <section className="mt-20">

          <div className="text-center max-w-2xl mx-auto">

            <p className="text-xs text-emerald-400 uppercase tracking-widest font-semibold">
              Everyday health
            </p>

            <h2 className="text-3xl md:text-4xl font-bold mt-3">
              Healthy lifestyle habits
            </h2>

            <p className="text-slate-500 mt-3">
              Small, consistent habits can support overall health.
            </p>

          </div>


          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-9">

            {lifestyleTips.map((tip) => (
              <div
                key={tip.title}
                className="rounded-2xl border border-white/10 bg-[#0b1d19] p-6"
              >

                <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">
                  {tip.icon}
                </div>

                <h3 className="font-semibold mt-5">
                  {tip.title}
                </h3>

                <p className="text-sm text-slate-500 leading-relaxed mt-2">
                  {tip.text}
                </p>

              </div>
            ))}

          </div>

        </section>


        {/* WHEN TO GET HELP */}

        <section className="mt-20">

          <div className="rounded-3xl border border-red-400/10 bg-red-400/[0.03] p-8 md:p-10">

            <div className="flex gap-5">

              <div className="w-12 h-12 rounded-xl bg-red-400/10 flex items-center justify-center shrink-0">
                <AlertTriangle
                  className="text-red-400"
                  size={24}
                />
              </div>

              <div>

                <p className="text-xs text-red-400 uppercase tracking-widest font-semibold">
                  Important
                </p>

                <h2 className="text-2xl font-bold mt-2">
                  When should you seek medical help?
                </h2>

                <p className="text-sm text-slate-500 leading-relaxed mt-4 max-w-3xl">
                  If you have concerning, severe or rapidly worsening
                  symptoms, seek appropriate medical attention. If you
                  have questions about your blood glucose, symptoms or
                  treatment, speak with a qualified healthcare professional.
                </p>

              </div>

            </div>

          </div>

        </section>


        {/* CTA */}

        <section className="text-center mt-20">

          <h2 className="text-3xl font-bold">
            Ready to check your health?
          </h2>

          <p className="text-slate-500 mt-3">
            Complete the GlucoCare assessment to review your entered
            health information.
          </p>

          <a
            href="/assessment"
            className="inline-flex items-center gap-2 mt-7 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition"
          >
            Start Assessment
            <ArrowRight size={17} />
          </a>

        </section>


        {/* DISCLAIMER */}

        <p className="text-center text-xs text-slate-600 max-w-3xl mx-auto mt-16 leading-relaxed">
          The information on this page is intended for general educational
          purposes and does not constitute medical advice or a diagnosis.
          Always consult a qualified healthcare professional for personal
          medical guidance.
        </p>

      </div>

    </main>
  );
}


/* =========================================================
   EDUCATION STEP
========================================================= */

function EducationStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4">

      <div className="w-10 h-10 shrink-0 rounded-xl bg-emerald-400/10 text-emerald-400 flex items-center justify-center text-xs font-bold">
        {number}
      </div>

      <div>

        <h3 className="font-semibold">
          {title}
        </h3>

        <p className="text-sm text-slate-500 leading-relaxed mt-1">
          {text}
        </p>

      </div>

    </div>
  );
}