import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, saClient, raClient, adminClient, hasEnv, fixtureEmail, fixtureName, uid } from "./setup";

/**
 * Migration 00106 — agent invitations (P0-b, owner-approved Option B).
 *
 *   · agent.invite is held by exactly super_admin, admin and country_admin;
 *   · an admin manages invitations only in countries they hold it for;
 *   · other roles, agents and anonymous are refused;
 *   · the database stores only the SHA-256 of the token;
 *   · revoked, expired, already-redeemed and rotated tokens cannot be used,
 *     the e-mail must match, and redemption is rate limited;
 *   · create, resend, revoke and redeem are audited with the real actor;
 *   · the inviter cannot approve the invitee's verification (database level).
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasAdminEnv = !!(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const token = () => randomBytes(32).toString("base64url");

describe.skipIf(!hasEnv || !SERVICE || !hasAdminEnv)("agent invitations (00106)", () => {
  let service: SupabaseClient;
  let scoped: SupabaseClient;   // SA + country_admin {MY} for this file
  let scopedId: string;
  let compliance: SupabaseClient; // RA + compliance_admin for this file
  let global: SupabaseClient;   // the standing super_admin
  let globalId: string;
  const grants: string[] = [];
  const users: string[] = [];
  const invitations: string[] = [];
  let seq = 0;

  /** A throwaway account we can sign in as. */
  const freshEmail = (tag: string) => fixtureEmail(`${tag}-${Date.now()}-${seq++}`);
  const person = async (tag: string, country: string | null, email = freshEmail(tag)) => {
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`fixture user: ${error.message}`);
    users.push(data.user.id);
    await service.from("profiles").upsert({
      id: data.user.id, display_name: fixtureName(tag), agent_status: "under_review", country_code: country,
    });
    const client = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error: sErr } = await client.auth.signInWithPassword({ email, password });
    if (sErr) throw new Error(`fixture sign-in: ${sErr.message}`);
    return { id: data.user.id, email, client };
  };

  const grant = async (client: SupabaseClient, roleKey: string, countries: string[]) => {
    const { data: role } = await service.from("roles").select("id").eq("key", roleKey).single();
    const { data, error } = await service
      .from("user_roles")
      .insert({ user_id: await uid(client), role_id: role!.id, country_codes: countries })
      .select("id").single();
    if (error) throw new Error(`grant ${roleKey}: ${error.message}`);
    grants.push(data.id);
  };

  const invite = async (c: SupabaseClient, country: string, email: string, tok = token()) => {
    const { data, error } = await c.rpc("agent_invitation_create", {
      p_token_hash: sha(tok), p_country: country, p_full_name: fixtureName("invitee"), p_email: email,
    });
    if (data) invitations.push(data as string);
    return { id: data as string | null, error, tok };
  };

  const redeem = async (c: SupabaseClient, tok: string) => {
    const { data, error } = await c.rpc("redeem_agent_invitation", { p_token_hash: sha(tok), p_ip_hash: null });
    if (error) throw new Error(`redeem rpc error: ${error.message}`);
    return data as { ok: boolean; error?: string; country_code?: string };
  };

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    scoped = await saClient();
    scopedId = await uid(scoped);
    compliance = await raClient();
    global = await adminClient();
    globalId = await uid(global);
    await grant(scoped, "country_admin", ["MY"]);
    await grant(compliance, "compliance_admin", []);
  });

  afterAll(async () => {
    if (invitations.length) await service.from("agent_invitations").delete().in("id", invitations);
    for (const id of users) {
      await service.from("agent_invitation_attempts").delete().eq("bucket", `user:${id}`);
      await service.from("agent_verifications").delete().eq("user_id", id);
      await service.auth.admin.deleteUser(id);
    }
    if (grants.length) await service.from("user_roles").delete().in("id", grants);
  });

  describe("who may invite", () => {
    it("agent.invite is granted to exactly super_admin, admin and country_admin", async () => {
      const { data } = await service
        .from("role_capabilities")
        .select("roles(key)")
        .eq("capability_key", "agent.invite");
      const keys = (data ?? []).map((r) => (r.roles as unknown as { key: string }).key).sort();
      expect(keys).toEqual(["admin", "country_admin", "super_admin"]);
    });

    it("a MY country admin can invite in MY and read it", async () => {
      const r = await invite(scoped, "MY", fixtureEmail(`inv-my-${Date.now()}`));
      expect(r.error).toBeNull();
      const { data } = await scoped.from("agent_invitations").select("id").eq("id", r.id!).maybeSingle();
      expect(data?.id).toBe(r.id);
    });

    it("but not in ID", async () => {
      const r = await invite(scoped, "ID", fixtureEmail(`inv-id-${Date.now()}`));
      expect(r.error?.code).toBe("42501");
      expect(r.id).toBeNull();
    });

    it("cannot see, resend or revoke an ID invitation", async () => {
      const g = await invite(global, "ID", fixtureEmail(`inv-g-${Date.now()}`));
      expect(g.error).toBeNull();
      const { data } = await scoped.from("agent_invitations").select("id").eq("id", g.id!).maybeSingle();
      expect(data).toBeNull();
      const re = await scoped.rpc("agent_invitation_resend", { p_id: g.id!, p_new_token_hash: sha(token()) });
      expect(re.error?.code).toBe("42501");
      const rv = await scoped.rpc("agent_invitation_revoke", { p_id: g.id!, p_reason: "test" });
      expect(rv.error?.code).toBe("42501");
    });

    it("a compliance admin cannot invite anywhere", async () => {
      const r = await invite(compliance, "MY", fixtureEmail(`inv-c-${Date.now()}`));
      expect(r.error?.code).toBe("42501");
    });

    it("a plain agent cannot invite or read invitations", async () => {
      const a = await person("p0b-agent", "MY");
      const r = await invite(a.client, "MY", fixtureEmail(`inv-a-${Date.now()}`));
      expect(r.error?.code).toBe("42501");
      const { data } = await a.client.from("agent_invitations").select("id");
      expect(data ?? []).toHaveLength(0);
    });

    it("anonymous cannot read invitations or call the functions", async () => {
      const anon = anonClient();
      const { data } = await anon.from("agent_invitations").select("id");
      expect(data ?? []).toHaveLength(0);
      const r = await anon.rpc("agent_invitation_create", {
        p_token_hash: sha(token()), p_country: "MY", p_full_name: "x", p_email: "x@example.test",
      });
      expect(r.error).not.toBeNull();
      const d = await anon.rpc("redeem_agent_invitation", { p_token_hash: sha(token()) });
      expect(d.error).not.toBeNull();
    });

    it("an inviting admin still cannot grant roles", async () => {
      const { data: role } = await service.from("roles").select("id").eq("key", "country_admin").single();
      const { error } = await scoped.from("user_roles").insert({ user_id: globalId, role_id: role!.id });
      expect(error).not.toBeNull();
    });
  });

  describe("tokens", () => {
    it("only the SHA-256 of the token is stored", async () => {
      const email = fixtureEmail(`inv-hash-${Date.now()}`);
      const r = await invite(scoped, "MY", email);
      const { data } = await service.from("agent_invitations").select("*").eq("id", r.id!).single();
      expect(data!.token_hash).toBe(sha(r.tok));
      expect(JSON.stringify(data)).not.toContain(r.tok);
    });

    it("a valid token redeems once, for the invited e-mail only", async () => {
      const email = freshEmail("p0b-invitee");
      const r = await invite(scoped, "MY", email);
      const invitee = await person("p0b-invitee", null, email);
      const stranger = await person("p0b-stranger", null);
      expect((await redeem(stranger.client, r.tok)).error).toBe("email_mismatch");
      const ok = await redeem(invitee.client, r.tok);
      expect(ok.ok).toBe(true);
      expect(ok.country_code).toBe("MY");
      const { data: prof } = await service.from("profiles").select("country_code").eq("id", invitee.id).single();
      expect(prof!.country_code).toBe("MY");
      expect((await redeem(invitee.client, r.tok)).error).toBe("invalid"); // already redeemed
    });

    it("a revoked token cannot be used", async () => {
      const email = freshEmail("p0b-revoked");
      const r = await invite(scoped, "MY", email);
      const invitee = await person("p0b-revoked", null, email);
      expect((await scoped.rpc("agent_invitation_revoke", { p_id: r.id!, p_reason: "test" })).error).toBeNull();
      expect((await redeem(invitee.client, r.tok)).error).toBe("invalid");
    });

    it("an expired token cannot be used", async () => {
      const email = freshEmail("p0b-expired");
      const r = await invite(scoped, "MY", email);
      const invitee = await person("p0b-expired", null, email);
      await service.from("agent_invitations").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", r.id!);
      expect((await redeem(invitee.client, r.tok)).error).toBe("invalid");
    });

    it("resend rotates the token: the old link stops working, the new one works", async () => {
      const email = freshEmail("p0b-resent");
      const r = await invite(scoped, "MY", email);
      const invitee = await person("p0b-resent", null, email);
      const fresh = token();
      expect((await scoped.rpc("agent_invitation_resend", { p_id: r.id!, p_new_token_hash: sha(fresh) })).error).toBeNull();
      expect((await redeem(invitee.client, r.tok)).error).toBe("invalid");
      expect((await redeem(invitee.client, fresh)).ok).toBe(true);
    });

    it("redemption is rate limited per account, and the attempts are kept", async () => {
      const guesser = await person("p0b-guesser", null);
      for (let i = 0; i < 10; i++) {
        expect((await redeem(guesser.client, token())).error).toBe("invalid");
      }
      expect((await redeem(guesser.client, token())).error).toBe("rate_limited");
      const { count } = await service
        .from("agent_invitation_attempts")
        .select("id", { count: "exact", head: true })
        .eq("bucket", `user:${guesser.id}`);
      expect(count).toBe(10);
    });
  });

  describe("audit", () => {
    it("create, resend, revoke and redeem are logged with the real actor", async () => {
      const email = freshEmail("p0b-audit");
      const a = await invite(scoped, "MY", email);
      const invitee = await person("p0b-audit", null, email);
      const fresh = token();
      await scoped.rpc("agent_invitation_resend", { p_id: a.id!, p_new_token_hash: sha(fresh) });
      await redeem(invitee.client, fresh);
      const b = await invite(scoped, "MY", fixtureEmail(`inv-audit-b-${Date.now()}`));
      await global.rpc("agent_invitation_revoke", { p_id: b.id!, p_reason: "audit test" });

      const rows = async (id: string) =>
        (await service.from("audit_logs").select("action, actor_id, actor_role, result").eq("entity_id", id)).data ?? [];
      const ra = await rows(a.id!);
      const rb = await rows(b.id!);
      const find = (rs: typeof ra, action: string) => rs.find((r) => r.action === action);
      expect(find(ra, "agent_invitation.created")).toMatchObject({ actor_id: scopedId, actor_role: "country_admin" });
      expect(find(ra, "agent_invitation.resent")).toMatchObject({ actor_id: scopedId, actor_role: "country_admin" });
      expect(find(ra, "agent_invitation.redeemed")).toMatchObject({ actor_id: invitee.id });
      expect(find(rb, "agent_invitation.revoked")).toMatchObject({ actor_id: globalId, actor_role: "super_admin" });
    });

    it("a refused redeem is logged as denied, with the caller as actor", async () => {
      const email = freshEmail("p0b-audit-refused");
      const r = await invite(scoped, "MY", email);
      const invitee = await person("p0b-audit-refused", null, email);
      await scoped.rpc("agent_invitation_revoke", { p_id: r.id!, p_reason: "test" });
      await redeem(invitee.client, r.tok);
      const { data } = await service
        .from("audit_logs")
        .select("actor_id, result, reason")
        .eq("entity_id", r.id!)
        .eq("action", "agent_invitation.redeem_refused")
        .single();
      expect(data).toMatchObject({ actor_id: invitee.id, result: "denied", reason: "revoked" });
    });
  });

  describe("separation of duties (database level)", () => {
    let inviteeId: string;

    beforeAll(async () => {
      const email = freshEmail("p0b-sod");
      const r = await invite(scoped, "MY", email);
      const invitee = await person("p0b-sod", null, email);
      inviteeId = invitee.id;
      expect((await redeem(invitee.client, r.tok)).ok).toBe(true);
    });

    it("the inviting admin cannot set the invitee to verified", async () => {
      const { error } = await scoped.from("profiles").update({ agent_status: "verified" }).eq("id", inviteeId);
      expect(error?.code).toBe("42501");
      const { data } = await service.from("profiles").select("agent_status").eq("id", inviteeId).single();
      expect(data!.agent_status).toBe("under_review");
    });

    it("nor record an approval for them", async () => {
      const { error } = await scoped
        .from("agent_verifications")
        .insert({ user_id: inviteeId, action: "approved", acted_by: scopedId });
      expect(error?.code).toBe("42501");
    });

    it("but may still ask them for more information", async () => {
      const { error } = await scoped
        .from("profiles")
        .update({ agent_status: "additional_information_required" })
        .eq("id", inviteeId);
      expect(error).toBeNull();
      await service.from("profiles").update({ agent_status: "under_review" }).eq("id", inviteeId);
    });

    it("another admin can verify them", async () => {
      const { error } = await global.from("profiles").update({ agent_status: "verified" }).eq("id", inviteeId);
      expect(error).toBeNull();
    });
  });
});
