/**
 * SupabaseRepository with a FAKE client (no network): session handling and
 * error mapping. Real-database behaviour is covered by
 * supabase.integration.test.ts (npm run test:supabase).
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "./supabaseRepository";
import { RepositoryError } from "./healthRepository";

function fakeClient(opts: { signInError?: { message: string; status?: number }; queryError?: { message: string; code?: string } } = {}) {
  let session: object | null = null;
  const calls = { signIn: 0, getSession: 0 };
  const result = () => Promise.resolve(opts.queryError ? { data: null, error: opts.queryError } : { data: [], error: null });
  const query = { select: () => query, eq: () => query, delete: () => query, single: () => result(), then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => result().then(res, rej) };
  const client = {
    auth: {
      getSession: async () => {
        calls.getSession++;
        return { data: { session } };
      },
      signInAnonymously: async () => {
        calls.signIn++;
        await new Promise((r) => setTimeout(r, 10)); // network latency
        if (opts.signInError) return { data: {}, error: opts.signInError };
        session = { user: { id: "u1" } };
        return { data: { user: { id: "u1" } }, error: null };
      },
    },
    from: () => query,
    rpc: () => result(),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("SupabaseRepository session handling", () => {
  it("browsing without a session creates no user and returns empty history", async () => {
    const { client, calls } = fakeClient();
    const repo = new SupabaseRepository(client);
    expect(await repo.loadHistory()).toEqual({ assessments: [], measurements: [], reports: [] });
    await repo.deleteMyData();
    expect(calls.signIn).toBe(0);
  });

  it("the first write signs in anonymously ONCE, even with parallel requests", async () => {
    const { client, calls } = fakeClient();
    const repo = new SupabaseRepository(client);
    await Promise.all([repo.deleteAssessment("a"), repo.deleteAssessment("b"), repo.deleteReport("c")]);
    expect(calls.signIn).toBe(1);
    await repo.loadHistory(); // session now exists -> reused
    expect(calls.signIn).toBe(1);
  });

  it("a rate-limited sign-in is reported clearly and can be retried", async () => {
    const { client, calls } = fakeClient({ signInError: { message: "Request rate limit reached", status: 429 } });
    const repo = new SupabaseRepository(client);
    await expect(repo.deleteAssessment("a")).rejects.toMatchObject({ code: "rate-limited" });
    await expect(repo.deleteAssessment("a")).rejects.toBeInstanceOf(RepositoryError);
    expect(calls.signIn).toBe(2); // not stuck on the first failure
  });

  it("any other sign-in failure becomes an 'auth' error", async () => {
    const repo = new SupabaseRepository(fakeClient({ signInError: { message: "Anonymous sign-ins are disabled", status: 422 } }).client);
    await expect(repo.deleteAssessment("a")).rejects.toMatchObject({ code: "auth" });
  });

  it("network failures are reported as 'network', constraint violations as 'invalid'", async () => {
    const net = new SupabaseRepository(fakeClient({ queryError: { message: "TypeError: Failed to fetch" } }).client);
    await expect(net.deleteAssessment("a")).rejects.toMatchObject({ code: "network" });
    const invalid = new SupabaseRepository(fakeClient({ queryError: { message: "violates check constraint", code: "23514" } }).client);
    await expect(invalid.deleteAssessment("a")).rejects.toMatchObject({ code: "invalid" });
  });
});
