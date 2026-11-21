import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, anonClient, raClient, hasEnv, FIXTURE_PREFIX } from "./setup";

/**
 * International listings and the person in charge per country (00134).
 *
 * What must hold, each one a way this could leak or be abused:
 *
 *   - the public reads ONLY through the three public_* views, and those views
 *     never carry the source, the raw record or commission terms;
 *   - a draft or withdrawn listing is invisible to the public;
 *   - an agent (not an admin) can read none of the base tables and can change
 *     nothing — not a listing, not a contact, not an exchange rate;
 *   - an enquiry cannot be inserted directly, only through the function, and
 *     the function refuses a missing consent and an unpublished listing;
 *   - the PIC shown is the country's own contact when one exists, otherwise
 *     the all-countries contact.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_TABLES = [
  "international_listings",
  "international_listing_private",
  "international_listing_media",
  "country_contacts",
  "country_contact_countries",
  "fx_rates",
  "international_enquiries",
];

describe.skipIf(!hasEnv || !SERVICE)("international listings", () => {
  let service: SupabaseClient;
  let anon: SupabaseClient;
  let agent: SupabaseClient;
  const tag = Math.random().toString(36).slice(2, 8);
  const slugPub = "fixture-intl-" + tag + "-pub";
  const slugDraft = "fixture-intl-" + tag + "-draft";
  let pubId = "";
  let draftId = "";
  let allContact = "";
  let zzContact = "";
  let consentId = "";

  const randomPhone = () => "+65999" + Math.floor(10000 + Math.random() * 89999);

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    anon = anonClient();
    agent = await raClient();

    const mk = async (slug: string, status: string, country: string) => {
      const { data, error } = await service
        .from("international_listings")
        .insert({
          slug,
          source: "fixture",
          external_id: slug,
          country_code: country,
          city: "Test City",
          title: FIXTURE_PREFIX + " international " + status,
          currency: "AUD",
          price_min: 500000,
          status,
          published_at: status === "published" ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data!.id as string;
    };
    // ZZ and ZY are user-assigned ISO codes: no real listing or contact uses them.
    pubId = await mk(slugPub, "published", "ZZ");
    draftId = await mk(slugDraft, "draft", "ZY");

    const { error: pErr } = await service.from("international_listing_private").insert({
      listing_id: pubId,
      source_url: "https://source.invalid/secret",
      commission_note: "SECRET 3%",
      raw: { secret: true },
      review_flags: ["SECRET_flag"],
    });
    if (pErr) throw new Error(pErr.message);

    const contact = async (name: string, phone: string, all: boolean) => {
      const { data, error } = await service
        .from("country_contacts")
        // sort_order 999 keeps a fixture behind any real all-countries contact.
        .insert({ display_name: FIXTURE_PREFIX + " " + name, phone, all_countries: all, sort_order: 999 })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data!.id as string;
    };
    allContact = await contact("all " + tag, "+6599900001", true);
    zzContact = await contact("zz " + tag, "+6599900002", false);
    const { error: cErr } = await service
      .from("country_contact_countries")
      .insert({ contact_id: zzContact, country_code: "ZZ" });
    if (cErr) throw new Error(cErr.message);

    const { data: dv } = await service
      .from("declaration_versions")
      .select("id, declarations!inner(key)")
      .eq("declarations.key", "buyer_inquiry")
      .eq("active", true)
      .limit(1);
    consentId = dv?.[0]?.id ?? "";
  });

  afterAll(async () => {
    await service.from("international_listings").delete().in("id", [pubId, draftId].filter(Boolean));
    await service.from("country_contacts").delete().in("id", [allContact, zzContact].filter(Boolean));
  });

  it("the public sees a published listing through the view, with its country's PIC", async () => {
    const { data, error } = await anon.from("public_international_listings").select("*").eq("slug", slugPub);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].contact_whatsapp).toBe("+6599900002");
  });

  it("the public view carries no source, raw record or commission", async () => {
    const { data } = await anon.from("public_international_listings").select("*").eq("slug", slugPub);
    const keys = Object.keys(data![0]);
    for (const banned of ["source", "external_id", "source_url", "commission_note", "internal_note", "raw", "review_flags"]) {
      expect(keys).not.toContain(banned);
    }
    expect(JSON.stringify(data)).not.toContain("SECRET");
    // 00135: what the project itself advertises is public; why a row was held is not.
    for (const added of ["address", "latitude", "longitude", "total_units", "bedrooms_label"]) {
      expect(keys).toContain(added);
    }
  });

  it("a draft is invisible to the public", async () => {
    const { data } = await anon.from("public_international_listings").select("slug").eq("slug", slugDraft);
    expect(data ?? []).toHaveLength(0);
  });

  it("the public and an agent can read none of the base tables", async () => {
    for (const c of [anon, agent]) {
      for (const table of BASE_TABLES) {
        const { data } = await c.from(table).select("*").limit(5);
        expect(data ?? [], table).toHaveLength(0);
      }
    }
  });

  it("an agent can change nothing", async () => {
    const ins = await agent.from("international_listings").insert({
      slug: "fixture-intl-" + tag + "-x",
      source: "fixture",
      external_id: "x",
      country_code: "ZZ",
      title: "nope",
      currency: "USD",
    });
    expect(ins.error).not.toBeNull();
    const contact = await agent.from("country_contacts").insert({ display_name: "nope", phone: "+6599900009" });
    expect(contact.error).not.toBeNull();
    const fx = await agent.from("fx_rates").upsert({ currency: "ZZZ", per_usd: 1, as_of: "2026-01-01", source: "nope" });
    expect(fx.error).not.toBeNull();

    await agent.from("international_listings").update({ status: "published" }).eq("id", draftId);
    await agent.from("country_contacts").update({ phone: "+6599900009" }).eq("id", allContact);
    const { data: l } = await service.from("international_listings").select("status").eq("id", draftId).single();
    expect(l!.status).toBe("draft");
    const { data: c } = await service.from("country_contacts").select("phone").eq("id", allContact).single();
    expect(c!.phone).toBe("+6599900001");
  });

  it("an enquiry cannot be inserted directly", async () => {
    const { error } = await anon.from("international_enquiries").insert({
      listing_id: pubId,
      full_name: "Direct",
      phone: "+6599900010",
      locale: "en",
      consent_version_id: consentId || pubId,
    });
    expect(error).not.toBeNull();
  });

  it("the enquiry function refuses a missing consent and an unpublished listing", async () => {
    const base = {
      p_full_name: "Fixture Buyer",
      p_phone: randomPhone(),
      p_email: "",
      p_message: "",
      p_locale: "en",
      p_ip_hash: null,
    };
    const noConsent = await anon.rpc("submit_international_enquiry", {
      ...base,
      p_slug: slugPub,
      p_consent_version_id: pubId,
    });
    expect(noConsent.data).toMatchObject({ ok: false, error: "consent_required" });
    expect(consentId, "staging has no active buyer_inquiry consent").not.toBe("");
    const draft = await anon.rpc("submit_international_enquiry", {
      ...base,
      p_slug: slugDraft,
      p_consent_version_id: consentId,
    });
    expect(draft.data).toMatchObject({ ok: false, error: "listing_not_found" });
  });

  it("a valid enquiry is stored against the country's PIC and returns the WhatsApp number", async () => {
    expect(consentId, "staging has no active buyer_inquiry consent").not.toBe("");
    const phone = randomPhone();
    const { data, error } = await anon.rpc("submit_international_enquiry", {
      p_slug: slugPub,
      p_full_name: "Fixture Buyer",
      p_phone: phone,
      p_email: "",
      p_message: "hello",
      p_locale: "en",
      p_consent_version_id: consentId,
      p_ip_hash: null,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, whatsapp: "+6599900002" });
    const { data: row } = await service
      .from("international_enquiries")
      .select("contact_id, phone")
      .eq("id", data.enquiry)
      .single();
    expect(row).toMatchObject({ contact_id: zzContact, phone });
    await service.from("inquiry_rate_limits").delete().eq("bucket", "phone:" + phone);
  });

  it("a country with no contact of its own falls back to an all-countries contact", async () => {
    const { data } = await service.rpc("country_contact_for", { p_country: "ZY" });
    expect(data).toBeTruthy();
    expect(data).not.toBe(zzContact);
  });
});
