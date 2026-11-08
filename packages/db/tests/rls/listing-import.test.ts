import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, raClient, saClient, uid, hasEnv } from "./setup";

/**
 * Agent listing migration — who can see and touch a batch (migration 00057).
 *
 * An import batch holds an agent's own work in progress: the portal URLs they
 * are migrating, the extracted prices, the listings they are about to publish.
 * Another agent seeing it would be a straightforward leak of a competitor's
 * inventory before it goes live, so the isolation is worth proving rather than
 * assuming.
 *
 * This suite is the one place that WRITES. The rest of the RLS tests only make
 * writes they expect to fail, but ownership cannot be demonstrated against a
 * table with no rows in it — "the other agent sees nothing" passes vacuously if
 * there is nothing to see. So it creates one batch, proves the boundaries hold
 * around it, and removes it in `afterAll` whether or not the assertions passed.
 */

describe.skipIf(!hasEnv)("listing import batches (00057)", () => {
  let ra: SupabaseClient;
  let sa: SupabaseClient;
  let raId: string;
  let saId: string;
  let batchId: string | null = null;
  let itemId: string | null = null;

  beforeAll(async () => {
    ra = await raClient();
    sa = await saClient();
    raId = await uid(ra);
    saId = await uid(sa);

    const { data, error } = await ra
      .from("import_batches")
      .insert({
        agent_id: raId,
        source_kind: "portal_url",
        source_portal: "other",
        source_label: "rls-test — safe to delete",
        status: "processing",
      })
      .select("id")
      .single();
    if (error) throw new Error(`could not create test batch: ${error.message}`);
    batchId = data.id;

    const { data: item, error: itemError } = await ra
      .from("import_items")
      .insert({
        batch_id: batchId,
        source_url: `https://example.com/rls-test-${Date.now()}`,
        status: "found",
      })
      .select("id")
      .single();
    if (itemError) throw new Error(`could not create test item: ${itemError.message}`);
    itemId = item.id;
  });

  afterAll(async () => {
    // Cascade takes the item with it.
    if (batchId) await ra.from("import_batches").delete().eq("id", batchId);
  });

  describe("the owning agent", () => {
    it("sees their own batch", async () => {
      const { data } = await ra.from("import_batches").select("id").eq("id", batchId!);
      expect(data).toHaveLength(1);
    });

    it("sees their own items", async () => {
      const { data } = await ra.from("import_items").select("id").eq("batch_id", batchId!);
      expect(data).toHaveLength(1);
    });

    it("gets counters maintained by the trigger, not by the app", async () => {
      const { data } = await ra
        .from("import_batches").select("found_count").eq("id", batchId!).single();
      expect(data?.found_count).toBe(1);
    });
  });

  describe("another agent", () => {
    it("cannot see the batch", async () => {
      const { data } = await sa.from("import_batches").select("id").eq("id", batchId!);
      expect(data ?? []).toHaveLength(0);
    });

    it("cannot see the items — including the source URLs and extracted prices", async () => {
      const { data } = await sa.from("import_items").select("id, source_url, extracted")
        .eq("batch_id", batchId!);
      expect(data ?? []).toHaveLength(0);
    });

    it("cannot update the batch", async () => {
      const { data } = await sa
        .from("import_batches").update({ status: "cancelled" }).eq("id", batchId!).select("id");
      expect(data ?? []).toHaveLength(0);   // filtered out, not merely refused

      const { data: after } = await ra
        .from("import_batches").select("status").eq("id", batchId!).single();
      expect(after?.status).toBe("processing");
    });

    it("cannot delete the batch", async () => {
      await sa.from("import_batches").delete().eq("id", batchId!);
      const { data } = await ra.from("import_batches").select("id").eq("id", batchId!);
      expect(data).toHaveLength(1);
    });

    it("cannot add an item to someone else's batch", async () => {
      const { error } = await sa
        .from("import_items")
        .insert({ batch_id: batchId!, source_url: "https://example.com/injected", status: "found" });
      expect(error).not.toBeNull();
    });

    it("cannot create a batch belonging to another agent", async () => {
      const { error } = await sa
        .from("import_batches")
        .insert({ agent_id: raId, source_kind: "portal_url", status: "processing" });
      expect(error).not.toBeNull();   // WITH CHECK on the ownership policy
    });

    it("can create a batch of their own — the policy scopes, it does not lock out", async () => {
      const { data, error } = await sa
        .from("import_batches")
        .insert({
          agent_id: saId,
          source_kind: "portal_url",
          source_label: "rls-test — safe to delete",
          status: "processing",
        })
        .select("id").single();
      expect(error).toBeNull();
      if (data) await sa.from("import_batches").delete().eq("id", data.id);
    });
  });

  describe("anonymous", () => {
    it("is refused the batches table outright", async () => {
      const { data, error } = await anonClient().from("import_batches").select("id");
      expect(error ?? (data ?? []).length === 0).toBeTruthy();
      expect(data ?? []).toHaveLength(0);
    });

    it("is refused the items table outright", async () => {
      const { data } = await anonClient().from("import_items").select("id, source_url");
      expect(data ?? []).toHaveLength(0);
    });

    it("cannot insert a batch", async () => {
      const { error } = await anonClient()
        .from("import_batches").insert({ agent_id: raId, source_kind: "portal_url" });
      expect(error).not.toBeNull();
    });
  });

  describe("the authority declaration is versioned, not a boolean", () => {
    it("has an active version in all three locales", async () => {
      const { data } = await ra
        .from("declaration_versions")
        .select("locale, body, version_number, declarations!inner(key)")
        .eq("declarations.key", "listing_import_authority")
        .eq("active", true);
      const locales = (data ?? []).map((r) => r.locale).sort();
      expect(locales).toEqual(["en", "id", "ms"]);
    });

    it("carries real wording, since that wording is what gets stored on consent", async () => {
      const { data } = await ra
        .from("declaration_versions")
        .select("body, declarations!inner(key)")
        .eq("declarations.key", "listing_import_authority")
        .eq("locale", "id").eq("active", true).single();
      expect(data?.body ?? "").toMatch(/berwenang/i);   // "authorised"
    });
  });
});

