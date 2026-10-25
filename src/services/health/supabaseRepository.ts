/**
 * GlucoCare - SupabaseRepository (Phase 3)
 * -------------------------------------------------------------
 * HealthRepository backed by Supabase Postgres. Primary store when
 * VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set.
 *
 *  - Auth: Supabase anonymous sign-in gives every visitor who SAVES something a
 *    real auth user id (no fake ids); browsing alone creates no user. Row Level Security restricts every row to that user.
 *  - Writes go through the save_assessment / save_report SQL functions:
 *    one transaction each, idempotent on client_id.
 *  - Only the public anon key is used here. The service-role key must never
 *    appear in frontend code.
 *
 * Limitation (documented in README): an anonymous session lives in this
 * browser. Clearing site data loses access to the cloud history.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HealthHistory,
  MedicalReport,
  NewAssessment,
  NewReport,
  StoredAssessment,
} from "../../types/health";
import { sortHistory } from "../../lib/healthRecords";
import type { HealthRepository } from "./healthRepository";
import { RepositoryError } from "./healthRepository";
import {
  measurementFromRow,
  reportFromRow,
  saveAssessmentPayload,
  saveReportPayload,
  snapshotFromRow,
} from "./supabaseMapping";
import type { MeasurementRow, ReportRow, SnapshotRow } from "./supabaseMapping";

type PgError = { message: string; code?: string } | null;

function toRepositoryError(error: PgError | unknown): RepositoryError {
  const e = error as { message?: string; code?: string; status?: number } | null;
  const message = e?.message ?? "Unknown database error";
  if (e?.status === 429 || /rate limit/i.test(message)) {
    return new RepositoryError("rate-limited", message);
  }
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return new RepositoryError("network", message);
  }
  if (e?.code === "28000" || /jwt|not authenticated|auth/i.test(message)) {
    return new RepositoryError("auth", message);
  }
  if (e?.code?.startsWith("23") || e?.code === "22P02") {
    return new RepositoryError("invalid", message); // constraint / bad value
  }
  return new RepositoryError("unknown", message);
}

export class SupabaseRepository implements HealthRepository {
  readonly mode = "supabase" as const;
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  private sessionPromise: Promise<void> | null = null;

  /**
   * Ensures there is a session (anonymous sign-in on first use).
   * Shared by concurrent callers: loadHistory runs three queries in parallel,
   * and without this each would start its OWN anonymous sign-up - creating
   * several users for one visitor and hitting Supabase's sign-up rate limit.
   */
  private ensureSession(): Promise<void> {
    this.sessionPromise ??= this.startSession().catch((error) => {
      this.sessionPromise = null; // allow a retry after a failure
      throw error;
    });
    return this.sessionPromise;
  }

  private async startSession(): Promise<void> {
    try {
      const { data } = await this.client.auth.getSession();
      if (data.session) return;
      const { error } = await this.client.auth.signInAnonymously();
      if (error) throw error;
    } catch (error) {
      const mapped = toRepositoryError(error);
      throw mapped.code === "network" || mapped.code === "rate-limited" ? mapped : new RepositoryError("auth", mapped.message);
    }
  }

  private async run<T>(fn: () => PromiseLike<{ data: T; error: PgError }>): Promise<T> {
    await this.ensureSession();
    let response: { data: T; error: PgError };
    try {
      response = await fn();
    } catch (error) {
      throw toRepositoryError(error);
    }
    if (response.error) throw toRepositoryError(response.error);
    return response.data;
  }

  /**
   * True if this browser already has a session. Visitors who have never saved
   * anything are NOT signed in just for looking at the site - the anonymous
   * user is created on the first save (fewer users, no wasted sign-ups).
   */
  private async hasSession(): Promise<boolean> {
    try {
      const { data } = await this.client.auth.getSession();
      return Boolean(data.session);
    } catch (error) {
      throw toRepositoryError(error);
    }
  }

  async loadHistory(): Promise<HealthHistory> {
    if (!(await this.hasSession())) return { assessments: [], measurements: [], reports: [] };
    const [snapshots, measurements, reports] = await Promise.all([
      this.run(() =>
        this.client
          .from("assessment_snapshots")
          .select("id, client_id, created_at, assessed_on, engine_version, input, assessment_results ( result )"),
      ),
      this.run(() =>
        this.client
          .from("measurements")
          .select("id, kind, value, unit, measured_on, created_at, glucose_context, source, verification, assessment_id, report_id"),
      ),
      this.run(() =>
        this.client
          .from("medical_reports")
          .select("id, client_id, created_at, label, report_date, file_type, page_count, extraction_method, parser_version, extracted_values ( id, kind, matched_label, extracted_value, extracted_unit, confidence, status, final_value, glucose_context )"),
      ),
    ]);

    return sortHistory({
      assessments: ((snapshots ?? []) as unknown as SnapshotRow[])
        .map(snapshotFromRow)
        .filter((s): s is StoredAssessment => s !== null),
      measurements: ((measurements ?? []) as unknown as MeasurementRow[]).map(measurementFromRow),
      reports: ((reports ?? []) as unknown as ReportRow[]).map(reportFromRow),
    });
  }

  private async fetchSnapshot(id: string): Promise<StoredAssessment> {
    const row = await this.run(() =>
      this.client
        .from("assessment_snapshots")
        .select("id, client_id, created_at, assessed_on, engine_version, input, assessment_results ( result )")
        .eq("id", id)
        .single(),
    );
    const stored = snapshotFromRow(row as unknown as SnapshotRow);
    if (!stored) throw new RepositoryError("unknown", "Saved assessment could not be read back.");
    return stored;
  }

  async saveAssessment(a: NewAssessment): Promise<StoredAssessment> {
    const id = await this.run(() =>
      this.client.rpc("save_assessment", { p: saveAssessmentPayload(a) }),
    );
    return this.fetchSnapshot(id as string);
  }

  async deleteAssessment(id: string): Promise<void> {
    await this.run(() => this.client.from("assessment_snapshots").delete().eq("id", id));
  }

  async saveReport(r: NewReport): Promise<MedicalReport> {
    const id = await this.run(() => this.client.rpc("save_report", { p: saveReportPayload(r) }));
    const row = await this.run(() =>
      this.client
        .from("medical_reports")
        .select("id, client_id, created_at, label, report_date, file_type, page_count, extraction_method, parser_version, extracted_values ( id, kind, matched_label, extracted_value, extracted_unit, confidence, status, final_value, glucose_context )")
        .eq("id", id as string)
        .single(),
    );
    return reportFromRow(row as unknown as ReportRow);
  }

  async deleteReport(id: string): Promise<void> {
    await this.run(() => this.client.from("medical_reports").delete().eq("id", id));
  }

  async deleteMyData(): Promise<void> {
    if (!(await this.hasSession())) return; // never saved anything - nothing to delete
    await this.run(() => this.client.rpc("delete_my_data"));
  }
}
