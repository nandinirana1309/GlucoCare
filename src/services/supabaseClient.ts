/**
 * GlucoCare - Supabase client (Stage 7, optional)
 * -------------------------------------------------------------
 * Supabase is only used if BOTH of these environment variables are set in a
 * `.env` file at the project root (see .env.example):
 *
 *   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJ...   <-- the PUBLIC anon key, safe for frontend
 *
 * The anon key is designed to be public; security comes from Row Level
 * Security policies in the database (see supabase/migrations). NEVER put the
 * service-role key in this file or any VITE_ variable.
 *
 * If the variables are missing, `supabase` is null and the whole app still
 * works using localStorage only.
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
