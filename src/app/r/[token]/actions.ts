"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { signLinkSession, linkCookieName } from "@/lib/request-links";

const MAX_FAILS_PER_10MIN = 8;

/** Password gate for a request link (§15). Public — no user session required. */
export async function unlockRequestLink(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "").trim().toUpperCase();
  if (!token || token.length > 64) redirect("/");

  const service = createServiceClient();
  const { data: link } = await service
    .from("request_links")
    .select("id, password, active, expires_at, max_access_count, access_count")
    .eq("token", token)
    .maybeSingle();

  // Same response for unknown token vs wrong password (no enumeration)
  if (!link || !link.active || new Date(link.expires_at) < new Date()) {
    redirect(`/r/${encodeURIComponent(token)}?error=wrong`);
  }
  if (link.max_access_count != null && link.access_count >= link.max_access_count) {
    redirect(`/r/${encodeURIComponent(token)}?error=wrong`);
  }

  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;

  // Rate limit: too many failures in the last 10 minutes locks the gate
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: fails } = await service
    .from("request_link_access_logs")
    .select("id", { count: "exact", head: true })
    .eq("link_id", link.id)
    .eq("event", "password_fail")
    .gte("created_at", since);
  if ((fails ?? 0) >= MAX_FAILS_PER_10MIN) {
    await service.from("request_link_access_logs").insert({
      link_id: link.id, event: "locked_out", user_agent: ua,
    });
    redirect(`/r/${encodeURIComponent(token)}?error=locked`);
  }

  if (password !== link.password.toUpperCase()) {
    await service.from("request_link_access_logs").insert({
      link_id: link.id, event: "password_fail", user_agent: ua,
    });
    redirect(`/r/${encodeURIComponent(token)}?error=wrong`);
  }

  await service.from("request_link_access_logs").insert({
    link_id: link.id, event: "password_ok", user_agent: ua,
  });
  await service
    .from("request_links")
    .update({ access_count: link.access_count + 1 })
    .eq("id", link.id);

  (await cookies()).set(linkCookieName(link.id), signLinkSession(link.id), {
    path: `/r`,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
  });

  redirect(`/r/${encodeURIComponent(token)}`);
}