/**
 * Regency matching (migrations 00058, 00059).
 *
 * The importer gets a free-text city from a portal page. It may only resolve
 * that to a real regency when the match is unambiguous — an import that quietly
 * files a Bekasi property under the wrong Bekasi is worse than one that asks.
 *
 * The class cases below are not hypothetical. 00058 answered "Kabupaten
 * Bandung" with Kota Bandung, because `locations` seeds kota rows with no
 * prefix at all and "Kab. Bandung" is not a substring of "Kabupaten Bandung".
 * 00059 reads the class from the text and filters on it before ranking names.
 */
describe.skipIf(!hasEnv)("match_regency (00058)", () => {
  let ra: SupabaseClient;
  beforeAll(async () => { ra = await raClient(); });

  const match = async (text: string) => {
    const { data } = await ra.rpc("match_regency", { p_text: text });
    return (data ?? [])[0] ?? null;
  };

  it("resolves an exact regency name", async () => {
    expect((await match("Kota Bekasi"))?.regency).toMatch(/Bekasi/i);
  });

  it("resolves a name written with the usual prefix", async () => {
    expect((await match("Kab. Sidoarjo"))?.regency).toMatch(/Sidoarjo/i);
  });

  it("resolves a regency named inside a full address line", async () => {
    // What a portal actually gives us is never just the regency.
    const m = await match("Jl. Merdeka No. 12, Kota Bandung, Jawa Barat");
    expect(m?.regency).toMatch(/Bandung/i);
    expect(m?.province).toMatch(/Jawa Barat/i);
  });

  it("returns nothing for a name that matches more than one regency", async () => {
    // "Bekasi" is both a kota and a kabupaten. Guessing is the failure mode
    // this function exists to prevent.
    expect(await match("Bekasi")).toBeNull();
  });

  describe("the class in the text decides, in either spelling", () => {
    it("'Kota Bekasi' is the kota", async () => {
      expect((await match("Kota Bekasi"))?.regency).toBe("Bekasi");
    });
    it("'Kab. Bekasi' is the kabupaten", async () => {
      expect((await match("Kab. Bekasi"))?.regency).toBe("Kab. Bekasi");
    });
    it("'Kabupaten Bandung' is the kabupaten, spelled out", async () => {
      // 00058 answered "Bandung" here — the wrong regency, silently.
      expect((await match("Kabupaten Bandung"))?.regency).toBe("Kab. Bandung");
    });
    it("finds the kabupaten inside a real address line", async () => {
      // Cikarang is in Kab. Bekasi. 00058 filed it under the kota.
      const m = await match("Cikarang, Kabupaten Bekasi, Jawa Barat");
      expect(m?.regency).toBe("Kab. Bekasi");
    });
    it("returns nothing when the text names both classes", async () => {
      expect(await match("Kota Bekasi dan Kabupaten Bekasi")).toBeNull();
    });
  });

  it("does not match a regency name inside a longer word", async () => {
    // "Banjar" is a regency; "Banjarbaru" is a different city. A substring
    // match would have claimed the first. Nothing is the right answer.
    expect(await match("Banjarbaru")).toBeNull();
  });

  it("returns nothing for a place that does not exist", async () => {
    expect(await match("Kota Tidak Ada Sama Sekali")).toBeNull();
  });

  it("returns nothing for empty input rather than an arbitrary first row", async () => {
    expect(await match("")).toBeNull();
  });
});
