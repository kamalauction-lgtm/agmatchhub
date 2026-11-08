"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Turn the operating group's identity on or off across both apps.
 *
 * This is a one-click switch with a wide blast radius — it changes what every
 * visitor to the marketplace and every agent in the hub sees. So it is
 * confirmed in the UI, audited here, and the activation date is stamped by the
 * database rather than by this action, which keeps it accurate even if the row
 * is ever changed by another path.
 */

const schema = z.object({ enable: z.enum(["true", "false"]) });

export async function setPartnerIdentity(formData: FormData): Promise<void> {
  await requireCapability("platform.configure");
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/identity?error=invalid");

  const enable = parsed.data.enable === "true";
  const supabase = await createClient();

  const { error } = await supabase
    .from("brand_settings")
    .update({ partner_identity_public: enable })
    .eq("id", 1);

  if (error) redirect("/admin/identity?error=save_failed");

  await logAudit({
    action: enable ? "identity.activated" : "identity.hidden",
    entityType: "brand_settings",
    entityId: "1",
    next: { partner_identity_public: enable },
  });

  // Both apps read this. The marketplace is a separate deployment with its own
  // cache, so its homepage picks the change up on its next revalidation rather
  // than instantly — said plainly in the UI instead of pretending otherwise.
  revalidatePath("/", "layout");

  redirect(`/admin/identity?done=${enable ? "activated" : "hidden"}`);
}
