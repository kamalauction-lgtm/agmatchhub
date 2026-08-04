import { describe, it, expect } from "vitest";
import { hasEnv, anonClient, raClient, saClient } from "./setup";

describe.skipIf(!hasEnv)("submissions & confidential fields (§16–18, §78)", () => {
  it("anon cannot read submissions", async () => {
    const anon = anonClient();
    const { data } = await anon.from("property_submissions").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("RA cannot read the SA's minimum acceptable price", async () => {
    const ra = await raClient();
    const { data } = await ra.from("property_submission_private").select("*");
    expect(data ?? []).toHaveLength(0);
  });

  it("RA cannot read source-agent identities", async () => {
    const ra = await raClient();
    const { data } = await ra.from("property_submission_sources").select("*");
    expect(data ?? []).toHaveLength(0);
  });

  it("SA can read own confidential row", async () => {
    const sa = await saClient();
    const { data } = await sa.from("property_submission_private").select("min_acceptable_price");
    expect((data ?? []).length).toBe(1);
  });

  it("SA cannot use the RA review function", async () => {
    const sa = await saClient();
    const { data: subs } = await sa.from("property_submissions").select("id").limit(1);
    const { error } = await sa.rpc("ra_review_submission", {
      p_submission_id: subs![0].id,
      p_new_status: "approved_for_client",
      p_reason: null,
    });
    expect(error).not.toBeNull();
  });

  it("SA cannot alter workflow status to a client-facing state directly", async () => {
    const sa = await saClient();
    const { data: subs } = await sa.from("property_submissions").select("id, status").limit(1);
    const { error, data } = await sa
      .from("property_submissions")
      .update({ status: "approved_for_client" })
      .eq("id", subs![0].id)
      .select();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it("status history is immutable for agents", async () => {
    const ra = await raClient();
    const { data: rows } = await ra.from("submission_status_history").select("id").limit(1);
    expect((rows ?? []).length).toBe(1);
    const before = rows![0].id;
    const { error } = await ra
      .from("submission_status_history")
      .delete()
      .eq("id", before);
    const { data: after } = await ra
      .from("submission_status_history")
      .select("id")
      .eq("id", before);
    expect(error !== null || (after ?? []).length === 1).toBe(true);
  });
});
