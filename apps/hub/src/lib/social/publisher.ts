import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { publishToFacebookPage, publishToInstagram } from "@/lib/social/meta";

/**
 * The publishing sweep: claim due rows, post them, record what happened.
 *
 * Runs under the service role because it acts for many users with no session
 * of its own; the authz gate is upstream (the cron secret on the API route)
 * and every row it touches was created through the RLS-checked schedule
 * action. It writes outcomes onto scheduled_posts rather than the audit log —
 * log_audit() attributes to auth.uid(), which a cron context does not have,
 * and the row's status/attempts/error trail IS the record the agent sees.
 *
 * Claiming is optimistic: UPDATE ... WHERE status='scheduled' per row. Two
 * overlapping sweeps cannot double-post — the second one's claim matches zero
 * rows and skips.
 */

type DueRow = {
  id: string;
  account_id: string;
  platform: "facebook_page" | "instagram_business";
  caption: string;
  image_url: string | null;
  attempt_count: number;
};

export type SweepResult = {
  claimed: number;
  published: number;
  failed: number;
};

export async function publishDuePosts(limit = 10): Promise<SweepResult> {
  const service = createServiceClient();
  const result: SweepResult = { claimed: 0, published: 0, failed: 0 };

  const { data: due, error } = await service
    .from("scheduled_posts")
    .select("id, account_id, platform, caption, image_url, attempt_count")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`due scan failed: ${error.message}`);

  for (const row of (due ?? []) as DueRow[]) {
    const { data: claimed } = await service
      .from("scheduled_posts")
      .update({ status: "publishing", attempt_count: row.attempt_count + 1 })
      .eq("id", row.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // canceled or claimed by a concurrent sweep
    result.claimed++;

    const fail = async (reason: string) => {
      result.failed++;
      await service
        .from("scheduled_posts")
        .update({ status: "failed", last_error: reason.slice(0, 500) })
        .eq("id", row.id);
    };

    const [{ data: account }, { data: secret }] = await Promise.all([
      service
        .from("social_accounts")
        .select("external_id, status")
        .eq("id", row.account_id)
        .maybeSingle(),
      service
        .from("social_account_secrets")
        .select("access_token")
        .eq("account_id", row.account_id)
        .maybeSingle(),
    ]);

    if (!account || account.status !== "active" || !secret) {
      await fail("account_unavailable");
      continue;
    }

    try {
      let externalId: string;
      if (row.platform === "instagram_business") {
        if (!row.image_url) {
          await fail("ig_image_missing");
          continue;
        }
        externalId = await publishToInstagram({
          igUserId: account.external_id,
          pageToken: secret.access_token,
          caption: row.caption,
          imageUrl: row.image_url,
        });
      } else {
        externalId = await publishToFacebookPage({
          pageId: account.external_id,
          pageToken: secret.access_token,
          caption: row.caption,
          imageUrl: row.image_url,
        });
      }

      result.published++;
      await service
        .from("scheduled_posts")
        .update({ status: "published", external_post_id: externalId, last_error: null })
        .eq("id", row.id);
    } catch (e) {
      // Meta error strings are agent-safe; tokens never appear in them.
      await fail(e instanceof Error ? e.message : "publish_failed");
    }
  }

  return result;
}
