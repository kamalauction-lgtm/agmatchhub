import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit";
import { parseFeed, planRates, type RateRow } from "./fx-plan";

/**
 * The daily exchange-rate refresh, run by the scheduler (api/cron).
 *
 * Where the rates come from is configuration, not code (hard rule 12):
 * FX_RATES_URL, with an optional FX_RATES_FALLBACK_URL tried when the first
 * does not answer. Unset means the task reports "not configured" and the rates
 * stay as they are — listings then show only the figures that can still be
 * computed. The feed is public market data; nothing about our users or
 * listings is sent to it.
 *
 * Runs with the service client because fx_rates is written by nobody else and
 * the scheduler has no user session; it touches that one table.
 */

const SEED_SOURCES = ["demo-seed"];
const TIMEOUT_MS = 8000;

async function fetchFeed(url: string) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return parseFeed(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshFxRates(): Promise<Record<string, unknown>> {
  const urls = [process.env.FX_RATES_URL, process.env.FX_RATES_FALLBACK_URL].filter((u): u is string => !!u && /^https:\/\//.test(u));
  if (!urls.length) return { skipped: "fx_not_configured" };

  const service = createServiceClient();
  const [{ data: listed, error: lErr }, { data: previous, error: pErr }] = await Promise.all([
    service.from("international_listings").select("currency").neq("status", "withdrawn"),
    service.from("fx_rates").select("currency, per_usd, as_of, source"),
  ]);
  if (lErr || pErr) return { error: (lErr ?? pErr)!.message };

  // Rupiah always: it is the figure every listing leads with.
  const wanted = [...new Set(["IDR", ...(listed ?? []).map((r) => String(r.currency))])];

  let incoming = null;
  let host = "";
  for (const url of urls) {
    incoming = await fetchFeed(url);
    if (incoming) {
      host = new URL(url).host;
      break;
    }
  }
  if (!incoming) return { error: "fx_feed_unavailable" };

  const plan = planRates({
    incoming,
    previous: (previous ?? []).map((r) => ({ ...r, per_usd: Number(r.per_usd) })) as RateRow[],
    wanted,
    source: host,
    today: new Date().toISOString().slice(0, 10),
    untrustedSources: SEED_SOURCES,
  });

  if (plan.write.length) {
    const { error } = await service.from("fx_rates").upsert(plan.write, { onConflict: "currency" });
    if (error) return { error: error.message };
  }
  // Held rates are the interesting event: somebody should look at the feed.
  if (plan.held.length) {
    await logAudit({
      action: "fx_rates.held",
      entityType: "fx_rates",
      entityId: incoming.date,
      next: { held: plan.held, source: host },
    });
  }
  return { updated: plan.write.length, held: plan.held.map((h) => `${h.currency}:${h.reason}`), as_of: incoming.date, source: host };
}
