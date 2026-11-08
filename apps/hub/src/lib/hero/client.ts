import "server-only";

/**
 * Hero partner API v1 — the one call Phase 1 makes.
 *
 *   POST {HERO_API_BASE}/api/rens/status   Authorization: Bearer HERO_API_KEY
 *   body { email } or { phone }            → { found, account_created_at, first_login_at, last_login_at }
 *
 * Contract: kamal\ag-warriors-hero\docs\integrations\HERO-API-v1.md (live
 * 13 Oct 2026). Fields are only ever added, so Phase 2's `country` and
 * `membership_status` are read when present and ignored when not. POST, not
 * GET, so the identifier never sits in a URL or a log. The key is a Worker
 * secret; this module never reads it anywhere but here, and never returns it.
 */

export type HeroStatus =
  | { configured: false }
  | { configured: true; ok: true; found: false }
  | {
      configured: true; ok: true; found: true;
      accountCreatedAt: string | null; firstLoginAt: string | null; lastLoginAt: string | null;
      country: string | null; membershipStatus: string | null;
    }
  | { configured: true; ok: false; kind: "auth" | "rate_limit" | "upstream" | "network" | "bad_response"; status?: number };

const BASE = () => (process.env.HERO_API_BASE ?? "https://m4u-api.iqiaggroup.workers.dev").replace(/\/$/, "");

export function heroConfigured(): boolean {
  return !!process.env.HERO_API_KEY;
}

/** Pure, so it is unit-tested: the response body → our shape. */
export function parseHeroStatus(body: unknown): Extract<HeroStatus, { ok: true }> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.found === false) return { configured: true, ok: true, found: false };
  if (b.found !== true) return null;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    configured: true, ok: true, found: true,
    accountCreatedAt: str(b.account_created_at),
    firstLoginAt: str(b.first_login_at),
    lastLoginAt: str(b.last_login_at),
    country: str(b.country),
    membershipStatus: str(b.membership_status),
  };
}

export async function heroRenStatus(query: { email: string } | { phone: string }): Promise<HeroStatus> {
  const key = process.env.HERO_API_KEY;
  if (!key) return { configured: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${BASE()}/api/rens/status`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(query),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) return { configured: true, ok: false, kind: "auth", status: res.status };
    if (res.status === 429) return { configured: true, ok: false, kind: "rate_limit", status: 429 };
    if (!res.ok) return { configured: true, ok: false, kind: "upstream", status: res.status };
    const parsed = parseHeroStatus(await res.json().catch(() => null));
    return parsed ?? { configured: true, ok: false, kind: "bad_response", status: res.status };
  } catch {
    return { configured: true, ok: false, kind: "network" };
  } finally {
    clearTimeout(timer);
  }
}
