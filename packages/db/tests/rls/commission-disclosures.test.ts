import { describe, it, expect } from "vitest";
import { hasEnv, anonClient, raClient, saClient } from "./setup";

describe.skipIf(!hasEnv)("commission & consents (§72–78, §31, §83)", () => {
  it("anon cannot read commission agreements", async () => {
    const anon = anonClient();
    const { data } = await anon.from("commission_agreements").select("id");
    expect(data ?? []).toHaveLength(0);
    const { data: v } = await anon.from("commission_agreement_versions").select("id");
    expect(v ?? []).toHaveLength(0);
  });

  it("custom percentages must total exactly 100 (server-side)", async () => {
    const sa = await saClient();
    const { data: subs } = await sa.from("property_submissions").select("id").limit(1);
    const { error } = await sa.rpc("propose_commission_version", {
      p_submission_id: subs![0].id,
      p_method: "custom_percentage",
      p_listing_pct: 70,
      p_buyer_pct: 40,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/total 100/);
  });

  it("amending an accepted agreement requires a stated reason (§76)", async () => {
    const sa = await saClient();
    const { data: subs } = await sa.from("property_submissions").select("id").limit(1);
    const { error } = await sa.rpc("propose_commission_version", {
      p_submission_id: subs![0].id,
      p_method: "fifty_fifty",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/amendment reason/);
  });

  it("accepted versions and acceptances cannot be tampered with", async () => {
    const ra = await raClient();
    const { data: versions } = await ra
      .from("commission_agreement_versions").select("id").limit(1);
    const { error: updErr, data: updData } = await ra
      .from("commission_agreement_versions")
      .update({ listing_side_percentage: 99 })
      .eq("id", versions![0].id)
      .select();
    expect(updErr !== null || (updData ?? []).length === 0).toBe(true);

    const { data: accs } = await ra.from("commission_acceptances").select("id");
    expect((accs ?? []).length).toBeGreaterThanOrEqual(1);
    await ra.from("commission_acceptances").delete().eq("id", accs![0].id);
    const { data: after } = await ra
      .from("commission_acceptances").select("id").eq("id", accs![0].id);
    expect(after ?? []).toHaveLength(1);
  });

  it("consent records cannot be forged for another user or deleted", async () => {
    const sa = await saClient();
    const ra = await raClient();
    const { data: raUser } = await ra.auth.getUser();
    const { data: v } = await sa
      .from("declaration_versions").select("id, declaration_id, body, locale")
      .eq("active", true).limit(1).single();
    const { error: forge } = await sa.from("consent_records").insert({
      user_id: raUser.user!.id,
      declaration_id: v!.declaration_id,
      declaration_version_id: v!.id,
      accepted_text: "forged",
      language: v!.locale,
    });
    expect(forge).not.toBeNull();

    const { data: own } = await sa.from("consent_records").select("id").limit(1);
    await sa.from("consent_records").delete().eq("id", own![0].id);
    const { data: still } = await sa
      .from("consent_records").select("id").eq("id", own![0].id);
    expect(still ?? []).toHaveLength(1);
  });

  it("declaration versions are immutable for agents", async () => {
    const sa = await saClient();
    const { data: v } = await sa
      .from("declaration_versions").select("id").eq("active", true).limit(1);
    const { error, data } = await sa
      .from("declaration_versions")
      .update({ body: "tampered" })
      .eq("id", v![0].id)
      .select();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});

describe.skipIf(!hasEnv)("disclosures & client boundary (§79–81, §21)", () => {
  it("SA cannot acknowledge their own disclosure (RA-only action)", async () => {
    const sa = await saClient();
    const { data: me } = await sa.auth.getUser();
    const { data: d } = await sa.from("legal_disclosures").select("id").limit(1);
    const { error } = await sa.from("legal_disclosure_acknowledgements").insert({
      disclosure_id: d![0].id,
      acknowledged_by: me.user!.id,
      action: "ready_for_client",
      client_safe_summary: "self-approved",
    });
    expect(error).not.toBeNull();
  });

  it("SA cannot read the client presentation token or password", async () => {
    const sa = await saClient();
    const { data } = await sa.from("client_presentations").select("token, password");
    expect(data ?? []).toHaveLength(0);
  });

  it("SA cannot read client feedback", async () => {
    const sa = await saClient();
    const { data } = await sa.from("client_feedback").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("anon cannot reach presentations, feedback or disclosures", async () => {
    const anon = anonClient();
    for (const table of [
      "client_presentations", "client_feedback", "legal_disclosures",
      "messages", "offers", "viewing_appointments", "contact_release_requests",
    ]) {
      const { data } = await anon.from(table).select("id" as never);
      expect(data ?? [], `table ${table} leaked to anon`).toHaveLength(0);
    }
  });
});
