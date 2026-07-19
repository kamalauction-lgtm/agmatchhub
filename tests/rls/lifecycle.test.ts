import { describe, it, expect } from "vitest";
import { hasEnv, raClient, saClient, uid } from "./setup";

/**
 * Positive lifecycle tests — the flows agents actually perform must WORK,
 * not just be blocked for outsiders. Added after 42P17 policy-recursion bugs
 * slipped through a suite that only tested denials (00020/00021/00022).
 */
describe.skipIf(!hasEnv)("agent write lifecycle (positive paths)", () => {
  it("verified RA can create and delete a draft requirement", async () => {
    const ra = await raClient();
    const me = await uid(ra);
    const { data: humanId, error: idErr } = await ra.rpc("next_human_id", {
      p_prefix: "TSTREQ",
    });
    expect(idErr).toBeNull();

    const { data: inserted, error } = await ra
      .from("property_requests")
      .insert({
        human_readable_id: humanId,
        requesting_agent_id: me,
        title: "Lifecycle test requirement",
        transaction_type: "buy",
        property_category: "residential",
        country_code: "MY",
        city: "Test City",
        currency: "MYR",
        status: "draft",
      })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    expect(inserted?.id).toBeTruthy();

    // private notes companion row
    const { error: privErr } = await ra
      .from("property_request_private")
      .upsert({ request_id: inserted!.id, internal_notes: "lifecycle note" });
    expect(privErr).toBeNull();

    // draft update works
    const { error: updErr } = await ra
      .from("property_requests")
      .update({ city: "Updated City", alternative_areas: ["Selangor", "Penang"] })
      .eq("id", inserted!.id);
    expect(updErr).toBeNull();

    // cleanup: cancel the draft (agents cannot hard-delete; mark cancelled)
    const { error: cancelErr } = await ra
      .from("property_requests")
      .update({ status: "cancelled" })
      .eq("id", inserted!.id);
    expect(cancelErr).toBeNull();
  });

  it("SA can update own submission remarks (no policy recursion)", async () => {
    const sa = await saClient();
    const me = await uid(sa);
    const { data: subs } = await sa
      .from("property_submissions")
      .select("id, client_safe_remarks")
      .eq("supply_agent_id", me)
      .limit(1);
    expect(subs?.length).toBe(1);
    const { error } = await sa
      .from("property_submissions")
      .update({ client_safe_remarks: subs![0].client_safe_remarks })
      .eq("id", subs![0].id);
    expect(error, error?.message).toBeNull();
  });

  it("collaborator profile visibility still works after the definer-fn rewrite", async () => {
    const ra = await raClient();
    const sa = await saClient();
    const saId = await uid(sa);
    const { data } = await ra.from("profiles").select("display_name").eq("id", saId).maybeSingle();
    expect(data?.display_name).toBeTruthy();
  });
});
