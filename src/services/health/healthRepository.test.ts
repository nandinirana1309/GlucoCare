import { describe, it, expect } from "vitest";
import { LocalRepository, LOCAL_HISTORY_KEY } from "./localRepository";
import { RepositoryError } from "./healthRepository";
import {
  dismissLegacyAssessment,
  findLegacyAssessment,
  migrateLegacyAssessment,
  preserveLegacyAssessment,
  LEGACY_MIGRATION_KEY,
  LEGACY_SNAPSHOT_KEY,
} from "./legacyMigration";
import { saveAssessmentPayload, saveReportPayload, snapshotFromRow } from "./supabaseMapping";
import type { SnapshotRow } from "./supabaseMapping";
import { runAssessment } from "../../lib/assessmentEngine";
import {
  measurementsFromAssessment,
  measurementsFromReport,
  normalizeStoredResult,
  sanitizeAssessmentInput,
  validateRecordDate,
  todayISO,
} from "../../lib/healthRecords";
import { ASSESSMENT_STORAGE_KEY, emptyAssessment } from "../../types/assessment";
import type { AssessmentData } from "../../types/assessment";
import type { HealthRepository } from "./healthRepository";
import type { NewAssessment, NewReport } from "../../types/health";

/* ---------------- helpers ---------------- */

class MemoryStorage {
  map = new Map<string, string>();
  failWith: Error | null = null;
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.failWith) throw this.failWith;
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

function make(overrides: Partial<AssessmentData>): AssessmentData {
  return { ...emptyAssessment, ...overrides };
}

const DRAFT = make({
  name: "Asha Kumar",
  locality: "Vellore",
  report: "asha-lab-report.pdf",
  age: "52",
  glucose: "156",
  glucoseContext: "fasting",
  hba1c: "6.8",
  height: "170",
  weight: "78.3",
  systolic: "134",
  diastolic: "86",
  symptoms: ["Fatigue"],
  otherSymptoms: "x".repeat(900),
});

function newAssessment(clientId: string, data = DRAFT, assessedOn = "2026-09-01"): NewAssessment {
  return { clientId, assessedOn, input: sanitizeAssessmentInput(data), result: runAssessment(data) };
}

const REPORT: NewReport = {
  clientId: "r-1",
  label: "Lab report",
  reportDate: "2026-08-15",
  fileType: "pdf",
  pageCount: 2,
  extractionMethod: "pdf_text",
  parserVersion: "1.0.0",
  values: [
    { kind: "hba1c", extractedValue: 7.1, finalValue: 7.1, confidence: "high", status: "confirmed", matchedLabel: "HbA1c" },
    { kind: "glucose", extractedValue: 162, finalValue: 152, confidence: "medium", status: "edited", glucoseContext: "fasting" },
    { kind: "weight", extractedValue: 801, finalValue: 801, confidence: "low", status: "rejected" },
    { kind: "systolic", extractedValue: null, finalValue: 130, confidence: "high", status: "added" },
  ],
};

/* ---------------- record helpers ---------------- */

describe("sanitizeAssessmentInput", () => {
  it("removes name, locality and report filename, and caps free text", () => {
    const input = sanitizeAssessmentInput(DRAFT) as Record<string, unknown>;
    expect("name" in input).toBe(false);
    expect("locality" in input).toBe(false);
    expect("report" in input).toBe(false);
    expect((input.otherSymptoms as string).length).toBe(500);
    expect(input.glucose).toBe("156");
  });
});

describe("measurementsFromAssessment", () => {
  it("creates one measurement per provided value, BMI marked calculated", () => {
    const ms = measurementsFromAssessment(sanitizeAssessmentInput(DRAFT), "2026-09-01");
    expect(ms.map((m) => m.kind)).toEqual(["glucose", "hba1c", "systolic", "diastolic", "height", "weight", "bmi"]);
    expect(ms.find((m) => m.kind === "bmi")).toMatchObject({ value: 27.1, verification: "calculated", unit: "kg/m2" });
    expect(ms.find((m) => m.kind === "glucose")).toMatchObject({ value: 156, glucoseContext: "fasting", source: "assessment", verification: "manual" });
    expect(ms.every((m) => m.measuredOn === "2026-09-01")).toBe(true);
  });

  it("blood pressure only as a pair; implausible values skipped; glucose context defaults to unknown", () => {
    const ms = measurementsFromAssessment(sanitizeAssessmentInput(make({ systolic: "150", glucose: "15000", hba1c: "6" })), "2026-09-01");
    expect(ms.map((m) => m.kind)).toEqual(["hba1c"]);
    const g = measurementsFromAssessment(sanitizeAssessmentInput(make({ glucose: "120" })), "2026-09-01");
    expect(g[0].glucoseContext).toBe("unknown");
  });

  it("a blank draft creates no measurements", () => {
    expect(measurementsFromAssessment(sanitizeAssessmentInput(emptyAssessment), "2026-09-01")).toEqual([]);
  });
});

