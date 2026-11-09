"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { locales } from "@/i18n/request";
import { createClient } from "@/lib/supabase/server";

/**
 * The language switcher. The cookie is the explicit choice for this browser;
 * the same choice is also saved to the profile so it follows the agent to
 * other devices and is what notifications and the first sign-in use. Saving
 * is best-effort: a failed profile write never blocks the switch.
 */
export async function setLocale(formData: FormData) {
  const locale = String(formData.get("locale"));
  if (!(locales as readonly string[]).includes(locale)) return;
  (await cookies()).set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("profiles").update({ preferred_language: locale }).eq("id", user.id);
  } catch {
    /* cookie already set; the preference simply stays per-browser */
  }
  revalidatePath("/", "layout");
}
