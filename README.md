# GlucoCare - Diabetes Health Assessment and Support System

A web-based, **diabetes-focused** health assessment and support platform.
GlucoCare is an **educational** tool: it does not diagnose, it does not
prescribe, and it always points the user to a qualified healthcare
professional.

Built with React + TypeScript + Vite + Tailwind CSS v4 + lucide-react.

---

## Quick start

```bash
cd gluco-care
npm install
npm run dev
```

Open the URL shown (usually <http://localhost:5173>).

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run server` | Start the local AI proxy (only needed for the AI feature - see `docs/AI-SETUP.md`) |
| `npm run dev:all` | Run the dev server + AI proxy together |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the unit tests (assessment engine, BMI, validation, red flags) |
| `npm run lint` | Run oxlint |

No environment variables are required. Optional ones are in `.env.example`:
- **AI-assisted explanation** -> `docs/AI-SETUP.md`
- **Supabase database backup** -> `supabase/README.md`

---

## Project structure

```
src/
  types/       Shared data shapes (assessment, results, report, ai, healthcare)
  data/        Reference criteria & educational content (each item cites a source)
  lib/         Pure logic - BMI, validation, red-flag checks, the assessment engine
  services/    I/O boundary - storage, Supabase sync, report, AI, healthcare APIs
  context/     AssessmentContext - one shared assessment state
  components/
    layout/    Layout (Navbar + Footer)
    ui/        Card, Badge, Section, Disclaimer, EmergencyBanner, FutureBadge
  pages/       Home, Assessment, Results, Education, Nutrition, Healthcare, NotFound
supabase/
  migrations/  Database schema (Stage 7)
  functions/   explain-results edge function (Stage 8)
```

The rule the codebase follows: **pages never calculate or fetch directly** -
they call `lib/` (logic) and `services/` (I/O).

---

## What is implemented (current prototype)

| Module | Status |
|---|---|
| Home / landing | Done |
| 5-step assessment (patient, history, measurements, lifestyle, location) | Done |
| Input validation + live BMI | Done |
| Serious-warning-signs checklist -> emergency banner | Done |
| Assessment engine (indicator statuses, concern level, risk factors, recommendations) | Done |
| Results dashboard | Done |
| Diabetes education | Done |
| Nutrition guidance | Done |
| Healthcare finder (real OpenStreetMap data, no API key) | Done |
| Medical report upload + optional manual value entry | Done |
| Unit tests + error boundary | Done |

## Proposed features (not connected in this prototype)

| Feature | Where the code is ready | To switch on |
|---|---|---|
| Automatic reading of report values (OCR) | `services/reportService.ts` (honest stub) | Build a server-side extractor |
| Supabase database backup | `services/syncService.ts`, `supabase/migrations/` | `supabase/README.md` |
| AI-assisted explanation of results | `services/aiService.ts`, `server/ai-proxy.mjs`, `supabase/functions/explain-results/` | `docs/AI-SETUP.md` - works with a **free** Gemini/Groq key, or Ollama (no key) |

The report OCR is labelled **"Proposed Feature"** and the AI shows
**"not connected"** until you set it up - nothing is faked.

---

## Safety and scope

- **No diagnosis.** The "concern level" is an educational indicator built from
  published reference criteria (WHO, ADA, ACC/AHA), always described as such.
- **No prescriptions or dosages.** Medication content is general only.
- **Diabetes only** - type 1, type 2, gestational, prediabetes indicators.
- **No fabricated data** - reference numbers are cited (`[R1]`-`[R3]`), hospital
  data comes from OpenStreetMap, and the AI/OCR features return honest
  "not available" states until connected.
- Health data is stored in the browser's `localStorage`. A **"Clear my data"**
  action is on the Results page. On a shared computer, use it when finished.

---

## Deployment

The app is a static site (any host works). SPA routing configs are included:
`public/_redirects` (Netlify) and `vercel.json` (Vercel).

```bash
npm run build     # outputs dist/
```

Deploy `dist/` (or connect the repo to Vercel/Netlify - build command
`npm run build`, output directory `dist`). Add any optional `VITE_` variables
in the host's environment settings.

---

## References (placeholders - replace with verified citations)

- `[R1]` World Health Organization - Diabetes
- `[R2]` American Diabetes Association - Standards of Care in Diabetes
- `[R3]` American College of Cardiology / American Heart Association - Blood Pressure
- `[R4]` Peer-reviewed research on diabetes risk assessment
- `[R5]` Peer-reviewed research on diabetes management systems
- `[R6]` Official documentation for React / TypeScript / Vite
- `[R7]` OpenStreetMap - Nominatim and Overpass API documentation