describe("measurementsFromReport", () => {
  it("only confirmed / edited / added values become measurements, rejected never do", () => {
    const ms = measurementsFromReport(REPORT.values, REPORT.reportDate).map((x) => x.measurement);
    expect(ms.map((m) => [m.kind, m.value, m.verification])).toEqual([
      ["hba1c", 7.1, "report_confirmed"],
      ["glucose", 152, "report_edited"],
      ["systolic", 130, "report_added"],
    ]);
    expect(ms.every((m) => m.source === "report" && m.measuredOn === "2026-08-15")).toBe(true);
  });
});

describe("validateRecordDate", () => {
  it("accepts blank (today) and past dates, rejects future / invalid", () => {
    expect(validateRecordDate("", "2026-10-05")).toBe("");
    expect(validateRecordDate("2026-10-05", "2026-10-05")).toBe("");
    expect(validateRecordDate("2026-10-06", "2026-10-05")).toMatch(/future/);
    expect(validateRecordDate("2026-02-30", "2026-10-05")).toMatch(/valid/);
    expect(validateRecordDate("1850-01-01", "2026-10-05")).toMatch(/1900/);
    expect(todayISO(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});

/* ---------------- LocalRepository ---------------- */

describe("LocalRepository", () => {
  it("starts empty", async () => {
    const repo = new LocalRepository(new MemoryStorage());
    expect(await repo.loadHistory()).toEqual({ assessments: [], measurements: [], reports: [] });
  });

  it("saves a snapshot that preserves input, score, level, factors, safety, basis and engine version", async () => {
    const repo = new LocalRepository(new MemoryStorage());
    const a = newAssessment("c-1");
    const stored = await repo.saveAssessment(a);
    const h = await repo.loadHistory();
    expect(h.assessments).toHaveLength(1);
    const s = h.assessments[0];
    expect(s).toMatchObject({ id: stored.id, clientId: "c-1", assessedOn: "2026-09-01", engineVersion: "1.1.0" });
    expect(s.result.concernScore).toBe(a.result.concernScore);
    expect(s.result.concernLevel).toBe(a.result.concernLevel);
    expect(s.result.factors).toEqual(a.result.factors);
    expect(s.result.safety).toEqual(a.result.safety);
    expect(s.result.levelBasis).toEqual(a.result.levelBasis);
    expect("name" in s.input).toBe(false);
    expect(h.measurements).toHaveLength(7);
    expect(h.measurements.every((m) => m.assessmentId === stored.id)).toBe(true);
  });

  it("is idempotent: saving the same clientId twice creates no duplicate", async () => {
    const storage = new MemoryStorage();
    const repo = new LocalRepository(storage);
    const first = await repo.saveAssessment(newAssessment("same"));
    const second = await repo.saveAssessment(newAssessment("same", make({ glucose: "99" })));
    expect(second.id).toBe(first.id);
    const h = await repo.loadHistory();
    expect(h.assessments).toHaveLength(1);
    expect(h.measurements).toHaveLength(7);
  });

  it("keeps separate assessments independent and sorted oldest first", async () => {
    const repo = new LocalRepository(new MemoryStorage());
    await repo.saveAssessment(newAssessment("b", make({ glucose: "150" }), "2026-09-15"));
    await repo.saveAssessment(newAssessment("a", make({ glucose: "140" }), "2026-09-01"));
    const h = await repo.loadHistory();
    expect(h.assessments.map((s) => s.input.glucose)).toEqual(["140", "150"]);
    expect(h.measurements.map((m) => m.value)).toEqual([140, 150]);
  });

  it("deleteAssessment removes it and only its measurements", async () => {
    const repo = new LocalRepository(new MemoryStorage());
    const a = await repo.saveAssessment(newAssessment("a"));
    await repo.saveAssessment(newAssessment("b", make({ glucose: "120" })));
    await repo.deleteAssessment(a.id);
    const h = await repo.loadHistory();
    expect(h.assessments.map((s) => s.clientId)).toEqual(["b"]);
    expect(h.measurements).toHaveLength(1);
  });

  it("saveReport stores metadata + reviewed values; rejected values keep no number; idempotent", async () => {
    const repo = new LocalRepository(new MemoryStorage());
    const r1 = await repo.saveReport(REPORT);
    const r2 = await repo.saveReport(REPORT);
    expect(r2.id).toBe(r1.id);
    const h = await repo.loadHistory();
    expect(h.reports).toHaveLength(1);
    const rejected = h.reports[0].values.find((v) => v.status === "rejected")!;
    expect(rejected.extractedValue).toBeNull();
    expect(rejected.finalValue).toBeNull();
    expect(h.measurements.map((m) => m.kind)).toEqual(["hba1c", "glucose", "systolic"]);
    expect(h.measurements.every((m) => m.reportId === r1.id)).toBe(true);
    await repo.deleteReport(r1.id);
    expect(await repo.loadHistory()).toEqual({ assessments: [], measurements: [], reports: [] });
  });

  it("deleteMyData removes history but never the current draft", async () => {
    const storage = new MemoryStorage();
    storage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify(DRAFT));
    const repo = new LocalRepository(storage);
    await repo.saveAssessment(newAssessment("a"));
    await repo.deleteMyData();
    expect(storage.getItem(LOCAL_HISTORY_KEY)).toBeNull();
    expect(storage.getItem(ASSESSMENT_STORAGE_KEY)).not.toBeNull();
  });

  it("refuses to overwrite unreadable history (never silently deletes)", async () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_HISTORY_KEY, "{not json");
    const repo = new LocalRepository(storage);
    await expect(repo.loadHistory()).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.saveAssessment(newAssessment("a"))).rejects.toBeInstanceOf(RepositoryError);
    expect(storage.getItem(LOCAL_HISTORY_KEY)).toBe("{not json");
  });

  it("reports unavailable and full storage as typed errors", async () => {
    await expect(new LocalRepository(null).loadHistory()).rejects.toMatchObject({ code: "storage-unavailable" });
    const storage = new MemoryStorage();
    storage.failWith = new DOMException("full", "QuotaExceededError");
    await expect(new LocalRepository(storage).saveAssessment(newAssessment("a"))).rejects.toMatchObject({ code: "storage-full" });
  });
});

