import { describe, it, expect, afterAll } from "vitest";
import { hasEnv, hasPairEnv, raClient, saClient, laClient, uid } from "./setup";

/**
 * Migration 00087: tasks are private to their agent; a viewing anchored to a
 * marketplace lead is visible to the lead's agent and to nobody else; the
 * one-anchor rule holds.
 */
describe.skipIf(!hasEnv || !hasPairEnv)("tasks & lead viewings (00087)", () => {
  const made: { tasks: string[]; viewings: string[] } = { tasks: [], viewings: [] };

  afterAll(async () => {
    // Own rows, deleted by their owner — the policies allow it.
    const la = await laClient();
    if (made.tasks.length) await la.from("agent_tasks").delete().in("id", made.tasks);
    if (made.viewings.length) await la.from("viewing_appointments").update({ status: "cancelled" }).in("id", made.viewings);
  });

  it("an agent creates, reads, updates and deletes their own tasks; another agent sees none of it", async () => {
    const la = await laClient();
    const ra = await raClient();
    const me = await uid(la);
    const { data: task, error } = await la
      .from("agent_tasks")
      .insert({ agent_id: me, title: "[fixture] call Siti", kind: "call", source: "task_extract", due_at: new Date().toISOString() })
      .select("id, status")
      .single();
    expect(error, error?.message).toBeNull();
    made.tasks.push(task!.id);

    const { data: theirs } = await ra.from("agent_tasks").select("id").eq("id", task!.id);
    expect(theirs ?? []).toHaveLength(0);
    const { data: forged } = await ra.from("agent_tasks").update({ status: "done" }).eq("id", task!.id).select();
    expect(forged ?? []).toHaveLength(0);

    const { error: upd } = await la.from("agent_tasks").update({ status: "done", done_at: new Date().toISOString() }).eq("id", task!.id);
    expect(upd).toBeNull();
    const raId = await uid(ra);
    const { error: spoof } = await ra.from("agent_tasks").insert({ agent_id: me, title: "not mine", kind: "other" });
    expect(spoof).not.toBeNull();
    void raId;
  });

  it("a lead viewing is visible to the lead's agent only, and needs exactly one anchor", async () => {
    const la = await laClient();
    const sa = await saClient();
    const ra = await raClient();
    const me = await uid(la);
    const { data: lead } = await la.from("leads").select("id, listing_id").eq("human_readable_id", "LEAD-2026-900001").single();
    const { data: humanId } = await la.rpc("next_human_id", { p_prefix: "VIEW" });

    const { data: v, error } = await la
      .from("viewing_appointments")
      .insert({ human_readable_id: humanId, lead_id: lead!.id, listing_id: lead!.listing_id, proposed_by: me, proposed_date: "2026-12-01", proposed_time: "10:00", viewing_type: "physical", status: "confirmed" })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    made.viewings.push(v!.id);

    for (const other of [sa, ra]) {
      const { data } = await other.from("viewing_appointments").select("id").eq("id", v!.id);
      expect(data ?? []).toHaveLength(0);
    }
    const raId = await uid(ra);
    const { error: forged } = await ra.from("viewing_appointments").insert({
      human_readable_id: `${humanId}-x`, lead_id: lead!.id, proposed_by: raId, proposed_date: "2026-12-02", viewing_type: "physical",
    });
    expect(forged).not.toBeNull();

    // both anchors, or neither, is refused by the check constraint
    const { error: twoAnchors } = await la.from("viewing_appointments").insert({
      human_readable_id: `${humanId}-y`, lead_id: lead!.id, submission_id: lead!.id, proposed_by: me, proposed_date: "2026-12-03", viewing_type: "physical",
    });
    expect(twoAnchors).not.toBeNull();
  });
});
