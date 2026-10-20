import type { HrFunction } from "@/domain/types";
import type { SkillEntryView, WishView } from "./use-cases";

const CACHE_TTL_MS = 60_000;
/**
 * 陈旧值的兜底窗口。飞书读失败时，页面宁可显示上一次成功读到的旧数据，
 * 也不要整页 500 —— 对社群小站来说，「目录少更新了一会儿」比「链接点开是
 * 报错页」好得多。超过这个窗口还没读到新数据，就把错误原样抛出去，
 * 不拿过期数据无限期糊墙。
 *
 * 窗口取 60 分钟而不是 10 分钟，因为这是个流量很低的小站：两次访问隔一
 * 半小时是常态，10 分钟的窗口在这种节奏下形同虚设 —— 线上实测到两次访问
 * 相隔 31 分钟，第二次撞上飞书限流时旧数据刚好过期，兜底没接住，首页又
 * 退化成了「暂时没加载出来」。目录和许愿的变动是天级的，半小时前的数据
 * 比一句报错有用得多。
 */
const STALE_FALLBACK_MS = 60 * 60_000;

interface PageReadQueryLoaders {
  loadSkillEntries(): Promise<SkillEntryView[]>;
  loadWishes(): Promise<WishView[]>;
  now?: () => number;
}

function cachedForOneMinute<T>(load: () => Promise<T>, now: () => number) {
  let cache: { value: Promise<T>; expiresAt: number } | undefined;
  /** 上一次成功读到的值，连同它成功的时刻 —— 失败时的兜底来源。 */
  let lastGood: { value: T; at: number } | undefined;

  return async () => {
    if (!cache || cache.expiresAt <= now()) {
      const value = load();
      cache = { value, expiresAt: now() + CACHE_TTL_MS };
      value.then(
        (resolved) => {
          lastGood = { value: resolved, at: now() };
        },
        () => {
          if (cache?.value === value) cache = undefined;
        },
      );
    }
    try {
      return await cache.value;
    } catch (error) {
      // 飞书暂时不可用：退回上次成功读到的值，别把整页拖成 500。
      if (lastGood && now() - lastGood.at <= STALE_FALLBACK_MS) {
        console.warn("serving stale page data after a failed read", { ageMs: now() - lastGood.at });
        return lastGood.value;
      }
      throw error;
    }
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
