import { HR_FUNCTIONS, type HrFunction } from "@/domain/types";
import type { Deps } from "@/app/use-cases";
import { claimWish, createWish, endorseWish, submitPackage, syncDeliveries, takePackage } from "@/app/use-cases";

// Route handlers are plain (Request, Deps) => Response functions so tests can
// enter the system at the HTTP boundary without booting Next.js. The files under
// app/ are three-line wrappers that pass the real ports in.

const ANON_COOKIE = "aid";
const TAKEN_COOKIE = "taken";
const DEDUPE_WINDOW_KEY = "取得去重窗口小时";

function readCookies(request: Request): Record<string, string> {
  const header = request.headers.get("cookie");
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function anonymousId(request: Request): { id: string; isNew: boolean } {
  const existing = readCookies(request)[ANON_COOKIE];
  if (existing) return { id: existing, isNew: false };
  return { id: crypto.randomUUID(), isNew: true };
}

function cookie(name: string, value: string, maxAgeSeconds: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax`;
}

/**
 * Take dedupe state lives in the visitor's own cookie rather than a table. The
 * anonymous id must not become a stored, joinable trace of a person (ADR-0001's
 * no-identity stance), and the take count is an explicitly approximate figure —
 * losing dedupe when someone clears cookies is an acceptable cost. Endorsements
 * are different: they are the ranking signal, so their dedupe key is persisted.
 */
function parseTaken(raw: string | undefined): Map<string, number> {
  const entries = (raw ?? "")
    .split(",")
    .filter(Boolean)
    .flatMap((part) => {
      const [id, at] = part.split(":");
      const timestamp = Number(at);
      return id && Number.isFinite(timestamp) ? ([[id, timestamp]] as [string, number][]) : [];
    });
  return new Map(entries);
}

function serialiseTaken(taken: Map<string, number>) {
  return [...taken.entries()].map(([id, at]) => `${id}:${at}`).join(",");
}

export async function handleTake(request: Request, deps: Deps, packageId: string, now = Date.now()) {
  const config = await deps.bitable.getConfig();
  const windowHours = Number(config[DEDUPE_WINDOW_KEY]) || 24;
  const windowMs = windowHours * 60 * 60 * 1000;

  const cookies = readCookies(request);
  const taken = parseTaken(cookies[TAKEN_COOKIE]);
  for (const [id, at] of taken) if (now - at > windowMs) taken.delete(id);

  const outcome = await takePackage(deps, packageId, { alreadyTaken: taken.has(packageId) });
  if (!outcome?.redirectTo) return new Response("Not found", { status: 404 });

  taken.set(packageId, now);
  const headers = new Headers({ Location: outcome.redirectTo });
  headers.append("Set-Cookie", cookie(TAKEN_COOKIE, serialiseTaken(taken), Math.ceil(windowMs / 1000)));
  return new Response(null, { status: 302, headers });
}

function isHrFunction(value: unknown): value is HrFunction {
  return typeof value === "string" && (HR_FUNCTIONS as readonly string[]).includes(value);
}

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export async function handleCreateWish(request: Request, deps: Deps) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("invalid body");

  const { title, painScenario, hrFunction, painHours, wisherNickname } = body as Record<string, unknown>;
  if (typeof title !== "string" || !title.trim()) return badRequest("title is required");
  if (typeof painScenario !== "string" || !painScenario.trim()) return badRequest("painScenario is required");
  if (!isHrFunction(hrFunction)) return badRequest("hrFunction is not a known HR function");

  const hours = painHours === null || painHours === undefined || painHours === "" ? null : Number(painHours);
  if (hours !== null && !Number.isFinite(hours)) return badRequest("painHours must be a number");

  const wish = await createWish(deps, {
    title: title.trim(),
    painScenario: painScenario.trim(),
    hrFunction,
    painHours: hours,
    wisherNickname: typeof wisherNickname === "string" ? wisherNickname.trim() : "",
  });
  return Response.json({ id: wish.id }, { status: 201 });
}

const MAX_ENTRIES = 12;

function isHttpUrl(value: string) {
  return /^https?:\/\/\S+$/.test(value);
}

export async function handleSubmitPackage(request: Request, deps: Deps) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("invalid body");

  const { name, summary, carrier, takeUrl, prerequisites, submitterNickname, deliveredWishId, entries } =
    body as Record<string, unknown>;

  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  if (!text(name)) return badRequest("name is required");
  if (!text(summary)) return badRequest("summary is required");
  if (carrier !== "github" && carrier !== "zip") return badRequest("carrier must be github or zip");
  if (!isHttpUrl(text(takeUrl))) return badRequest("takeUrl must be an http(s) url");
  // 前置条件是目录的必填字段：取回去装不上，绝大多数是这一栏没写清楚。
  if (!text(prerequisites)) return badRequest("prerequisites is required");

  if (!Array.isArray(entries) || entries.length === 0) return badRequest("at least one entry is required");
  if (entries.length > MAX_ENTRIES) return badRequest(`at most ${MAX_ENTRIES} entries`);

  const parsed = [];
  for (const raw of entries) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    if (!text(entry.name)) return badRequest("entry name is required");
    if (!text(entry.description)) return badRequest("entry description is required");
    if (!isHrFunction(entry.hrFunction)) return badRequest("entry hrFunction is not a known HR function");
    parsed.push({
      name: text(entry.name),
      description: text(entry.description),
      hrFunction: entry.hrFunction,
    });
  }

  const pkg = await submitPackage(deps, {
    name: text(name),
    summary: text(summary),
    carrier,
    takeUrl: text(takeUrl),
    prerequisites: text(prerequisites),
    submitterNickname: text(submitterNickname),
    deliveredWishId: text(deliveredWishId) || null,
    entries: parsed,
  });
  if (!pkg) return badRequest("deliveredWishId does not match a wish");
  return Response.json({ id: pkg.id, reviewStatus: pkg.reviewStatus }, { status: 201 });
}

export async function handleEndorse(request: Request, deps: Deps, wishId: string) {
  const { id, isNew } = anonymousId(request);
  const outcome = await endorseWish(deps, wishId, id);
  if (!outcome) return new Response("Not found", { status: 404 });

  const response = Response.json(outcome);
  if (isNew) response.headers.append("Set-Cookie", cookie(ANON_COOKIE, id, 60 * 60 * 24 * 365));
  return response;
}

export async function handleClaim(request: Request, deps: Deps, wishId: string) {
  const body = await request.json().catch(() => null);
  const nickname = (body as { claimerNickname?: unknown } | null)?.claimerNickname;
  if (typeof nickname !== "string" || !nickname.trim()) return badRequest("claimerNickname is required");

  const note = (body as { note?: unknown }).note;
  const claim = await claimWish(deps, wishId, {
    claimerNickname: nickname.trim(),
    note: typeof note === "string" ? note.trim() : "",
  });
  if (!claim) return new Response("Not found", { status: 404 });
  return Response.json({ id: claim.id }, { status: 201 });
}

export async function handleSyncDeliveries(request: Request, deps: Deps, secret: string | undefined) {
  if (!secret || request.headers.get("x-sync-secret") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }
  const announced = await syncDeliveries(deps);
  return Response.json({ announced });
}
