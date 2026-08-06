import type { HrFunction } from "@/domain/types";
import type { SkillEntryView, WishView } from "./use-cases";

const CACHE_TTL_MS = 60_000;

interface PageReadQueryLoaders {
  loadSkillEntries(): Promise<SkillEntryView[]>;
  loadWishes(): Promise<WishView[]>;
  now?: () => number;
}

function cachedForOneMinute<T>(load: () => Promise<T>, now: () => number) {
  let cache: { value: Promise<T>; expiresAt: number } | undefined;
  return async () => {
    if (!cache || cache.expiresAt <= now()) {
      const value = load();
      cache = { value, expiresAt: now() + CACHE_TTL_MS };
      value.catch(() => {
        if (cache?.value === value) cache = undefined;
      });
    }
    return cache.value;
  };
}

export function createPageReadQueries(loaders: PageReadQueryLoaders) {
  const now = loaders.now ?? Date.now;
  const skillEntries = cachedForOneMinute(loaders.loadSkillEntries, now);
  const wishes = cachedForOneMinute(loaders.loadWishes, now);

  return {
    async listSkillEntries(filter: { hrFunction?: HrFunction; query?: string } = {}) {
      const entries = await skillEntries();
      const needle = filter.query?.trim().toLowerCase();
      return entries.filter((entry) => {
        if (filter.hrFunction && entry.hrFunction !== filter.hrFunction) return false;
        return !needle || `${entry.name} ${entry.description}`.toLowerCase().includes(needle);
      });
    },
    async listWishes(filter: { hrFunction?: HrFunction } = {}) {
      const allWishes = await wishes();
      return filter.hrFunction ? allWishes.filter((wish) => wish.hrFunction === filter.hrFunction) : allWishes;
    },
  };
}
