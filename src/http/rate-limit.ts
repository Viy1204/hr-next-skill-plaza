// 站点没有登录，写接口对全网开放，而每次提交都会放大成一条群推送或一个云空间
// 文件。这里只做进程内的朴素滑窗节流：按来源 IP 记时间戳，窗口内超额即拒。
// 不追求精确 —— 多个 Next worker 各有一份计数、重启即清零都可接受，它挡的是
// 无脑脚本刷屏，不是有心人。

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number = 60 * 60 * 1000,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const kept = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length >= this.limit) {
      this.hits.set(key, kept);
      return false;
    }
    kept.push(now);
    this.hits.set(key, kept);
    // 键随来源 IP 无限增长，偶尔全量清一遍过期项，封住内存。
    if (this.hits.size > 10_000) {
      for (const [k, times] of this.hits) {
        const alive = times.filter((t) => t > cutoff);
        if (alive.length === 0) this.hits.delete(k);
        else this.hits.set(k, alive);
      }
    }
    return true;
  }

  reset() {
    this.hits.clear();
  }
}
