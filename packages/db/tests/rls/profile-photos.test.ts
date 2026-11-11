import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, hasEnv, fixtureEmail, fixtureName } from "./setup";

/**
 * Migration 00118: profile photos are cleaned before they are public (P1-b-4,
 * owner decision 11 Nov 2026).
 *
 *   · an agent can no longer write to agent-profile-public directly — not a
 *     new file, not an overwrite;
 *   · profiles.avatar_url accepts only null or the agent's own cleaned file
 *     (`<uid>/avatar-<hash16>.webp`); another agent's file, a raw upload name
 *     or an arbitrary path is refused;
 *   · the service role (the Hub, after its checks) still writes both.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "agent-profile-public";
// A 1x1 WebP, so the bucket's mime rule is not what refuses the agent.
const WEBP = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64");

describe.skipIf(!hasEnv || !SERVICE)("profile photos (00118)", () => {
  let service: SupabaseClient;
  let agent: SupabaseClient;
  let agentId = "";
  let otherId = "";
  const users: string[] = [];
  const files: string[] = [];
  let seq = 0;
  const own = (h = "0123456789abcdef") => `${agentId}/avatar-${h}.webp`;

  async function person(tag: string) {
    const email = fixtureEmail(`p1b4-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(`p1b4 ${tag}`), agent_status: "verified", country_code: "MY" });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { id: data.user.id, c };
  }

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    const a = await person("agent"); agent = a.c; agentId = a.id;
    otherId = (await person("other")).id;
  });

  afterAll(async () => {
    if (!service) return;
    if (files.length) await service.storage.from(BUCKET).remove(files);
    for (const u of users) await service.auth.admin.deleteUser(u);
  });

  it("an agent cannot write to the public profile bucket directly", async () => {
    const path = `${agentId}/photo-${Date.now()}.webp`;
    const { error } = await agent.storage.from(BUCKET).upload(path, WEBP, { contentType: "image/webp" });
    expect(error).not.toBeNull();
    const { data } = await service.storage.from(BUCKET).list(agentId);
    expect((data ?? []).filter((f) => !f.name.startsWith("."))).toHaveLength(0);
  });

  it("an agent cannot overwrite a file the Hub stored", async () => {
    const path = own("aaaaaaaaaaaaaaaa");
    expect((await service.storage.from(BUCKET).upload(path, WEBP, { contentType: "image/webp" })).error).toBeNull();
    files.push(path);
    const { error } = await agent.storage.from(BUCKET).upload(path, Buffer.from("raw original"), { contentType: "image/webp", upsert: true });
    expect(error).not.toBeNull();
    const { data } = await service.storage.from(BUCKET).download(path);
    expect(Buffer.from(await data!.arrayBuffer()).equals(WEBP)).toBe(true);
  });

  it("avatar_url refuses another agent's file, a raw upload name and arbitrary paths", async () => {
    for (const bad of [`${otherId}/avatar-0123456789abcdef.webp`, `${agentId}/photo-1723190400000.png`, `${agentId}/avatar-0123456789abcdef.png`, "https://example.test/x.webp", `../${agentId}/avatar-0123456789abcdef.webp`]) {
      const { error } = await agent.from("profiles").update({ avatar_url: bad }).eq("id", agentId);
      expect(error, bad).not.toBeNull();
    }
    const { data } = await service.from("profiles").select("avatar_url").eq("id", agentId).single();
    expect(data!.avatar_url).toBeNull();
  });

  it("avatar_url accepts the agent's own cleaned file (with or without the bucket prefix) and null", async () => {
    expect((await agent.from("profiles").update({ avatar_url: own() }).eq("id", agentId)).error).toBeNull();
    expect((await agent.from("profiles").update({ avatar_url: `${BUCKET}/${own("fedcba9876543210")}` }).eq("id", agentId)).error).toBeNull();
    expect((await agent.from("profiles").update({ avatar_url: null }).eq("id", agentId)).error).toBeNull();
    // Unrelated profile edits are untouched by the guard.
    expect((await agent.from("profiles").update({ display_name: fixtureName("p1b4 renamed") }).eq("id", agentId)).error).toBeNull();
  });

  it("the service role still sets any avatar_url (the Hub after its checks)", async () => {
    const { error } = await service.from("profiles").update({ avatar_url: `${agentId}/legacy.png` }).eq("id", agentId);
    expect(error).toBeNull();
  });
});
