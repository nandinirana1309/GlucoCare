/**
 * Chooses the HealthRepository for this build:
 *   Supabase configured -> SupabaseRepository (primary, cloud)
 *   otherwise           -> LocalRepository (this device only)
 *
 * There is deliberately NO silent fallback from Supabase to localStorage on
 * a failed save: that would split history across two places. A failed save
 * keeps the draft and shows a retry instead.
 */

import { isSupabaseConfigured, supabase } from "../supabaseClient";
import type { HealthRepository } from "./healthRepository";
import { LocalRepository } from "./localRepository";
import { SupabaseRepository } from "./supabaseRepository";

export function createHealthRepository(): HealthRepository {
  if (isSupabaseConfigured && supabase) return new SupabaseRepository(supabase);
  return new LocalRepository();
}

export type { HealthRepository, RepositoryMode } from "./healthRepository";
export { RepositoryError, describeRepositoryError } from "./healthRepository";
