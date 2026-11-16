import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, saClient, raClient, hasEnv, fixtureEmail, fixtureName, uid } from "./setup";
import { syntheticJpegWithGps, syntheticPng } from "../fixtures/synthetic-images";

/**
 * Migration 00108 — imported photos into private intake (P0-e-1a).
 * Synthetic images only.
 *
 *   · the intake bucket is private: owner-folder writes, owner and in-country
 *     moderator reads, nothing anonymous, nothing on the public views;
 *   · attach_import_photo records a photo as `pending` with its provenance and
 *     the batch's consent, only for the batch's own agent, only with the flag;
 *   · a retry, or the same photo from another URL, adds nothing;
 *   · nobody marks an intake photo ready from a client session.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "listing-media-intake";
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe.skipIf(!hasEnv || !SERVICE)("imported photo intake (00108)", () => {
  let service: SupabaseClient;
  let scoped: SupabaseClient;       // SA + country_admin {MY}
  let compliance: SupabaseClient;   // RA + compliance_admin (global)
  const grants: string[] = [];
  const users: string[] = [];
  const objects: string[] = [];
  let targetId: string | null = null;
  let agent: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let idAgentId: string;
  let batchId: string;
  let consentId: string;
  let propertyId: string;
  let listingId: string;
  let itemId: string;
  const gpsJpeg = syntheticJpegWithGps(7);
  const gpsHash = sha(gpsJpeg);
  let gpsPath: string;
  let idObject: string;

  const person = async (tag: string, country: string) => {
    const email = fixtureEmail(`${tag}-${Date.now()}-${randomBytes(2).toString("hex")}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`fixture user: ${error.message}`);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(tag), agent_status: "verified", country_code: country });
    const client = createClient(URL_, ANON, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email, password });
    return { id: data.user.id, client };
  };
  const grant = async (c: SupabaseClient, role: string, countries: string[]) => {
    const { data: r } = await service.from("roles").select("id").eq("key", role).single();
    const { data, error } = await service.from("user_roles")
      .insert({ user_id: await uid(c), role_id: r!.id, country_codes: countries }).select("id").single();
    if (error) throw new Error(`grant: ${error.message}`);
    grants.push(data.id);
  };
  const attach = (c: SupabaseClient, path: string, hash: string, url = "https://example.test/p1.jpg") =>
    c.rpc("attach_import_photo", {
      p_item: itemId, p_storage_path: path, p_content_hash: hash, p_image_url: url, p_byte_size: 100,
    });

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    scoped = await saClient();
    compliance = await raClient();
    await grant(scoped, "country_admin", ["MY"]);
    await grant(compliance, "compliance_admin", []);
    agent = await person("p0e-agent", "MY");
    other = await person("p0e-other", "MY");
    idAgentId = (await person("p0e-id", "ID")).id;

    const { data: t } = await service.from("feature_flag_targets")
      .insert({ flag_key: "import_photos", target_type: "user", user_id: agent.id }).select("id").single();
    targetId = t!.id;

    const { data: b } = await service.from("import_batches")
      .insert({ agent_id: agent.id, source_kind: "portal_url", source_portal: "other", source_label: fixtureName("p0e"), status: "completed" })
      .select("id").single();
    batchId = b!.id;
    const { data: v } = await service.from("declaration_versions")
      .select("id, declaration_id, body, locale, declarations!inner(key)")
      .eq("declarations.key", "listing_import_authority").eq("active", true).eq("locale", "en").single();
    const { data: c } = await service.from("consent_records").insert({
      user_id: agent.id, declaration_id: v!.declaration_id, declaration_version_id: v!.id,
      accepted_text: v!.body, language: "en", import_batch_ref: batchId, status: "accepted",
    }).select("id").single();
    consentId = c!.id;
    await service.from("import_batches").update({ consent_record_id: consentId }).eq("id", batchId);

    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p } = await service.from("properties").insert({
      human_readable_id: hp, agent_id: agent.id, country_code: "MY", property_category: "residential",
      property_type: "rumah", measurement_unit: "sqft", created_by: agent.id,
    }).select("id").single();
    propertyId = p!.id;
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: l } = await service.from("listings").insert({
      human_readable_id: hl, property_id: propertyId, agent_id: agent.id, listing_type: "sale", status: "draft",
      currency: "MYR", price: 1000, language: "en", title: fixtureName("p0e listing"),
      slug: `fixture-p0e-${propertyId.slice(0, 8)}`, created_by: agent.id, creation_source: "import",
    }).select("id").single();
    listingId = l!.id;
    const { data: i } = await service.from("import_items").insert({
      batch_id: batchId, source_url: "https://example.test/listing/1", status: "imported",
      listing_id: listingId, property_id: propertyId, media_state: "pending", media_total: 2,
      extracted: { title: "p0e", imageUrls: ["https://example.test/p1.jpg", "https://example.test/p2.png"] },
    }).select("id").single();
    itemId = i!.id;

    gpsPath = `${agent.id}/${listingId}/src-${gpsHash.slice(0, 16)}.jpg`;
    idObject = `${idAgentId}/fixture-${Date.now()}/src-0000000000000000.png`;
    const { error: upId } = await service.storage.from(BUCKET).upload(idObject, syntheticPng(), { contentType: "image/png" });
    if (upId) throw new Error(`fixture upload: ${upId.message}`);
    objects.push(idObject);
  });

  afterAll(async () => {
    if (objects.length) await service.storage.from(BUCKET).remove(objects);
    if (listingId) {
      await service.from("import_items").delete().eq("batch_id", batchId);
      await service.from("listing_media").delete().eq("listing_id", listingId);
      await service.from("listings").delete().eq("id", listingId);
      await service.from("properties").delete().eq("id", propertyId);
    }
    if (batchId) {
      await service.from("consent_records").delete().eq("import_batch_ref", batchId);
      await service.from("import_batches").delete().eq("id", batchId);
    }
    if (targetId) await service.from("feature_flag_targets").delete().eq("id", targetId);
    for (const id of users) await service.auth.admin.deleteUser(id);
    if (grants.length) await service.from("user_roles").delete().in("id", grants);
  });

  describe("the private intake bucket", () => {
    it("the agent uploads into their own folder", async () => {
      const { error } = await agent.client.storage.from(BUCKET).upload(gpsPath, gpsJpeg, { contentType: "image/jpeg" });
      expect(error).toBeNull();
      objects.push(gpsPath);
    });

    it("a second upload of the same content is refused as already there, so a retry reuses it", async () => {
      const { error } = await agent.client.storage.from(BUCKET).upload(gpsPath, gpsJpeg, { contentType: "image/jpeg" });
      expect(error?.message ?? "").toMatch(/exist|duplicate/i);
    });

    it("nobody uploads into another agent's folder", async () => {
      const { error } = await other.client.storage.from(BUCKET)
        .upload(`${agent.id}/${listingId}/src-1111111111111111.png`, syntheticPng(), { contentType: "image/png" });
      expect(error).not.toBeNull();
    });

    it("the photo with GPS data cannot be read anonymously, publicly or by another agent", async () => {
      const anonDl = await anonClient().storage.from(BUCKET).download(gpsPath);
      expect(anonDl.data).toBeNull();
      const pub = await fetch(`${URL_}/storage/v1/object/public/${BUCKET}/${gpsPath}`);
      expect(pub.status).not.toBe(200);
      const otherSign = await other.client.storage.from(BUCKET).createSignedUrl(gpsPath, 60);
      expect(otherSign.data?.signedUrl ?? null).toBeNull();
    });

    it("a MY moderator can read MY intake photos, not ID ones; a global compliance admin can read both", async () => {
      expect((await scoped.storage.from(BUCKET).createSignedUrl(gpsPath, 60)).data?.signedUrl).toBeTruthy();
      expect((await scoped.storage.from(BUCKET).createSignedUrl(idObject, 60)).data?.signedUrl ?? null).toBeNull();
      expect((await compliance.storage.from(BUCKET).createSignedUrl(idObject, 60)).data?.signedUrl).toBeTruthy();
    });
  });

  describe("recording a photo", () => {
    it("records it as pending, as the cover, with provenance and the batch's consent", async () => {
      const { data, error } = await attach(agent.client, gpsPath, gpsHash);
      expect(error).toBeNull();
      expect(data).toMatchObject({ created: true });
      const { data: m } = await service.from("listing_media").select("*").eq("listing_id", listingId);
      expect(m).toHaveLength(1);
      expect(m![0]).toMatchObject({ processing_state: "pending", is_cover: true, storage_path: `${BUCKET}/${gpsPath}` });
      const { data: src } = await service.from("listing_media_source").select("*").eq("media_id", m![0].id).single();
      expect(src).toMatchObject({
        listing_id: listingId, content_hash: gpsHash, consent_record_id: consentId,
        page_url: "https://example.test/listing/1", image_url: "https://example.test/p1.jpg",
      });
    });

    it("a retry, or the same photo from another URL, adds nothing", async () => {
      const again = await attach(agent.client, gpsPath, gpsHash);
      expect(again.data).toMatchObject({ created: false });
      const elsewhere = await attach(agent.client, gpsPath, gpsHash, "https://cdn.example.test/same.jpg");
      expect(elsewhere.data).toMatchObject({ created: false });
      const { count } = await service.from("listing_media").select("id", { count: "exact", head: true }).eq("listing_id", listingId);
      expect(count).toBe(1);
    });

    it("another agent and an admin cannot attach to this item", async () => {
      expect((await attach(other.client, gpsPath, gpsHash)).error?.code).toBe("42501");
      expect((await attach(scoped, gpsPath, gpsHash)).error?.code).toBe("42501");
    });

    it("a path outside the agent's folder for this listing is refused", async () => {
      const bad = await attach(agent.client, `${other.id}/${listingId}/src-${gpsHash.slice(0, 16)}.jpg`, gpsHash);
      expect(bad.error?.code).toBe("22023");
    });

    it("without the flag, the agent cannot attach", async () => {
      await service.from("feature_flag_targets").delete().eq("id", targetId!);
      const r = await attach(agent.client, gpsPath, gpsHash);
      expect(r.error?.code).toBe("42501");
      const { data: t } = await service.from("feature_flag_targets")
        .insert({ flag_key: "import_photos", target_type: "user", user_id: agent.id }).select("id").single();
      targetId = t!.id;
    });
  });

  describe("an intake photo stays private and pending", () => {
    it("the agent cannot mark it ready or re-point it", async () => {
      const { data: m } = await service.from("listing_media").select("id").eq("listing_id", listingId).single();
      const ready = await agent.client.from("listing_media").update({ processing_state: "ready" }).eq("id", m!.id);
      expect(ready.error?.code).toBe("42501");
      const repoint = await agent.client.from("listing_media")
        .update({ processed_path: "listing-media-public/x.jpg" }).eq("id", m!.id);
      expect(repoint.error?.code).toBe("42501");
    });

    it("the agent cannot write provenance directly", async () => {
      const { data: m } = await service.from("listing_media").select("id").eq("listing_id", listingId).single();
      const { error } = await agent.client.from("listing_media_source").insert({
        media_id: m!.id, listing_id: listingId, page_url: "x", image_url: "y", content_hash: "z",
      });
      expect(error).not.toBeNull();
    });

    it("a published listing shows none of its pending photos on the public views", async () => {
      await service.from("listings").update({
        status: "published", moderation_state: "approved", published_at: new Date().toISOString(),
      }).eq("id", listingId);
      const anon = anonClient();
      const { data: gallery } = await anon.from("public_listing_media").select("id").eq("listing_id", listingId);
      expect(gallery ?? []).toHaveLength(0);
      const { data: card } = await anon.from("public_listings").select("media_count, cover_image_path").eq("id", listingId).maybeSingle();
      if (card) {
        expect(Number(card.media_count)).toBe(0);
        expect(card.cover_image_path).toBeNull();
      }
    });
  });
});
