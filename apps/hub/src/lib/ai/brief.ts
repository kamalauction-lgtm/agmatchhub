import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sha256Hex, canonical } from "@pg/ai";
import { createClient } from "@/lib/supabase/server";
import { runAi, type DeniedReason } from "./engine";
import type { Brief, DashboardCounts } from "@/lib/dashboard/brief";

/**
 * The AI Manager's paragraph — the prose layer over the rules-only brief.
 *
 * The ranked action list is computed by `lib/dashboard/brief.ts` from live
 * counts and needs no model. What the model adds is the sentence an agent
 * reads before the list: today's single most important thing, said plainly,
 * in their language. It is generated at most once per agent per day, cached
 * in `ai_briefs`, and regenerated only when the counts that fed it change or
 * the agent presses "regenerate".
 *
 * A denial (quota, caps, no key) is cached too, as `source = 'rules'`, so a
 * dashboard reloaded twenty times does not write twenty denied ledger rows.
 * The dashboard then shows exactly what it showed before AI existed.
 */

export type AiBriefResult = {
  paragraph: string | null;
  source: "ai" | "rules";
  /** Why there is no paragraph, when there is none. */
  reason?: DeniedReason | "failed";
  model?: string | null;
  fromCache: boolean;
};

const schema = z.object({
  paragraph: z.string().min(20).max(700),
  tone: z.enum(["calm", "urgent"]).default("calm"),
});

/** YYYY-MM-DD in the agents' time zone — the brief is a morning thing. */
export function briefDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function getAiBrief(opts: {
  userId: string;
  locale: string;
  firstName: string;
  brief: Brief;
  counts: DashboardCounts;
  /** The action labels already translated for the agent, in order. */
  actionLabels: string[];
  client?: SupabaseClient;
  force?: boolean;
}): Promise<AiBriefResult> {
  const db = opts.client ?? (await createClient());
  const today = briefDate();
  const actions = opts.brief.actions.map((a, i) => ({ key: a.key, count: a.count, text: opts.actionLabels[i] ?? a.key, href: a.href }));
  const countsHash = await sha256Hex(canonical({ d: today, l: opts.locale, a: actions.map((a) => [a.key, a.count]) }));

  if (!opts.force) {
    const { data: cached } = await db
      .from("ai_briefs")
      .select("source, paragraph, model, counts_hash, reason")
      .eq("user_id", opts.userId)
      .eq("brief_date", today)
      .maybeSingle();
    if (cached && cached.counts_hash === countsHash) {
      return {
        paragraph: cached.paragraph, source: cached.source as "ai" | "rules", model: cached.model,
        reason: (cached.reason as AiBriefResult["reason"]) ?? undefined, fromCache: true,
      };
    }
  }

  // Nothing to say when nothing is waiting: the rules text covers it, and a
  // model call to congratulate someone is not what the allowance is for.
  if (opts.brief.allClear) {
    await db.rpc("ai_upsert_brief", {
      p_user: opts.userId, p_date: today, p_locale: opts.locale, p_source: "rules", p_paragraph: null,
      p_actions: actions, p_counts_hash: countsHash, p_model: null,
    });
    return { paragraph: null, source: "rules", fromCache: false };
  }

  const res = await runAi(
    "brief",
    {
      agent_name: opts.firstName || "there",
      today,
      actions,
      counts: opts.counts,
    },
    schema,
    { userId: opts.userId, locale: opts.locale, refType: "brief", client: opts.client },
  );

  if (res.ok) {
    await db.rpc("ai_upsert_brief", {
      p_user: opts.userId, p_date: today, p_locale: opts.locale, p_source: "ai", p_paragraph: res.output.paragraph,
      p_actions: actions, p_counts_hash: countsHash, p_model: `${res.provider}/${res.model}`,
    });
    return { paragraph: res.output.paragraph, source: "ai", model: `${res.provider}/${res.model}`, fromCache: false };
  }

  // Cache the miss for today — with its reason — so the ledger is not flooded
  // by page views and the footer can still say why.
  const reason: AiBriefResult["reason"] = res.kind === "denied" ? res.reason : "failed";
  await db.rpc("ai_upsert_brief", {
    p_user: opts.userId, p_date: today, p_locale: opts.locale, p_source: "rules", p_paragraph: null,
    p_actions: actions, p_counts_hash: countsHash, p_model: null, p_reason: reason,
  });
  return { paragraph: null, source: "rules", reason, fromCache: false };
}
