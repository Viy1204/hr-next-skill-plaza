import { InMemoryBitable, InMemoryNotifier, InMemoryStorage, type Seed } from "@/adapters/in-memory";
import type { Deps } from "@/app/use-cases";

// The one and only way to build a test environment. Every test uses this — do
// not stand up ports by hand in a test file. The two in-memory ports are the
// system's only seam; everything between the HTTP boundary and them runs for real.

export const BASE_URL = "https://plaza.test";

export function harness(seed: Seed = {}) {
  const bitable = new InMemoryBitable(seed);
  const notifier = new InMemoryNotifier();
  const storage = new InMemoryStorage();
  const deps: Deps = { bitable, notifier, storage, baseUrl: BASE_URL };
  return { deps, bitable, notifier, storage };
}

export function get(path: string, cookieHeader?: string) {
  return new Request(`${BASE_URL}${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

export function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Pull one cookie's value back out of a response so a follow-up request can send it. */
export function cookieFrom(response: Response, name: string) {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    if (!pair) continue;
    const index = pair.indexOf("=");
    if (index !== -1 && pair.slice(0, index) === name) return pair;
  }
  return undefined;
}
