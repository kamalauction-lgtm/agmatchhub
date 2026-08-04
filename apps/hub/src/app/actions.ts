"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { locales } from "@/i18n/request";

export async function setLocale(formData: FormData) {
  const locale = String(formData.get("locale"));
  if (!(locales as readonly string[]).includes(locale)) return;
  (await cookies()).set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
