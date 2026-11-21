"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { normalisePhone } from "@/lib/international/countries";

/**
 * Admin actions for the International section.
 *
 * Every write runs as the signed-in admin, so the policies of 00134 are the
 * real gate (a GLOBAL platform.configure grant); the capability check here
 * only decides where a refused person lands. Contact rows are audited by a
 * database trigger; coverage, publish/withdraw and enquiry handling are
 * audited here.
 */

const BASE = "/admin/international";

async function gate() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: allowed } = await supabase.rpc("has_capability", { p_capability: "platform.configure" });
  if (!allowed) redirect("/admin?denied=platform.configure");
  return { supabase, user };
}

/* -------------------------------------------------------------------------
 * People in charge
 * ---------------------------------------------------------------------- */

const noMarkup = /^[^<>]*$/;

const contactSchema = z.object({
  id: z.union([z.string().uuid(), z.literal("")]),
  displayName: z.string().trim().min(2).max(120).regex(noMarkup),
  phone: z.string().trim().min(1).max(40),
  email: z.union([z.literal(""), z.string().trim().max(200).regex(/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/)]),
  roleLabel: z.string().trim().max(80).regex(noMarkup),
  allCountries: z.boolean(),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(250),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  active: z.boolean(),
});

/** Ticked codes plus whatever was typed in "add another country code". */
function readCountries(formData: FormData): { codes: string[]; bad: boolean } {
  const ticked = formData.getAll("countries").map((v) => String(v).trim().toUpperCase());
  const typed = String(formData.get("extraCountries") ?? "")
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
  const all = [...new Set([...ticked, ...typed])];
  // Two letters is the shape; whether the runtime knows the region is the test.
  const known = (code: string) => {
    if (!/^[A-Z]{2}$/.test(code)) return false;
    try {
      return new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }).of(code) !== undefined;
    } catch {
      return false;
    }
  };
  return { codes: all.filter(known).sort(), bad: all.some((c) => !known(c)) };
}

export async function saveContact(formData: FormData) {
  const { supabase, user } = await gate();
  const id = String(formData.get("id") ?? "");
  const back = (error: string) =>
    redirect(`${BASE}?tab=contacts&error=${error}${id ? `&edit=${encodeURIComponent(id)}` : ""}#contact-form`);

  const { codes, bad } = readCountries(formData);
  if (bad) back("country_code");

  const parsed = contactSchema.safeParse({
    id,
    displayName: formData.get("displayName") ?? "",
    phone: formData.get("phone") ?? "",
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    roleLabel: formData.get("roleLabel") ?? "",
    allCountries: formData.get("allCountries") === "on",
    countries: codes,
    sortOrder: String(formData.get("sortOrder") ?? "").trim() || "100",
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return back("invalid");
  const v = parsed.data;

  const phone = normalisePhone(v.phone);
  if (!phone) return back("phone");
  // "All countries" makes the picked list irrelevant; without it, at least one
  // country is needed or the contact would never be reached.
  const countries = v.allCountries ? [] : v.countries;
  if (!v.allCountries && countries.length === 0) return back("coverage");

  const row = {
    display_name: v.displayName,
    phone,
    email: v.email || null,
    role_label: v.roleLabel || null,
    all_countries: v.allCountries,
    active: v.active,
    sort_order: v.sortOrder,
    updated_by: user.id,
  };

  let contactId = v.id;
  let before: string[] = [];
  if (contactId) {
    const { data: prev } = await supabase.from("country_contact_countries").select("country_code").eq("contact_id", contactId);
    before = (prev ?? []).map((r) => r.country_code as string).sort();
    const { data: updated, error } = await supabase.from("country_contacts").update(row).eq("id", contactId).select("id");
    if (error || !updated?.length) return back("save_failed");
  } else {
    const { data: created, error } = await supabase
      .from("country_contacts")
      .insert({ ...row, created_by: user.id })
      .select("id")
      .single();
    if (error || !created) return back("save_failed");
    contactId = created.id as string;
  }

  // Replace the coverage rows only when they changed.
  if (before.join(",") !== countries.join(",")) {
    const remove = before.filter((c) => !countries.includes(c));
    const add = countries.filter((c) => !before.includes(c));
    if (remove.length) {
      const { error } = await supabase.from("country_contact_countries").delete().eq("contact_id", contactId).in("country_code", remove);
      if (error) return redirect(`${BASE}?tab=contacts&error=coverage_failed&edit=${contactId}#contact-form`);
    }
    if (add.length) {
      const { error } = await supabase.from("country_contact_countries").insert(add.map((country_code) => ({ contact_id: contactId, country_code })));
      if (error) return redirect(`${BASE}?tab=contacts&error=coverage_failed&edit=${contactId}#contact-form`);
    }
    // The trigger audits the contact row; the countries live in a second table.
    await logAudit({
      action: "country_contact.coverage_set",
      entityType: "country_contact",
      entityId: contactId,
      previous: { countries: before },
      next: { countries, all_countries: v.allCountries },
    });
  }

  redirect(`${BASE}?tab=contacts&done=${v.id ? "contact_saved" : "contact_added"}`);
}

export async function setContactActive(formData: FormData) {
  const { supabase, user } = await gate();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) redirect(`${BASE}?tab=contacts&error=invalid`);
  const active = formData.get("active") === "true";
  const { data, error } = await supabase
    .from("country_contacts")
    .update({ active, updated_by: user.id })
    .eq("id", id.data)
    .select("id");
  if (error || !data?.length) redirect(`${BASE}?tab=contacts&error=save_failed`);
  redirect(`${BASE}?tab=contacts&done=${active ? "contact_activated" : "contact_deactivated"}`);
}

export async function deleteContact(formData: FormData) {
  const { supabase } = await gate();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) redirect(`${BASE}?tab=contacts&error=invalid`);
  // Coverage rows go with it (cascade); past enquiries keep their record and
  // lose only the link (set null). The trigger writes the audit row.
  const { data, error } = await supabase.from("country_contacts").delete().eq("id", id.data).select("id");
  if (error || !data?.length) redirect(`${BASE}?tab=contacts&error=save_failed`);
  redirect(`${BASE}?tab=contacts&done=contact_deleted`);
}

