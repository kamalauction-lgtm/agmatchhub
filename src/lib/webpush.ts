import "server-only";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Web-push delivery. No-op without VAPID keys. Failures never propagate;
 * expired subscriptions (404/410) are pruned automatically.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body?: string; href?: string },
): Promise<void> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;

  const service = createServiceClient();
  const { data: subs } = await service
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs?.length) return;

  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT ?? "kamal.auction@gmail.com"}`,
    publicKey,
    privateKey,
  );

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 },
        );
      } catch (e: unknown) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await service.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("[push] send failed:", status ?? e);
        }
      }
    }),
  );
}
