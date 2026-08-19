import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { metaConfigured, oauthStartUrl } from "@/lib/social/meta";

/**
 * Kick off the Meta OAuth dance for connecting FB Pages / IG Business
 * accounts. The state cookie is the CSRF check the callback verifies —
 * without it, anyone could complete a connect flow into a victim's session.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  if (!metaConfigured()) {
    return NextResponse.redirect(`${origin}/studio/accounts?error=not_configured`);
  }

  const state = crypto.randomUUID();
  const response = NextResponse.redirect(oauthStartUrl(state));
  response.cookies.set("meta_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/social/oauth",
  });
  return response;
}
