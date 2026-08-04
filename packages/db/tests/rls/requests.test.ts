import { describe, it, expect } from "vitest";
import { hasEnv, anonClient, raClient, saClient } from "./setup";

describe.skipIf(!hasEnv)("requests & links (§13–15)", () => {
  it("anon cannot read requests or links", async () => {
    const anon = anonClient();
    const { data: reqs } = await anon.from("property_requests").select("id");
    expect(reqs ?? []).toHaveLength(0);
    const { data: links } = await anon.from("request_links").select("id");
    expect(links ?? []).toHaveLength(0);
  });

  it("SA sees only requests they submitted to", async () => {
    const sa = await saClient();
    const { data } = await sa.from("property_requests").select("id");
    expect((data ?? []).length).toBe(1);
  });

  it("SA cannot read the RA's confidential request notes", async () => {
    const sa = await saClient();
    const { data } = await sa.from("property_request_private").select("*");
    expect(data ?? []).toHaveLength(0);
  });

  it("SA cannot read link tokens or passwords", async () => {
    const sa = await saClient();
    const { data } = await sa.from("request_links").select("token, password");
    expect(data ?? []).toHaveLength(0);
  });

  it("RA can read own request link (to share it)", async () => {
    const ra = await raClient();
    const { data } = await ra.from("request_links").select("token, password");
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("SA cannot edit the RA's request", async () => {
    const sa = await saClient();
    const { data: reqs } = await sa.from("property_requests").select("id").limit(1);
    const { error, data } = await sa
      .from("property_requests")
      .update({ title: "hacked" })
      .eq("id", reqs![0].id)
      .select();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