/* -------------------------------------------------------------------------
 * Listings: publish / withdraw
 * ---------------------------------------------------------------------- */

const listingSchema = z.object({
  id: z.string().uuid(),
  to: z.enum(["published", "withdrawn"]),
  country: z.union([z.literal(""), z.string().regex(/^[A-Z]{2}$/)]),
  status: z.union([z.literal(""), z.enum(["draft", "published", "withdrawn"])]),
});

export async function setListingStatus(formData: FormData) {
  const { supabase } = await gate();
  const parsed = listingSchema.safeParse({
    id: formData.get("id"),
    to: formData.get("to"),
    country: formData.get("country") ?? "",
    status: formData.get("status") ?? "",
  });
  if (!parsed.success) redirect(`${BASE}?tab=listings&error=invalid`);
  const { id, to, country, status } = parsed.data;

  // Back to the same filtered view the admin was working through.
  const keep = `${country ? `&country=${country}` : ""}${status ? `&status=${status}` : ""}`;

  const { data: before } = await supabase
    .from("international_listings")
    .select("status, slug, country_code")
    .eq("id", id)
    .maybeSingle();
  if (!before) redirect(`${BASE}?tab=listings&error=not_found${keep}`);
  if (before.status === to) redirect(`${BASE}?tab=listings&done=listing_${to}${keep}`);

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("international_listings")
    .update(to === "published" ? { status: to, published_at: now, withdrawn_at: null } : { status: to, withdrawn_at: now })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) redirect(`${BASE}?tab=listings&error=save_failed${keep}`);

  await logAudit({
    action: to === "published" ? "international_listing.published" : "international_listing.withdrawn",
    entityType: "international_listing",
    entityId: id,
    previous: { status: before.status },
    next: { status: to, slug: before.slug, country_code: before.country_code },
  });

  redirect(`${BASE}?tab=listings&done=listing_${to}${keep}`);
}

/* -------------------------------------------------------------------------
 * Enquiries
 * ---------------------------------------------------------------------- */

const enquirySchema = z.object({ id: z.string().uuid(), to: z.enum(["contacted", "closed"]) });

export async function setEnquiryStatus(formData: FormData) {
  const { supabase, user } = await gate();
  const parsed = enquirySchema.safeParse({ id: formData.get("id"), to: formData.get("to") });
  if (!parsed.success) redirect(`${BASE}?tab=enquiries&error=invalid`);
  const { id, to } = parsed.data;

  const { data: before } = await supabase.from("international_enquiries").select("status").eq("id", id).maybeSingle();
  if (!before) redirect(`${BASE}?tab=enquiries&error=not_found`);

  const { data, error } = await supabase
    .from("international_enquiries")
    .update({ status: to, handled_by: user.id })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) redirect(`${BASE}?tab=enquiries&error=save_failed`);

  // Status only: the buyer's name and number stay out of the audit trail.
  await logAudit({
    action: `international_enquiry.${to}`,
    entityType: "international_enquiry",
    entityId: id,
    previous: { status: before.status },
    next: { status: to },
  });

  redirect(`${BASE}?tab=enquiries&done=enquiry_${to}`);
}
