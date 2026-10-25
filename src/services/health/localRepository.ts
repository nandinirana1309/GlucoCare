/**
 * GlucoCare - LocalRepository (Phase 3)
 * -------------------------------------------------------------
 * HealthRepository backed by the browser's localStorage. Used when Supabase
 * is not configured (development, offline demos). The UI labels this mode
 * "Saved on this device only".
 *
 * Safety rules:
 *  - If the stored history cannot be parsed, it is NEVER overwritten - every
 *    write fails with an error instead, so nothing is silently lost.
 *  - The storage object is injectable so the logic is unit-testable.
 */

import type {
  HealthHistory,
  Measurement,
  MedicalReport,
  NewAssessment,
  NewReport,
  StoredAssessment,
} from "../../types/health";
import { emptyHistory } from "../../types/health";
import {
  measurementsFromAssessment,
  measurementsFromReport,
  minimiseExtractedValue,
  newId,
  normalizeStoredResult,
  sortHistory,
} from "../../lib/healthRecords";
import type { HealthRepository } from "./healthRepository";
import { RepositoryError } from "./healthRepository";

export const LOCAL_HISTORY_KEY = "glucocare-history-v1";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface StoredShape {
  version: 1;
  assessments: StoredAssessment[];
  measurements: Measurement[];
  reports: MedicalReport[];
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

export class LocalRepository implements HealthRepository {
  readonly mode = "local" as const;
  private readonly storage: KeyValueStorage | null;
  private readonly now: () => Date;

  constructor(storage?: KeyValueStorage | null, now: () => Date = () => new Date()) {
    this.now = now;
    if (storage !== undefined) {
      this.storage = storage;
    } else {
      try {
        this.storage = globalThis.localStorage ?? null;
      } catch {
        this.storage = null; // accessing localStorage itself can throw
      }
    }
  }

  private read(): StoredShape {
    if (!this.storage) {
      throw new RepositoryError("storage-unavailable", "localStorage is not available.");
    }
    let raw: string | null;
    try {
      raw = this.storage.getItem(LOCAL_HISTORY_KEY);
    } catch {
      throw new RepositoryError("storage-unavailable", "localStorage is not available.");
    }
    if (!raw) return { version: 1, ...emptyHistory };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new RepositoryError("invalid", "the saved history on this device is unreadable and was left untouched.");
    }
    const p = parsed as Partial<StoredShape>;
    if (
      !p ||
      p.version !== 1 ||
      !Array.isArray(p.assessments) ||
      !Array.isArray(p.measurements) ||
      !Array.isArray(p.reports)
    ) {
      throw new RepositoryError("invalid", "the saved history on this device has an unexpected format and was left untouched.");
    }
    return p as StoredShape;
  }

  private write(data: StoredShape): void {
    if (!this.storage) {
      throw new RepositoryError("storage-unavailable", "localStorage is not available.");
    }
    try {
      this.storage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(data));
    } catch (error) {
      if (isQuotaError(error)) throw new RepositoryError("storage-full", "localStorage is full.");
      throw new RepositoryError("storage-unavailable", "localStorage is not available.");
    }
  }

  async loadHistory(): Promise<HealthHistory> {
    const data = this.read();
    return sortHistory({
      assessments: data.assessments.map((s) => ({ ...s, result: normalizeStoredResult(s.result) })),
      measurements: data.measurements,
      reports: data.reports,
    });
  }

  async saveAssessment(a: NewAssessment): Promise<StoredAssessment> {
    const data = this.read();

    // Idempotent: the same clientId always returns the first saved record.
    const existing = data.assessments.find((s) => s.clientId === a.clientId);
    if (existing) return existing;

    const recordedAt = this.now().toISOString();
    const stored: StoredAssessment = {
      id: newId(),
      clientId: a.clientId,
      createdAt: recordedAt,
      assessedOn: a.assessedOn,
      engineVersion: a.result.engineVersion,
      input: a.input,
      result: a.result,
    };
    const measurements: Measurement[] = measurementsFromAssessment(a.input, a.assessedOn).map(
      (m) => ({ ...m, id: newId(), recordedAt, assessmentId: stored.id }),
    );

    this.write({
      ...data,
      assessments: [...data.assessments, stored],
      measurements: [...data.measurements, ...measurements],
    });
    return stored;
  }

  async deleteAssessment(id: string): Promise<void> {
    const data = this.read();
    this.write({
      ...data,
      assessments: data.assessments.filter((s) => s.id !== id),
      measurements: data.measurements.filter((m) => m.assessmentId !== id),
    });
  }

  async saveReport(r: NewReport): Promise<MedicalReport> {
    const data = this.read();
    const existing = data.reports.find((x) => x.clientId === r.clientId);
    if (existing) return existing;

    const recordedAt = this.now().toISOString();
    const values = r.values.map((v) => ({ ...minimiseExtractedValue(v), id: newId() }));
    const report: MedicalReport = {
      id: newId(),
      clientId: r.clientId,
      createdAt: recordedAt,
      label: r.label,
      reportDate: r.reportDate,
      fileType: r.fileType,
      pageCount: r.pageCount,
      extractionMethod: r.extractionMethod,
      parserVersion: r.parserVersion,
      values,
    };
    const measurements: Measurement[] = measurementsFromReport(r.values, r.reportDate).map(
      ({ measurement }) => ({ ...measurement, id: newId(), recordedAt, reportId: report.id }),
    );

    this.write({
      ...data,
      reports: [...data.reports, report],
      measurements: [...data.measurements, ...measurements],
    });
    return report;
  }

  async deleteReport(id: string): Promise<void> {
    const data = this.read();
    this.write({
      ...data,
      reports: data.reports.filter((x) => x.id !== id),
      measurements: data.measurements.filter((m) => m.reportId !== id),
    });
  }

  async deleteMyData(): Promise<void> {
    if (!this.storage) {
      throw new RepositoryError("storage-unavailable", "localStorage is not available.");
    }
    try {
      this.storage.removeItem(LOCAL_HISTORY_KEY);
    } catch {
      throw new RepositoryError("storage-unavailable", "localStorage is not available.");
    }
  }
}
