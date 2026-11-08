import "server-only";
import { z } from "zod";
import { runAi, type DeniedReason } from "./engine";
import type { ProposedTask } from "./task-rules";

/**
 * The Task Planner: proposes tasks from a text; the agent confirms each one.
 * Rules give the floor (lib/ai/task-rules.ts); the model reads the actual
 * message and the actual brief when it can.
 */
export type TaskProposal = { tasks: ProposedTask[]; source: "ai" | "rules"; reason?: DeniedReason | "failed"; model?: string };

const schema = z.object({
  tasks: z.array(z.object({
    title: z.string().min(3).max(160),
    due_at: z.string().nullable(),
    kind: z.enum(["call", "message", "viewing", "document", "follow_up", "other"]).default("other"),
  })).max(5),
});

export async function proposeTasks(input: {
  userId: string; locale: string; source: "lead" | "brief"; text: string; today: string; floor: ProposedTask[]; refType?: string; refId?: string;
}): Promise<TaskProposal> {
  const res = await runAi(
    "task_extract",
    { today: input.today, source: input.source, text: input.text, rules_suggestion: input.floor },
    schema,
    { userId: input.userId, locale: input.locale, refType: input.refType ?? input.source, refId: input.refId },
  );
  if (res.ok) {
    const tasks = res.output.tasks.map((t) => ({
      title: t.title,
      kind: t.kind,
      // Only accept a parseable future-ish instant; otherwise leave it for the agent.
      dueAt: t.due_at && !Number.isNaN(Date.parse(t.due_at)) ? new Date(t.due_at).toISOString() : null,
    }));
    return { tasks: tasks.length ? tasks : input.floor, source: "ai", model: `${res.provider}/${res.model}` };
  }
  return { tasks: input.floor, source: "rules", reason: res.kind === "denied" ? res.reason : "failed" };
}
