import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit";
import { exchangeCodeForLongLivedToken, fetchPages, metaConfigured } from "@/lib/social/meta";

/**
 * Meta OAuth return leg. Exchanges the code, discovers the user's FB Pages and
 * linked IG Business accounts, and stores them as publish destinations.
 *
 * Service client use is legitimate here (the rule: only after an explicit
 * authz check): the session user is verified first, and every row written is
 * keyed to that user id. It has to be the service client because
 * social_accounts inserts are deliberately closed to `authenticated` — an
 * agent must not be able to forge a destination row pointing at a page they
 * do not control; only this flow, which just heard it from Meta, may write one.
 *
 * Tokens go to social_account_secrets (no RLS policies — service role only)
 * and are never logged, never audited, never returned to the browser.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(`${origin}/studio/accounts?${q}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  if (!metaConfigured()) return back("error=not_configured");

  // The user pressed "cancel" on Meta's consent screen — not an error of ours.
  if (searchParams.get("error")) return back("error=denied");

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("meta_oauth_state")?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return back("error=state_mismatch");
  }

  try {
    const { token: userToken, expiresAt } = await exchangeCodeForLongLivedToken(code);
    const pages = await fetchPages(userToken);
    if (!pages.length) return back("error=no_pages");

    const service = createServiceClient();
    let connected = 0;

    for (const page of pages) {
      // The page itself.
      const { data: fbAccount, error: fbErr } = await service
        .from("social_accounts")
        .upsert(
          {
            user_id: user.id,
            platform: "facebook_page",
            external_id: page.id,
            display_name: page.name,
            expires_at: expiresAt.toISOString(),
            status: "active",
          },
          { onConflict: "user_id,platform,external_id" }
        )
        .select("id")
        .single();
      if (fbErr || !fbAccount) continue;

      await service.from("social_account_secrets").upsert({
        account_id: fbAccount.id,
        access_token: page.access_token,
        updated_at: new Date().toISOString(),
      });
      connected++;

      // Its linked Instagram Business account, if any. Publishing to IG uses
      // the PAGE token with the IG user id — that is how the Graph API works.
      const ig = page.instagram_business_account;
      if (ig?.id) {
        const { data: igAccount, error: igErr } = await service
          .from("social_accounts")
          .upsert(
            {
              user_id: user.id,
              platform: "instagram_business",
              external_id: ig.id,
              display_name: ig.name ?? page.name,
              username: ig.username ?? null,
              expires_at: expiresAt.toISOString(),
              status: "active",
            },
            { onConflict: "user_id,platform,external_id" }
          )
          .select("id")
          .single();
        if (!igErr && igAccount) {
          await service.from("social_account_secrets").upsert({
            account_id: igAccount.id,
            access_token: page.access_token,
            updated_at: new Date().toISOString(),
          });
          connected++;
        }
      }
    }

    await logAudit({
      action: "social.accounts_connected",
      entityType: "social_account",
      next: { count: connected },
    });

    const response = back(`connected=${connected}`);
    response.cookies.delete("meta_oauth_state");
    return response;
  } catch (e) {
    console.error("[social oauth] connect failed:", e instanceof Error ? e.message : e);
    return back("error=connect_failed");
  }
}
