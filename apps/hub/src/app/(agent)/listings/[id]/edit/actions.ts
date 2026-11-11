"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Edit a listing the agent owns.
 *
 * What this deliberately does NOT touch: moderation_state, is_featured,
 * quality_score and the rest. `guard_listing_moderation_fields()` refuses those
 * for anyone who is not an admin (00030, hardened in 00039), so the form simply
 * does not offer them — the database is the real gate, this just avoids
 * presenting a control that would fail.
 *
 * Editing a PUBLISHED listing sends it back for review. Changing the price or
 * the description of something already public, and having that go live with no
 * second look, is how a moderated marketplace stops being moderated. The one
 * exception is a draft, which was never public and has nothing to re-check.
 */

const schema = z.object({
  listingId: z.string().uuid(),
  title: z.string().trim().min(8).max(140),
  description: z.string().trim().min(20).max(4000),
  titleEn: z.string().trim().max(140).optional(),
  descriptionEn: z.string().trim().max(4000).optional(),
  price: z.coerce.number().positive().max(1_000_000_000_000),
  listingType: z.enum(["sale", "rent"]),
  rentPeriod: z.enum(["monthly", "yearly", ""]).optional(),
  bedrooms: z.union([z.coerce.number().int().min(0).max(50), z.literal("")]).optional(),
  bathrooms: z.union([z.coerce.number().int().min(0).max(50), z.literal("")]).optional(),
  buildingSize: z.union([z.coerce.number().positive().max(100000), z.literal("")]).optional(),
  landSize: z.union([z.coerce.number().positive().max(1000000), z.literal("")]).optional(),
});

const orNull = (v: number | "" | undefined) => (v === "" || v === undefined ? null : v);

export async function updateListing(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = String(formData.get("listingId") ?? "");
    redirect(`/listings/${id}/edit?error=invalid`);
  }
  const d = parsed.data;
  const supabase = await createClient();

  // Ownership is enforced by RLS, but read first so we know the current status
  // and can tell the agent what the edit did to it.
  const { data: before } = await supabase
    .from("listings")
    .select("id, status, property_id, price, title")
    .eq("id", d.listingId)
    .eq("agent_id", user.id)
    .maybeSingle();

  if (!before) redirect("/listings?error=not_found");

  // A published listing goes back for review when edited; so does a REJECTED
  // one (P1-a): fixing what the moderator asked for is how it is resubmitted.
  const backToReview = before.status === "published" || before.status === "rejected";

  const { error } = await supabase
    .from("listings")
    .update({
      title: d.title,
      description: d.description,
      title_en: d.titleEn || null,
      description_en: d.descriptionEn || null,
      price: d.price,
      listing_type: d.listingType,
      rent_period: d.listingType === "rent" ? d.rentPeriod || null : null,
      ...(backToReview ? { status: "pending_review" } : {}),
    })
    .eq("id", d.listingId);

  if (error) {
    console.error("listing update failed:", error.message);
    redirect(`/listings/${d.listingId}/edit?error=save_failed`);
  }

  // Property facts live on `properties`, not `listings`.
  const { error: propError } = await supabase
    .from("properties")
    .update({
      bedrooms: orNull(d.bedrooms),
      bathrooms: orNull(d.bathrooms),
      building_size: orNull(d.buildingSize),
      land_size: orNull(d.landSize),
    })
    .eq("id", before.property_id);

  // Checked rather than fired and forgotten — an RLS refusal here has looked
  // like success twice before in this codebase (00034, 00037).
  if (propError) console.error("property update failed:", propError.message);

  await logAudit({
    action: "listing.edited",
    entityType: "listing",
    entityId: d.listingId,
    next: {
      title: d.title,
      price: d.price,
      price_was: before.price,
      returned_to_review: backToReview,
    },
  });

  revalidatePath("/listings");
  redirect(`/listings?edited=${backToReview ? "review" : "1"}`);
}