/* ---------------- legacy migration ---------------- */

describe("legacy migration from glucocare-assessment", () => {
  const legacyJson = JSON.stringify({ ...DRAFT, assessedOn: undefined });

  it("finds an old-format record (no assessedOn) with usable input", () => {
    const storage = new MemoryStorage();
    storage.setItem(ASSESSMENT_STORAGE_KEY, legacyJson);
    expect(findLegacyAssessment(storage)?.glucose).toBe("156");
  });

  it("ignores new-format drafts and empty records", () => {
    const storage = new MemoryStorage();
    storage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify({ ...DRAFT, assessedOn: "" }));
    expect(findLegacyAssessment(storage)).toBeNull();
    storage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify({ name: "only a name" }));
    expect(findLegacyAssessment(storage)).toBeNull();
  });

  it("copies into history once, keeps the original key, and is then no longer offered", async () => {
    const storage = new MemoryStorage();
    storage.setItem(ASSESSMENT_STORAGE_KEY, legacyJson);
    const repo = new LocalRepository(storage);
    const stored = await migrateLegacyAssessment(repo, "2026-08-01", storage);
    expect(stored?.assessedOn).toBe("2026-08-01");
    expect(stored?.result.concernScore).toBe(runAssessment(DRAFT).concernScore);
    expect("name" in stored!.input).toBe(false);
    expect(storage.getItem(ASSESSMENT_STORAGE_KEY)).toBe(legacyJson);
    expect(findLegacyAssessment(storage)).toBeNull();
    expect((await repo.loadHistory()).assessments).toHaveLength(1);
  });

  it("a retry after a failed save re-uses the same client id (no duplicate)", async () => {
    const storage = new MemoryStorage();
    storage.setItem(ASSESSMENT_STORAGE_KEY, legacyJson);
    const local = new LocalRepository(storage);
    let calls = 0;
    const flaky: HealthRepository = {
      ...local,
      mode: "local",
      loadHistory: () => local.loadHistory(),
      deleteAssessment: (id) => local.deleteAssessment(id),
      saveReport: (r) => local.saveReport(r),
      deleteReport: (id) => local.deleteReport(id),
      deleteMyData: () => local.deleteMyData(),
      saveAssessment: async (a) => {
        calls++;
        if (calls === 1) throw new RepositoryError("network", "offline");
        return local.saveAssessment(a);
      },
    };
    await expect(migrateLegacyAssessment(flaky, "2026-08-01", storage)).rejects.toThrow("offline");
    const pending = JSON.parse(storage.getItem(LEGACY_MIGRATION_KEY)!);
    expect(pending.status).toBe("pending");
    const stored = await migrateLegacyAssessment(flaky, "2026-08-01", storage);
    expect(stored?.clientId).toBe(pending.clientId);
  });

  it("preserveLegacyAssessment keeps a copy even after the draft is rewritten in the new format", () => {
    const storage = new MemoryStorage();
    storage.setItem(ASSESSMENT_STORAGE_KEY, legacyJson);
    preserveLegacyAssessment(storage);
    // the app then rewrites the draft (new format includes assessedOn)
    storage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify({ ...DRAFT, assessedOn: "" }));
    expect(findLegacyAssessment(storage)?.glucose).toBe("156");
    expect(storage.getItem(LEGACY_SNAPSHOT_KEY)).toBe(legacyJson);
  });

  it("preserveLegacyAssessment does nothing for new-format drafts", () => {
    const storage = new MemoryStorage();
    storage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify({ ...DRAFT, assessedOn: "" }));
    preserveLegacyAssessment(storage);
    expect(storage.getItem(LEGACY_SNAPSHOT_KEY)).toBeNull();
  });

  it("dismiss hides the offer without touching the record", () => {
    const storage = new MemoryStorage();
    storage.setItem(ASSESSMENT_STORAGE_KEY, legacyJson);
    dismissLegacyAssessment(storage);
    expect(findLegacyAssessment(storage)).toBeNull();
    expect(storage.getItem(ASSESSMENT_STORAGE_KEY)).toBe(legacyJson);
  });
});

