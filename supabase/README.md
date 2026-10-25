# GlucoCare - Supabase setup (optional: Stages 7 & 8)

The app runs fully without Supabase (data stays in the browser, AI is off).
Follow this only when you want the database backup and/or the AI explanation.

## 1. Create the project

1. Sign in at <https://supabase.com> and create a new project (free tier is fine).
2. Wait for it to finish provisioning.

## 2. Create the tables (Stage 7)

1. In the dashboard: **SQL Editor -> New query**.
2. Paste the contents of `migrations/0001_init.sql` and click **Run**.
3. Enable anonymous sign-in: **Authentication -> Providers -> Anonymous** -> turn ON.

## 3. Connect the frontend

1. In the dashboard: **Project Settings -> API**. Copy:
   - **Project URL**
   - **anon public** key (this one is safe for the frontend)
2. In `gluco-care/`, copy `.env.example` to `.env` and fill:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
3. Restart `npm run dev`. Completed assessments are now also saved to the
   `assessments` and `results` tables (owned by an anonymous user id).

> Never put the **service_role** key in `.env` or any `VITE_` variable.

## 4. AI explanation (Stage 8)

You do **not** need to pay for this - the function works with Google Gemini or
Groq, which both have a free tier. Full guide (including a local option that
needs no Supabase at all): **`docs/AI-SETUP.md`**.

Requires the Supabase CLI (`npm i -g supabase`).

```bash
cd gluco-care
supabase login
supabase link --project-ref <your-project-ref>
# JWT verification stays ON (default): only GlucoCare visitors with a session can call it
supabase functions deploy explain-results
# REQUIRED: the website address(es) allowed to call the function
supabase secrets set AI_ALLOWED_ORIGINS=https://your-site.example

# set ONE provider:
supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY=<your-key>
# or: supabase secrets set AI_PROVIDER=groq GROQ_API_KEY=gsk_...
# or: supabase secrets set AI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-...
```

Then add the function URL to `.env` (and your host's env vars):

```
VITE_AI_FUNCTION_URL=https://<your-project-ref>.functions.supabase.co/explain-results
```

Restart `npm run dev`. The Results page now shows an **Explain my results**
button. The key stays on Supabase's servers - it never reaches the browser.

### Safety

`functions/explain-results/index.ts` uses a system prompt that forbids
diagnosis, medication names and dosages, and always appends a fixed
"not medical advice" disclaimer regardless of model output.
