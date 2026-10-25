# GlucoCare - AI-Powered Personalised Diabetes Health Intelligence and Support System

A web-based, **diabetes-focused** health assessment and support platform.
GlucoCare combines a transparent rule-based assessment, a deterministic safety
layer, a secure personal health history, medical-report reading, trend
analysis and a strictly controlled AI explanation layer.

GlucoCare is an **educational** tool: it does not diagnose, it does not
prescribe, and it always points the user to a qualified healthcare
professional.

Built with React 19 + TypeScript + Vite + Tailwind CSS v4, Supabase
(PostgreSQL), Recharts, PDF.js, Tesseract.js and Google Gemini.

---

## Quick start

```bash
cd gluco-care
npm install
cp .env.example .env      # then fill in .env (see "Configuration")
npm run dev:all           # website http://localhost:5173 + AI server http://localhost:8787
```

With an empty `.env` the app still works: history is saved on the device
only and the AI explanation shows "not connected".

| Command | What it does |
|---|---|
| `npm run dev` | Start the website only |
| `npm run server` | Start the local AI server only (reads `.env`) |
| `npm run dev:all` | Website + AI server together |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Preview the production build |
| `npm test` | Unit tests (232) |
| `npm run test:e2e` | End-to-end browser tests (isolated: own server, device mode, mock AI) |
| `npm run test:supabase` | Integration tests against the real Supabase project in `.env` |
| `npm run test:live` | Real Supabase + real Gemini in the browser (run `npm run dev:all` first) |
| `npm run lint` | oxlint |

End-to-end tests drive the Chrome or Edge already installed on the machine
(`playwright-core`; no browser download).

---

## Configuration (`.env`)

Copy `.env.example` to `.env`. **Never put real keys in `.env.example`** - it
is committed to git; `.env` is git-ignored.

| Variable | Where it is used | Notes |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser | Public "anon/publishable" key only - never the service-role/secret key |
| `VITE_AI_FUNCTION_URL` | Browser | `http://localhost:8787/api/explain-results` locally |
| `AI_PROVIDER`, `GEMINI_API_KEY` | AI server only | Never prefix an API key with `VITE_` |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` | AI server | Default `gemini-3.5-flash`, then lite/latest fallbacks |
| `AI_ALLOWED_ORIGINS`, `AI_RATE_LIMIT`, `AI_PROVIDER_TIMEOUT_MS` | AI server | Protection settings (defaults in `.env.example`) |

**Supabase setup:** run `supabase/migrations/0001_init.sql` and
`0002_health_history.sql` in the SQL editor, then enable
*Authentication → Sign In / Providers → Allow anonymous sign-ins*.
More: `supabase/README.md`. AI setup: `docs/AI-SETUP.md`.

---

## Features

| Feature | Where |
|---|---|
| 5-step assessment with validation, glucose context and measurement date | `/assessment` |
| Explainable result: every point traced to an input ("Why am I seeing this result?") | `/results`, `/results/:id` |
| Safety layer: urgent values / warning signs force High, show a banner first, block AI | Results, Journey, form |
| Health history: immutable snapshots, idempotent saves, delete one / delete all | Supabase or this device |
| My Health Journey dashboard: stats, measurements, timeline, factor summary | `/journey` |
| Trend charts (glucose per context, HbA1c, BP, weight, BMI) - no predictions | `/journey` |
| "What changed?" comparison between any two assessments | `/journey`, `/results/:id` |
| Medical report reading (PDF text + OCR) with confirm / edit / reject review | `/reports/new` |
| AI explanation: evidence-only input, output validated by a guard | Results, Journey |
| Personalised education from a fixed, curated library | Results, Journey, Education, Nutrition |
| Doctor consultation summary: copy, print / PDF, optional guarded AI overview | `/journey/summary` |
| Educational What-If simulator (never predicts measurements, saves nothing) | `/journey/scenarios` |
| Healthcare facility finder (OpenStreetMap, no API key) | `/healthcare` |
| Diabetes education and nutrition guidance | `/education`, `/nutrition` |

---

## Architecture

```
src/
  types/       data models (assessment, results, safety, health, ai, report, healthcare)
  data/        reference ranges (cited), symptoms, nutrition, education library
  lib/         PURE deterministic logic - engine, safety, red flags, validation, BMI,
               trends, compare, report parser, AI evidence + AI guard, personalise,
               doctor summary, scenarios
  services/    I/O - health repositories (Supabase + local), report extraction,
               AI service, healthcare finder, Supabase client
  context/     draft assessment + health history providers
  components/  UI building blocks
  pages/       routes
server/        ai-proxy.mjs - local AI server (API key stays here)
supabase/      migrations + explain-results Edge Function (for deployment)
e2e/           end-to-end and live browser tests
docs/          AI setup, project report material
```

Rules the codebase follows:

- **Pages never calculate or fetch directly** - they call `lib/` (logic) and `services/` (I/O).
- **Deterministic logic decides; AI only explains.** Score, level, safety,
  trends, comparisons, education ranking and the doctor-summary facts are all
  rule-based and unit-tested. The AI receives minimal structured evidence and
  every reply is checked by `lib/aiGuard.ts` before it is shown.
- **Safety first.** `lib/safety.ts` (rules in `lib/redFlags.ts`) is evaluated
  independently of the score and blocks AI when urgent.

---

## Security and privacy

- API keys only in `.env` (server side) or Supabase function secrets.
- Supabase Row Level Security: each user can only read / insert / delete
  their own rows; history cannot be updated; the public `anon` role has no access.
- Anonymous sign-in happens only on the first save - browsing creates no user.
- No name, locality, report file or report text is ever stored in the
  database or sent to the AI. Report files are read in the browser only.
- "Clear my data" deletes the saved history (cloud or device) and the draft.

---

## Deployment

The website is a static site (`npm run build` → `dist/`); `vercel.json` and
`public/_redirects` handle SPA routing. Set the `VITE_` variables in the
host's settings. For AI on a deployed site, deploy the Supabase Edge Function
(`supabase/README.md`) and point `VITE_AI_FUNCTION_URL` at it - the local
`server/ai-proxy.mjs` is for development.

---

## Safety and scope

- **No diagnosis.** The "concern level" is an educational indicator built from
  published reference criteria (WHO, ADA, ACC/AHA).
- **No prescriptions, doses or treatment changes** - in content and in AI output.
- **No predictions** of future glucose, HbA1c or blood pressure.
- **Diabetes only.**

---

## References (placeholders - replace with verified citations)

- `[R1]` World Health Organization - Diabetes
- `[R2]` American Diabetes Association - Standards of Care in Diabetes
- `[R3]` American College of Cardiology / American Heart Association - Blood Pressure
- `[R4]`, `[R5]` Peer-reviewed research on diabetes risk assessment / management systems
- `[R6]` Official documentation for React / TypeScript / Vite
- `[R7]` OpenStreetMap - Nominatim and Overpass API documentation