/* ---------------- Supabase mapping ---------------- */

describe("Supabase payloads and row mapping", () => {
  it("assessment payload carries no identifying fields and the derived measurements", () => {
    const p = saveAssessmentPayload(newAssessment("c-1"));
    const text = JSON.stringify(p);
    expect(text).not.toContain("Asha");
    expect(text).not.toContain("Vellore");
    expect(text).not.toContain("asha-lab-report");
    expect(p.engine_version).toBe("1.1.0");
    expect(p.measurements).toHaveLength(7);
  });

  it("report payload blanks the numbers of rejected values", () => {
    const p = saveReportPayload(REPORT);
    const rejected = p.values.find((v) => v.status === "rejected")!;
    expect(rejected.extracted_value).toBe("");
    expect(rejected.final_value).toBe("");
  });

  it("snapshotFromRow accepts object or array embeds and skips incomplete rows", () => {
    const result = runAssessment(DRAFT);
    const base = { id: "1", client_id: "c", created_at: "2026-09-01T00:00:00Z", assessed_on: "2026-09-01", engine_version: "1.1.0", input: sanitizeAssessmentInput(DRAFT) };
    expect(snapshotFromRow({ ...base, assessment_results: { result } } as SnapshotRow)?.result.concernScore).toBe(result.concernScore);
    expect(snapshotFromRow({ ...base, assessment_results: [{ result }] } as SnapshotRow)?.id).toBe("1");
    expect(snapshotFromRow({ ...base, assessment_results: null } as SnapshotRow)).toBeNull();
  });
});

describe("normalizeStoredResult", () => {
  it("passes current-engine results through unchanged", () => {
    const r = runAssessment(DRAFT);
    expect(normalizeStoredResult(r)).toBe(r);
  });

  it("marks a legacy (engine 1.0.0) result without recalculating its score or level", () => {
    const legacy = {
      engineVersion: "1.0.0",
      concernLevel: "Moderate",
      concernScore: 4,
      redFlags: [],
      indicators: [],
      riskFactors: [],
      recommendations: [],
    } as unknown as ReturnType<typeof runAssessment>;
    const n = normalizeStoredResult(legacy);
    expect(n).toMatchObject({ legacy: true, concernScore: 4, concernLevel: "Moderate", factors: [] });
    expect(n.safety.isUrgent).toBe(false);
  });
});
