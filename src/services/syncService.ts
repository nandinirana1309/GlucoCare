/**
 * GlucoCare - cloud sync (Stage 7, optional)
 * -------------------------------------------------------------
 * Pushes a copy of a completed assessment + its computed result to Supabase.
 * This is a BACKUP layer - the app is fully usable without it.
 *
 * Auth: the project has no login screen. When Supabase is configured we use
 * Supabase "anonymous sign-in", which issues a real (anonymous) user id. Every
 * row is owned by that id and Row Level Security only allows a user to see
 * their own rows (see supabase/migrations/0001_init.sql).
 *
 * Nothing here throws - callers use `void syncAssessment(...)` fire-and-forget.
 */

import type { AssessmentData } from "../types/assessment";
import { runAssessment } from "../lib/assessmentEngine";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

export type SyncOutcome = { ok: boolean; reason?: string };

function numeric(value: string): number | null {
  if (!value || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function ensureAnonymousUser(): Promise<string | null> {
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session) return sessionData.session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.warn("GlucoCare: anonymous sign-in failed -", error.message);
    return null;
  }
  return data.user?.id ?? null;
}

export async function syncAssessment(
  assessment: AssessmentData,
): Promise<SyncOutcome> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, reason: "not-configured" };
  }

  try {
    const userId = await ensureAnonymousUser();
    if (!userId) return { ok: false, reason: "auth-failed" };

    const result = runAssessment(assessment);

    const { data: inserted, error: assessmentError } = await supabase
      .from("assessments")
      .insert({
        session_id: userId,
        name: assessment.name || null,
        age: numeric(assessment.age),
        gender: assessment.gender || null,
        diabetes_status: assessment.diabetesStatus || null,
        diabetes_type: assessment.diabetesType || null,
        family_history: assessment.familyHistory || null,
        glucose: numeric(assessment.glucose),
        hba1c: numeric(assessment.hba1c),
        height_cm: numeric(assessment.height),
        weight_kg: numeric(assessment.weight),
        systolic: numeric(assessment.systolic),
        diastolic: numeric(assessment.diastolic),
        symptoms: assessment.symptoms,
        warning_signs: assessment.warningSigns,
        activity_level: assessment.activityLevel || null,
        smoking: assessment.smoking || null,
        diet_pattern: assessment.dietPattern || null,
        sleep_hours: numeric(assessment.sleepHours),
        locality: assessment.locality || null,
        report_name: assessment.report,
        raw: assessment,
      })
      .select("id")
      .single();

    if (assessmentError || !inserted) {
      return { ok: false, reason: assessmentError?.message ?? "insert-failed" };
    }

    const { error: resultError } = await supabase.from("results").insert({
      assessment_id: inserted.id,
      session_id: userId,
      concern_level: result.concernLevel,
      concern_score: result.concernScore,
      engine_version: result.engineVersion,
      indicators: result.indicators,
      risk_factors: result.riskFactors,
      red_flags: result.redFlags,
      recommendations: result.recommendations,
    });

    if (resultError) return { ok: false, reason: resultError.message };

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "unknown-error",
    };
  }
}
