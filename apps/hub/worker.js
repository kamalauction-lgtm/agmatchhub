/**
 * Custom Worker entry: the OpenNext handler plus a Cloudflare Cron Trigger.
 *
 * `opennextjs-cloudflare build` writes `.open-next/worker.js`, which serves
 * the Next app but has no `scheduled` export. wrangler.jsonc points `main`
 * here instead; this file re-exports everything OpenNext needs and adds the
 * cron, which calls the app's own `/api/cron` route IN-PROCESS. Not with
 * fetch(): a Worker fetching its own custom domain is refused (error 1042 —
 * learned on Hero's worker), and in-process also means no public round trip.
 *
 * Schedules live in wrangler.jsonc `triggers.crons`. The route decides what
 * runs at each cadence; this file only delivers the tick.
 */
import handler from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,

  async scheduled(event, env, ctx) {
    const base = env.APP_BASE_URL || env.NEXT_PUBLIC_APP_URL;
    const secret = env.CRON_SECRET || env.SOCIAL_CRON_SECRET;
    if (!base || !secret) {
      console.error("[cron] APP_BASE_URL or CRON_SECRET missing; tick dropped");
      return;
    }
    // "0 23 * * *" is the daily tick (07:00 Kuala Lumpur / Jakarta); anything
    // else is the 15-minute one. The route filters tasks by cadence.
    const cadence = event.cron && event.cron.startsWith("0 23") ? "daily" : "15m";
    const request = new Request(`${base}/api/cron?cadence=${cadence}&source=cf-cron`, {
      method: "POST",
      headers: { "x-cron-secret": secret, "cf-cron": event.cron || "" },
    });
    ctx.waitUntil(
      handler.fetch(request, env, ctx).then(
        async (res) => console.log(`[cron ${cadence}] ${res.status} ${(await res.text()).slice(0, 500)}`),
        (err) => console.error("[cron] failed", err && err.message),
      ),
    );
  },
};
