import { describe, it, expect } from "vitest";
import { hasEnv, raClient, saClient, uid } from "./setup";

describe.skipIf(!hasEnv)("trust profile (§71) + recursion regressions (00020/00021)", () => {
  it("agent can update own profile fields (no 42P17 recursion)", async () => {
    const sa = await saClient();
    const me = await uid(sa);
    const { error, data } = await sa
      .from("profiles")
      .update({ display_name: "Supply Sally" })
      .eq("id", me)
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("agent can update own biography (no 42P17 recursion)", async () => {
    const sa = await saClient();
    const me = await uid(sa);
    const { error } = await sa
      .from("agent_profiles")
      .update({ biography: "8 years in KL condo market. Specialist in Mont Kiara and Sri Hartamas. English, Malay, Mandarin." })
      .eq("user_id", me)
      .select();
    expect(error).toBeNull();
  });

  it("agent cannot forge review fields on own agent profile", async () => {
    const sa = await saClient();
    const me = await uid(sa);
    const { error } = await sa
      .from("agent_profiles")
      .update({ reviewed_by: me })
      .eq("user_id", me)
      .select();
    expect(error).not.toBeNull();
  });

  it("agent cannot self-verify a social link", async () => {
    const sa = await saClient();
    const me = await uid(sa);
    const { data: links } = await sa
      .from("agent_social_links").select("id").eq("user_id", me).limit(1);
    if (!links?.length) return; // no link seeded — nothing to test
    const { error, data } = await sa
      .from("agent_social_links")
      .update({ verification_status: "verified" })
      .eq("id", links[0].id)
      .select();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it("collaborator sees only verified links of the other agent", async () => {
    const ra = await raClient();
    const sa = await saClient();
    const saId = await uid(sa);
    const { data } = await ra
      .from("agent_social_links")
      .select("verification_status")
      .eq("user_id", saId);
    for (const l of data ?? []) {
      expect(l.verification_status).toBe("verified");
    }
  });

  it("collaborator can read the restricted professional profile", async () => {
    const ra = await raClient();
    const sa = await saClient();
    const saId = await uid(sa);
    const { data } = await ra
      .from("agent_profiles")
      .select("agency_name, licence_number")
      .eq("user_id", saId)
      .maybeSingle();
    expect(data?.agency_name).toBeTruthy();
  });
});
