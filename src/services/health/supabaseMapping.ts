/**
 * Pure mapping between app records and Supabase rows / RPC payloads.
 * Kept separate from SupabaseRepository so it can be unit-tested without a
 * database. Column names match supabase/migrations/0002_health_history.sql.
 */

import type {
  ExtractedValueRecord,
  Measurement,
  MeasurementKind,
  MedicalReport,
  NewAssessment,
  NewReport,
  StoredAssessment,
} from "../../types/health";
import type { AssessmentResult } from "../../types/results";
import {
  measurementsFromAssessment,
  minimiseExtractedValue,
  normalizeStoredResult,
} from "../../lib/healthRecords";

/* ---------------- payloads (app -> database) ---------------------- */

export function saveAssessmentPayload(a: NewAssessment) {
  return {
    client_id: a.clientId,
    assessed_on: a.assessedOn,
    engine_version: a.result.engineVersion,
    input: a.input,
    result: a.result,
    measurements: measurementsFromAssessment(a.input, a.assessedOn).map((m) => ({
      kind: m.kind,
      value: m.value,
      unit: m.unit,
      measured_on: m.measuredOn,
      glucose_context: m.glucoseContext ?? "",
      verification: m.verification,
    })),
  };
}

export function saveReportPayload(r: NewReport) {
  return {
    client_id: r.clientId,
    label: r.label,
    report_date: r.reportDate,
    file_type: r.fileType,
    page_count: r.pageCount ?? "",
    extraction_method: r.extractionMethod,
    parser_version: r.parserVersion,
    values: r.values.map(minimiseExtractedValue).map((v) => ({
      kind: v.kind,
      matched_label: v.matchedLabel ?? null,
      extracted_value: v.extractedValue ?? "",
      extracted_unit: v.extractedUnit ?? null,
      confidence: v.confidence,
      status: v.status,
      final_value: v.finalValue ?? "",
      glucose_context: v.glucoseContext ?? "",
    })),
  };
}

/* ---------------- rows (database -> app) -------------------------- */

export interface SnapshotRow {
  id: string;
  client_id: string;
  created_at: string;
  assessed_on: string;
  engine_version: string;
  input: StoredAssessment["input"];
  // PostgREST returns a 1:1 embed as an object; tolerate an array too.
  assessment_results: { result: AssessmentResult } | { result: AssessmentResult }[] | null;
}

export function snapshotFromRow(row: SnapshotRow): StoredAssessment | null {
  const embedded = Array.isArray(row.assessment_results)
    ? row.assessment_results[0]
    : row.assessment_results;
  if (!embedded?.result) return null; // incomplete record - not shown
  return {
    id: row.id,
    clientId: row.client_id,
    createdAt: row.created_at,
    assessedOn: row.assessed_on,
    engineVersion: row.engine_version,
    input: row.input,
    result: normalizeStoredResult(embedded.result),
  };
}

export interface MeasurementRow {
  id: string;
  kind: MeasurementKind;
  value: number | string;
  unit: string;
  measured_on: string;
  created_at: string;
  glucose_context: Measurement["glucoseContext"] | null;
  source: Measurement["source"];
  verification: Measurement["verification"];
  assessment_id: string | null;
  report_id: string | null;
}

export function measurementFromRow(row: MeasurementRow): Measurement {
  return {
    id: row.id,
    kind: row.kind,
    value: Number(row.value),
    unit: row.unit,
    measuredOn: row.measured_on,
    recordedAt: row.created_at,
    ...(row.glucose_context ? { glucoseContext: row.glucose_context } : {}),
    source: row.source,
    verification: row.verification,
    ...(row.assessment_id ? { assessmentId: row.assessment_id } : {}),
    ...(row.report_id ? { reportId: row.report_id } : {}),
  };
}

export interface ExtractedValueRow {
  id: string;
  kind: MeasurementKind;
  matched_label: string | null;
  extracted_value: number | string | null;
  extracted_unit: string | null;
  confidence: ExtractedValueRecord["confidence"];
  status: ExtractedValueRecord["status"];
  final_value: number | string | null;
  glucose_context: ExtractedValueRecord["glucoseContext"] | null;
}

export interface ReportRow {
  id: string;
  client_id: string;
  created_at: string;
  label: string;
  report_date: string;
  file_type: MedicalReport["fileType"];
  page_count: number | null;
  extraction_method: MedicalReport["extractionMethod"];
  parser_version: string;
  extracted_values: ExtractedValueRow[] | null;
}

const numOrNull = (v: number | string | null): number | null => (v === null ? null : Number(v));

export function reportFromRow(row: ReportRow): MedicalReport {
  return {
    id: row.id,
    clientId: row.client_id,
    createdAt: row.created_at,
    label: row.label,
    reportDate: row.report_date,
    fileType: row.file_type,
    ...(row.page_count ? { pageCount: row.page_count } : {}),
    extractionMethod: row.extraction_method,
    parserVersion: row.parser_version,
    values: (row.extracted_values ?? []).map((v) => ({
      id: v.id,
      kind: v.kind,
      ...(v.matched_label ? { matchedLabel: v.matched_label } : {}),
      extractedValue: numOrNull(v.extracted_value),
      ...(v.extracted_unit ? { extractedUnit: v.extracted_unit } : {}),
      confidence: v.confidence,
      status: v.status,
      finalValue: numOrNull(v.final_value),
      ...(v.glucose_context ? { glucoseContext: v.glucose_context } : {}),
    })),
  };
}
