import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Droplets,
  Minus,
  Salad,
  Utensils,
} from "lucide-react";

import {
  CHOOSE_OFTEN,
  LIMIT,
  CONCEPTS,
  HEALTHY_SNACKS,
} from "../data/nutrition";
import Section from "../components/ui/Section";
import Card from "../components/ui/Card";
import Disclaimer from "../components/ui/Disclaimer";

export default function Nutrition() {
  return (
    <main className="min-h-screen pt-28 pb-20">
      <div className="max-w-7xl mx-auto px-6">

        {/* HERO */}
        <section className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 text-emerald-400 text-sm">
            <Salad size={16} />
            Nutrition &amp; Lifestyle
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mt-7 leading-tight">
            Eating well with
            <span className="text-emerald-400"> diabetes in mind.</span>
          </h1>
          <p className="text-slate-400 mt-6 text-lg leading-relaxed">
            General, balanced guidance - not a strict diet. For a plan built
            around your needs, medicines and culture, speak with a registered
            dietitian.
          </p>
        </section>

        {/* CHOOSE / LIMIT */}
        <section className="grid lg:grid-cols-2 gap-6 mt-16">
          <Card className="border-emerald-400/15">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-400/10 flex items-center justify-center">
                <Check size={20} className="text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold">{CHOOSE_OFTEN.title}</h2>
            </div>
            <p className="text-sm text-slate-500 mt-4 leading-relaxed">{CHOOSE_OFTEN.intro}</p>
            <ul className="mt-5 space-y-3">
              {CHOOSE_OFTEN.items.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-slate-300">
                  <Check size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="border-yellow-400/15">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-yellow-400/10 flex items-center justify-center">
                <Minus size={20} className="text-yellow-400" />
              </div>
              <h2 className="text-xl font-bold">{LIMIT.title}</h2>
            </div>
            <p className="text-sm text-slate-500 mt-4 leading-relaxed">{LIMIT.intro}</p>
            <ul className="mt-5 space-y-3">
              {LIMIT.items.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-slate-300">
                  <Minus size={16} className="text-yellow-400 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {/* CONCEPTS */}
        <section className="mt-16">
          <Section eyebrow="Everyday principles" title="Four ideas that help most" />
          <div className="grid sm:grid-cols-2 gap-5 mt-8">
            {CONCEPTS.map((concept) => (
              <Card key={concept.title}>
                <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400">
                  {concept.title === "Hydration" ? <Droplets size={20} /> : <Utensils size={20} />}
                </div>
                <h3 className="font-semibold mt-5">{concept.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed mt-2">{concept.detail}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* SNACKS */}
        <section className="mt-16">
          <Card>
            <Section eyebrow="Practical" title="Healthy snack ideas" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
              {HEALTHY_SNACKS.map((snack) => (
                <div
                  key={snack}
                  className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/5"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-400/10 flex items-center justify-center">
                    <Check size={14} className="text-emerald-400" />
                  </div>
                  <span className="text-sm text-slate-300">{snack}</span>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* CTA */}
        <section className="mt-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold">Bring this into your assessment</h2>
          <p className="text-slate-500 mt-3">
            Your eating pattern is one of the lifestyle questions in the assessment.
          </p>
          <Link
            to="/assessment"
            className="inline-flex items-center gap-2 mt-7 px-6 py-3 rounded-xl bg-emerald-400 text-[#071512] font-bold hover:bg-emerald-300 transition"
          >
            Start Assessment
            <ArrowRight size={17} />
          </Link>
        </section>

        <Disclaimer className="mt-16" />
      </div>
    </main>
  );
}
