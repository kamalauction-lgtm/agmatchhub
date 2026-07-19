"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function savePushSubscription(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const parsed = z
    .object({
      endpoint: z.string().url().max(1000),
      p256dh: z.string().min(10).max(300),
      auth: z.string().min(5).max(100),
    })
    .safeParse({
      endpoint: formData.get("endpoint"),
      p256dh: formData.get("p256dh"),
      auth: formData.get("auth"),
    });
  if (!parsed.success) return;

  await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
    },
    { onConflict: "endpoint" },
  );
}
