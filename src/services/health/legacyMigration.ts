/**
 * GlucoCare - migration from the single-assessment storage (Phase 3)
 * -------------------------------------------------------------
 * Before Project-II the app kept ONE assessment in localStorage under
 * "glucocare-assessment". This module lets the user copy that record into
 * their health history.
 *
 * Safety rules:
 *  - Opt-in: nothing is migrated until the user chooses to.
 *  - Copy, never move: the "glucocare-assessment" key is NEVER deleted here.
 *  - Idempotent: a stable client id is written BEFORE saving, so a retry
 *    after a failure cannot create a duplicate.
 *  - A legacy record is recognised by the absence of the `assessedOn` field,
 *    which every draft written by the Project-II app contains.
 */

import type { AssessmentData } from "../../types/assessment";
import { ASSESSMENT_STORAGE_KEY, normalizeAssessment } from "../../types/assessment";
import type { StoredAssessment } from "../../types/health";
import { runAssessment } from "../../lib/assessmentEngine";
import { newId, sanitizeAssessmentInput } from "../../lib/healthRecords";
import type { HealthRepository } from "./healthRepository";

export const LEGACY_MIGRATION_KEY = "glucocare-legacy-migration-v1";
/** A COPY of the pre-Project-II record, taken once at startup. */
export const LEGACY_SNAPSHOT_KEY = "glucocare-legacy-assessment";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

interface MigrationRecord {
  status: "pending" | "migrated" | "dismissed";
  clientId: string;
  assessmentId?: string;
  at: string;
}

function readRecord(storage: KeyValueStorage): MigrationRecord | null {
  try {
    const raw = storage.getItem(LEGACY_MIGRATION_KEY);
    return raw ? (JSON.parse(raw) as MigrationRecord) : null;
  } catch {
    return null;
  }
}

function writeRecord(storage: KeyValueStorage, record: MigrationRecord): void {
  storage.setItem(LEGACY_MIGRATION_KEY, JSON.stringify(record));
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function parseLegacy(text: string | null): AssessmentData | null {
  if (!text) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || "assessedOn" in raw) return null;
  const data = normalizeAssessment(raw as Partial<AssessmentData>);
  return runAssessment(data).hasUsableInput ? data : null;
}

/**
 * Call ONCE at startup, before React renders (main.tsx). The draft provider
 * rewrites "glucocare-assessment" in the new format on mount, which would
 * hide the legacy marker - so the old record is COPIED to its own key first.
 * Nothing is deleted.
 */
export function preserveLegacyAssessment(
  storage: (KeyValueStorage & Pick<Storage, "getItem">) | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    if (storage.getItem(LEGACY_SNAPSHOT_KEY)) return;
    const text = storage.getItem(ASSESSMENT_STORAGE_KEY);
    if (parseLegacy(text)) storage.setItem(LEGACY_SNAPSHOT_KEY, text as string);
  } catch {
    // storage unavailable - nothing to preserve
  }
}

/**
 * The pre-Project-II assessment waiting to be copied into history, or null
 * (none stored, nothing meaningful in it, already migrated or dismissed).
 */
export function findLegacyAssessment(
  storage: KeyValueStorage | null = defaultStorage(),
): AssessmentData | null {
  if (!storage) return null;
  const record = readRecord(storage);
  if (record && record.status !== "pending") return null;
  try {
    return (
      parseLegacy(storage.getItem(LEGACY_SNAPSHOT_KEY)) ??
      parseLegacy(storage.getItem(ASSESSMENT_STORAGE_KEY))
    );
  } catch {
    return null;
  }
}

/** Copies the legacy assessment into history. The original key is kept. */
export async function migrateLegacyAssessment(
  repository: HealthRepository,
  assessedOn: string,
  storage: KeyValueStorage | null = defaultStorage(),
): Promise<StoredAssessment | null> {
  if (!storage) return null;
  const data = findLegacyAssessment(storage);
  if (!data) return null;

  // Persist the client id first so a retry re-uses it (idempotent save).
  const existing = readRecord(storage);
  const clientId = existing?.clientId ?? newId();
  writeRecord(storage, { status: "pending", clientId, at: new Date().toISOString() });

  const stored = await repository.saveAssessment({
    clientId,
    assessedOn,
    input: sanitizeAssessmentInput({ ...data, assessedOn }),
    result: runAssessment(data),
  });

  writeRecord(storage, {
    status: "migrated",
    clientId,
    assessmentId: stored.id,
    at: new Date().toISOString(),
  });
  return stored;
}

/** The user chose not to copy it. The record itself is left untouched. */
export function dismissLegacyAssessment(
  storage: KeyValueStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  const existing = readRecord(storage);
  writeRecord(storage, {
    status: "dismissed",
    clientId: existing?.clientId ?? newId(),
    at: new Date().toISOString(),
  });
}
