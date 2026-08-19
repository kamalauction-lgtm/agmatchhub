import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The hub's front door.
 *
 * This used to be a marketing landing page for MatchHub — hero, three pillars,
 * "create an agent account". That made sense when the hub was the whole
 * product. It is not any more: `www.propertiguru.id` is the public portal and
 * does the selling, and `hub.propertiguru.id` is the tool agents work in all
 * day. A marketing page in front of a tool is a door you have to walk past
 * every morning (Kamal, 10 Aug 2026).
 *
 * So it forwards: signed in goes to work, signed out goes to sign in. Nobody
 * lands on a page whose only purpose is to offer another link.
 *
 * The old page is not lost — it is in git, and if a public marketing page for
 * the agent platform is ever wanted it belongs on the marketplace side anyway.
 *
 * Registration is still reachable: /login links to /register, and the wanted
 * board stays public at /wanted for agents who arrive from a shared link.
 */

// Always evaluated per request — the answer depends on who is asking.
export const dynamic = "force-dynamic";

export default async function HubEntry() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
