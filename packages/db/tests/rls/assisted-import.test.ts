import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, saClient, raClient, adminClient, hasEnv, fixtureEmail, fixtureName, uid } from "./setup";

/**
 * Migration 00107 — assisted listing import, slice P0-d-1.
 *
 *   · listing.import_assisted is held by exactly super_admin, admin and
 *     country_admin;
 *   · an admin prepares a batch that belongs to an agent in their country,
 *     only through admin_import_batch_create(), which stamps them as
 *     acting_admin_id — nobody can set or change that column otherwise;
 *   · compliance_admin reads but cannot write; other agents see nothing;
 *   · only the batch's agent can record its authority declaration (D15);
 *   · the preparing admin cannot approve the resulting listing.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasAdminEnv = !!(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

describe.skipIf(!hasEnv || !SERVICE || !hasAdminEnv)("assisted import (00107)", () => {
  let service: SupabaseClient;
  let scoped: SupabaseClient;      // SA + country_admin {MY}
  let scopedId: string;
  let compliance: SupabaseClient;  // RA + compliance_admin
  let global: SupabaseClient;      // standing super_admin
  const grants: string[] = [];
  const users: string[] = [];
  const batches: string[] = [];
  const properties: string[] = [];
  const listings: string[] = [];
  let seq = 0;
  let myAgent: { id: string; client: SupabaseClient };
  let otherAgent: { id: string; client: SupabaseClient };
  let idAgentId: string;
  let myBatch: string;
  let authority: { declaration_id: string; id: string; body: string; locale: string };

  const person = async (tag: string, country: string, status = "verified") => {
    const email = fixtureEmail(`${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`fixture user: ${error.message}`);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(tag), agent_status: status, country_code: country });
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
  const create = (c: SupabaseClient, agent: string) =>
    c.rpc("admin_import_batch_create", {
      p_agent: agent, p_source_kind: "excel", p_source_portal: "spreadsheet",
      p_source_label: fixtureName("p0d batch"), p_status: "ready",
    });

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    scoped = await saClient();
    scopedId = await uid(scoped);
    compliance = await raClient();
    global = await adminClient();
    await grant(scoped, "country_admin", ["MY"]);
    await grant(compliance, "compliance_admin", []);
    myAgent = await person("p0d-my", "MY");
    otherAgent = await person("p0d-other", "MY");
    idAgentId = (await person("p0d-id", "ID")).id;
    const { data, error } = await create(scoped, myAgent.id);
    if (error) throw new Error(`create: ${error.message}`);
    myBatch = data as string;
    batches.push(myBatch);
    const { data: v } = await service
      .from("declaration_versions")
      .select("id, declaration_id, body, locale, declarations!inner(key)")
      .eq("declarations.key", "listing_import_authority").eq("active", true).eq("locale", "en").single();
    authority = v as unknown as typeof authority;
  });

  afterAll(async () => {
    if (listings.length) {
      await service.from("import_items").update({ listing_id: null }).in("listing_id", listings);
      await service.from("listings").delete().in("id", listings);
    }
    if (properties.length) await service.from("properties").delete().in("id", properties);
    if (batches.length) {
      await service.from("consent_records").delete().in("import_batch_ref", batches);
      await service.from("import_batches").delete().in("id", batches);
    }
    for (const id of users) await service.auth.admin.deleteUser(id);
    if (grants.length) await service.from("user_roles").delete().in("id", grants);
  });

  describe("who may prepare", () => {
    it("listing.import_assisted is granted to exactly super_admin, admin and country_admin", async () => {
      const { data } = await service.from("role_capabilities").select("roles(key)").eq("capability_key", "listing.import_assisted");
      const keys = (data ?? []).map((r) => (r.roles as unknown as { key: string }).key).sort();
      expect(keys).toEqual(["admin", "country_admin", "super_admin"]);
    });

    it("a MY country admin prepares a batch owned by a MY agent, stamped as the preparer", async () => {
      const { data } = await service.from("import_batches").select("agent_id, acting_admin_id").eq("id", myBatch).single();
      expect(data).toEqual({ agent_id: myAgent.id, acting_admin_id: scopedId });
    });

    it("but not for an ID agent", async () => {
      const { error } = await create(scoped, idAgentId);
      expect(error?.code).toBe("42501");
    });

    it("nor for themselves", async () => {
      const { error } = await create(scoped, scopedId);
      expect(error?.code).toBe("42501");
    });

    it("compliance admin, a plain agent and anonymous cannot prepare", async () => {
      expect((await create(compliance, myAgent.id)).error?.code).toBe("42501");
      expect((await create(otherAgent.client, myAgent.id)).error?.code).toBe("42501");
      expect((await create(anonClient(), myAgent.id)).error).not.toBeNull();
    });
  });

  describe("provenance cannot be forged", () => {
    it("an admin cannot insert a batch directly", async () => {
      const { error } = await scoped.from("import_batches").insert({
        agent_id: myAgent.id, acting_admin_id: scopedId, source_kind: "excel", status: "ready",
      });
      expect(error).not.toBeNull();
    });

    it("an agent cannot create their own batch claiming a preparer", async () => {
      const { error } = await myAgent.client.from("import_batches").insert({
        agent_id: myAgent.id, acting_admin_id: scopedId, source_kind: "excel", status: "ready",
      });
      expect(error?.code).toBe("42501");
    });

    it("the agent cannot erase or change who prepared their batch", async () => {
      const { error } = await myAgent.client.from("import_batches").update({ acting_admin_id: null }).eq("id", myBatch);
      expect(error?.code).toBe("42501");
      const { data } = await service.from("import_batches").select("acting_admin_id").eq("id", myBatch).single();
      expect(data!.acting_admin_id).toBe(scopedId);
    });
  });

  describe("items", () => {
    it("the preparing admin adds items to the in-scope batch", async () => {
      const { error } = await scoped.from("import_items").insert({
        batch_id: myBatch, status: "ready", extracted: { title: "P0-d fixture", price: 500000, propertyType: "rumah" },
      });
      expect(error).toBeNull();
    });

    it("compliance admin can read the batch but cannot add items", async () => {
      const { data } = await compliance.from("import_batches").select("id").eq("id", myBatch).maybeSingle();
      expect(data?.id).toBe(myBatch);
      const { error } = await compliance.from("import_items").insert({ batch_id: myBatch, status: "found" });
      expect(error).not.toBeNull();
    });

    it("the MY admin cannot write into an ID agent's batch", async () => {
      const { data: idBatch } = await create(global, idAgentId);
      batches.push(idBatch as string);
      const { error } = await scoped.from("import_items").insert({ batch_id: idBatch, status: "found" });
      expect(error).not.toBeNull();
    });

    it("the agent sees their prepared batch and its items; another agent sees nothing", async () => {
      const own = await myAgent.client.from("import_items").select("id").eq("batch_id", myBatch);
      expect((own.data ?? []).length).toBeGreaterThan(0);
      const other = await otherAgent.client.from("import_batches").select("id").eq("id", myBatch);
      expect(other.data ?? []).toHaveLength(0);
    });
  });

  describe("the authority declaration is the agent's (D15)", () => {
    const consent = (c: SupabaseClient, userId: string) =>
      c.from("consent_records").insert({
        user_id: userId, declaration_id: authority.declaration_id, declaration_version_id: authority.id,
        accepted_text: authority.body, language: authority.locale, import_batch_ref: myBatch, status: "accepted",
      });

    it("the preparing admin cannot record it", async () => {
      expect((await consent(scoped, scopedId)).error?.code).toBe("42501");
    });

    it("the agent who owns the batch can", async () => {
      expect((await consent(myAgent.client, myAgent.id)).error).toBeNull();
    });
  });

  describe("hand-over and audit", () => {
    it("the preparing admin hands over; compliance admin cannot", async () => {
      expect((await compliance.rpc("admin_import_batch_handover", { p_batch: myBatch })).error?.code).toBe("42501");
      const { data, error } = await scoped.rpc("admin_import_batch_handover", { p_batch: myBatch });
      expect(error).toBeNull();
      expect(data).toBe(myAgent.id);
    });

    it("audit shows the admin as actor for preparing and handing over", async () => {
      const { data } = await service.from("audit_logs").select("action, actor_id, actor_role, new_values").eq("entity_id", myBatch);
      const created = (data ?? []).find((r) => r.action === "listing_import.assisted_batch_created");
      const handed = (data ?? []).find((r) => r.action === "listing_import.assisted_handed_over");
      expect(created).toMatchObject({ actor_id: scopedId, actor_role: "country_admin" });
      expect((created!.new_values as { agent_id: string }).agent_id).toBe(myAgent.id);
      expect(handed).toMatchObject({ actor_id: scopedId, actor_role: "country_admin" });
    });
  });

  describe("separation of duties on moderation", () => {
    let listingId: string;

    beforeAll(async () => {
      // The agent's commit, as the hub performs it: a property and listing owned by the agent.
      const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
      const { data: prop } = await service.from("properties").insert({
        human_readable_id: hp, agent_id: myAgent.id, country_code: "MY", property_category: "residential",
        property_type: "rumah", measurement_unit: "sqft", created_by: myAgent.id,
      }).select("id").single();
      properties.push(prop!.id);
      const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
      const { data: lst } = await service.from("listings").insert({
        human_readable_id: hl, property_id: prop!.id, agent_id: myAgent.id, listing_type: "sale",
        status: "pending_review", moderation_state: "pending", currency: "MYR", price: 500000, language: "en",
        title: fixtureName("p0d listing"), slug: `fixture-p0d-${prop!.id.slice(0, 8)}`, created_by: myAgent.id,
        creation_source: "import",
      }).select("id").single();
      listingId = lst!.id;
      listings.push(listingId);
      await service.from("import_items").update({ status: "imported", listing_id: listingId, property_id: prop!.id }).eq("batch_id", myBatch);
    });

    it("the preparing admin cannot approve it", async () => {
      const { error } = await scoped.from("listings")
        .update({ status: "published", moderation_state: "approved" }).eq("id", listingId);
      expect(error?.code).toBe("42501");
      const { data } = await service.from("listings").select("status").eq("id", listingId).single();
      expect(data!.status).toBe("pending_review");
    });

    it("prepared_by_me answers yes for them and no for another admin", async () => {
      expect((await scoped.rpc("prepared_by_me", { p_listing: listingId })).data).toBe(true);
      expect((await global.rpc("prepared_by_me", { p_listing: listingId })).data).toBe(false);
    });

    it("another admin can approve it", async () => {
      const { error } = await global.from("listings")
        .update({ status: "published", moderation_state: "approved", published_at: new Date().toISOString() }).eq("id", listingId);
      expect(error).toBeNull();
    });
  });
});
