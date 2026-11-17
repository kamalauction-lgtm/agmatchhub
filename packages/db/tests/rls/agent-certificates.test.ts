import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, hasEnv, fixtureEmail } from "./setup";

/**
 * Migration 00131: agent certificates (optional; proof required; admin
 * approves; public "Certified" only while approved and unexpired).
 *
 *   · submit needs the country's certificate type, a valid number, a future
 *     expiry and an uploaded proof in the agent's own folder;
 *   · a country without the setting offers no certificate;
 *   · the agent cannot write the table or read another agent's proof;
 *   · only agent.verify in the agent's country reviews; never yourself; a
 *     rejection needs a reason;
 *   · approved and unexpired shows on public_agent_profiles; pending,
 *     rejected and expired do not;
 *   · the expiry reminder picks approved certificates expiring within 30 days
 *     once, and only the service role may run it.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "agent-certificates-private";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!hasEnv || !SERVICE)("agent certificates (00131)", () => {
  let service: SupabaseClient;
  const users: string[] = [];
  const grants: string[] = [];
  const files: string[] = [];
  let seq = 0;

  async function person(tag: string, country = "ID") {
    const email = fixtureEmail(`c131-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { display_name: `c131 ${tag}`, country_code: country },
    });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error: e2 } = await c.auth.signInWithPassword({ email, password });
    if (e2) throw new Error(e2.message);
    return { id: data.user.id, c };
  }
  async function admin(tag: string, countries: string[]) {
    const a = await person(tag);
    const { data: role } = await service.from("roles").select("id").eq("key", "country_admin").single();
    const { data, error } = await service.from("user_roles").insert({ user_id: a.id, role_id: role!.id, country_codes: countries }).select("id").single();
    if (error) throw new Error(`grant: ${error.message}`);
    grants.push(data.id);
    return a;
  }
  async function upload(a: { id: string; c: SupabaseClient }) {
    const path = `${a.id}/proof-${Date.now()}-${seq++}.pdf`;
    const { error } = await a.c.storage.from(BUCKET).upload(path, PDF, { contentType: "application/pdf" });
    if (error) throw new Error(`upload: ${error.message}`);
    files.push(path);
    return path;
  }
  const submit = async (c: SupabaseClient, f: Record<string, unknown>) =>
    (await c.rpc("agent_submit_certificate", f)).data as { ok: boolean; error?: string; certificate?: string };
  const publicRow = async (id: string) => {
    await service.from("profiles").update({ public_slug: `c131-${id.slice(0, 8)}-${seq++}` }).eq("id", id);
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    return (await anon.from("public_agent_profiles").select("is_certified, certificate_number").eq("id", id).single()).data;
  };

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    if (!service) return;
    if (files.length) await service.storage.from(BUCKET).remove(files);
    if (users.length) await service.from("agent_certificates").delete().in("user_id", users);
    for (const g of grants) await service.from("user_roles").delete().eq("id", g);
    for (const u of users) {
      const { error } = await service.auth.admin.deleteUser(u);
      if (error) console.error(`agent-certificates cleanup: ${u}: ${error.message}`);
    }
  });

  it("submit requires the country's type, a valid number, a future expiry and own proof", async () => {
    const a = await person("submit");
    const other = await person("other");
    const proof = await upload(a);
    const theirs = await upload(other);
    const base = { p_type: "SERTIFIKAT_KOMPETENSI", p_number: "LSP-123/2026", p_expires: day(365), p_document_path: proof };
    expect(await submit(a.c, { ...base, p_type: "REN" })).toMatchObject({ ok: false, error: "type_not_offered" });
    expect(await submit(a.c, { ...base, p_number: "<script>" })).toMatchObject({ ok: false, error: "invalid_number" });
    expect(await submit(a.c, { ...base, p_expires: day(-1) })).toMatchObject({ ok: false, error: "invalid_expiry" });
    expect(await submit(a.c, { ...base, p_document_path: `${a.id}/missing.pdf` })).toMatchObject({ ok: false, error: "proof_required" });
    expect(await submit(a.c, { ...base, p_document_path: theirs })).toMatchObject({ ok: false, error: "proof_required" });
    const r = await submit(a.c, base);
    expect(r).toMatchObject({ ok: true });
    const { data: row } = await service.from("agent_certificates").select("status, cert_number, country_code").eq("id", r.certificate!).single();
    expect(row).toMatchObject({ status: "pending", cert_number: "LSP-123/2026", country_code: "ID" });
  });

  it("a country without certificate types offers none", async () => {
    const my = await person("my", "MY");
    const proof = await upload(my);
    expect(await submit(my.c, { p_type: "SERTIFIKAT_KOMPETENSI", p_number: "ABC123", p_expires: day(100), p_document_path: proof }))
      .toMatchObject({ ok: false, error: "type_not_offered" });
  });

  it("agents cannot write the table or read another agent's proof", async () => {
    const a = await person("direct");
    const b = await person("peek");
    const proof = await upload(a);
    expect((await a.c.from("agent_certificates").insert({ user_id: a.id, country_code: "ID", cert_type: "SERTIFIKAT_KOMPETENSI", cert_number: "X1", expires_on: day(10), document_path: proof, status: "approved" })).error).not.toBeNull();
    const { data } = await b.c.storage.from(BUCKET).download(proof);
    expect(data).toBeNull();
    expect((await b.c.storage.from(BUCKET).upload(`${a.id}/planted.pdf`, PDF, { contentType: "application/pdf" })).error).not.toBeNull();
  });

  it("review: country-scoped, never yourself, a rejection needs a reason; public shows approved only", async () => {
    const a = await person("review");
    const idAdmin = await admin("id-admin", ["ID"]);
    const myAdmin = await admin("my-admin", ["MY"]);
    const r = await submit(a.c, { p_type: "SERTIFIKAT_KOMPETENSI", p_number: "BNSP 0001", p_expires: day(400), p_document_path: await upload(a) });
    expect((await publicRow(a.id))?.is_certified).toBe(false);
    expect((await myAdmin.c.rpc("admin_review_certificate", { p_id: r.certificate, p_decision: "approve" })).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await a.c.rpc("admin_review_certificate", { p_id: r.certificate, p_decision: "approve" })).data).toMatchObject({ ok: false });
    expect((await idAdmin.c.rpc("admin_review_certificate", { p_id: r.certificate, p_decision: "reject" })).data).toMatchObject({ ok: false, error: "note_required" });
    expect((await idAdmin.c.rpc("admin_review_certificate", { p_id: r.certificate, p_decision: "approve" })).data).toMatchObject({ ok: true, status: "approved" });
    expect(await publicRow(a.id)).toMatchObject({ is_certified: true, certificate_number: "BNSP 0001" });
    const { data: audit } = await service.from("audit_logs").select("actor_id").eq("action", "agent.certificate_approved").eq("entity_id", r.certificate!);
    expect(audit?.[0]?.actor_id).toBe(idAdmin.id);
    // A second, rejected submission does not remove the approved one.
    const r2 = await submit(a.c, { p_type: "SERTIFIKAT_KOMPETENSI", p_number: "BNSP 0002", p_expires: day(500), p_document_path: await upload(a) });
    expect((await idAdmin.c.rpc("admin_review_certificate", { p_id: r2.certificate, p_decision: "reject", p_note: "Proof unreadable." })).data).toMatchObject({ ok: true, status: "rejected" });
    expect(await publicRow(a.id)).toMatchObject({ is_certified: true, certificate_number: "BNSP 0001" });
  });

  it("an expired certificate disappears from the public profile", async () => {
    const a = await person("expired");
    const idAdmin = await admin("id-admin2", ["ID"]);
    const r = await submit(a.c, { p_type: "SERTIFIKAT_KOMPETENSI", p_number: "OLD-1", p_expires: day(5), p_document_path: await upload(a) });
    await idAdmin.c.rpc("admin_review_certificate", { p_id: r.certificate, p_decision: "approve" });
    expect((await publicRow(a.id))?.is_certified).toBe(true);
    await service.from("agent_certificates").update({ expires_on: day(-1) }).eq("id", r.certificate!);
    expect((await publicRow(a.id))?.is_certified).toBe(false);
  });

  it("expiry reminders: within 30 days, once, service role only", async () => {
    const a = await person("remind");
    const idAdmin = await admin("id-admin3", ["ID"]);
    const r = await submit(a.c, { p_type: "SERTIFIKAT_KOMPETENSI", p_number: "SOON-1", p_expires: day(20), p_document_path: await upload(a) });
    await idAdmin.c.rpc("admin_review_certificate", { p_id: r.certificate, p_decision: "approve" });
    expect((await a.c.rpc("certificates_due_reminder")).error).not.toBeNull();
    const first = (await service.rpc("certificates_due_reminder")).data as { user_id: string }[];
    expect(first.some((x) => x.user_id === a.id)).toBe(true);
    const second = (await service.rpc("certificates_due_reminder")).data as { user_id: string }[];
    expect(second.some((x) => x.user_id === a.id)).toBe(false);
  });
});
