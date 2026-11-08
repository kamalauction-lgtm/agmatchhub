import { NextResponse } from "next/server";
import { metaConfigured } from "@/lib/social/meta";
import { publishDuePosts } from "@/lib/social/publisher";

/**
 * The cron tick: publish everything due. Called every few minutes by an
 * external scheduler (a Cloudflare cron worker, or `curl` while testing) —
 * the OpenNext worker itself has no scheduled handler, so the tick arrives
 * over HTTP, gated by a shared secret.
 *
 *   curl -X POST https://hub.propertiguru.id/api/social/publish-due \
 *        -H "x-cron-secret: $SOCIAL_CRON_SECRET"
 *
 * Idempotent and race-safe: rows are claimed with a conditional update, so
 * overlapping ticks skip each other's work rather than double-posting.
 */
export async function POST(request: Request) {
  const secret = process.env.SOCIAL_CRON_SECRET;
  if (!secret || !metaConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await publishDuePosts(10);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[publish-due]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }
}
