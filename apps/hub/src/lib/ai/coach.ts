import "server-only";
import { z } from "zod";
import { runAi, type DeniedReason } from "./engine";
import { langOf, matchObjection, SCENARIOS } from "./coach-rules";

/**
 * The Coach: objections (what it means, three approaches, a sample reply)
 * and practice (score the agent's own reply, show a stronger one).
 *
 * Linked AG Hero agents also get the deep link to Sales Lab / AI Coach from
 * the directory; this is the in-hub version every verified agent has.
 */
export type ObjectionAdvice = {
  meaning: string;
  approaches: { name: string; how: string }[];
  sampleReply: string;
  followUpQuestion: string;
  matchedKey: string | null;
  source: "ai" | "rules";
  reason?: DeniedReason | "failed";
  model?: string;
};

export type PracticeFeedback = {
  scores: { clarity: number; empathy: number; next_step: number } | null;
  feedback: string[];
  improvedReply: string | null;
  tryNext: string | null;
  source: "ai" | "rules";
  reason?: DeniedReason | "failed";
  model?: string;
};

const objectionSchema = z.object({
  meaning: z.string().min(10).max(400),
  approaches: z.array(z.object({ name: z.string().min(2).max(60), how: z.string().min(10).max(400) })).min(2).max(3),
  sample_reply: z.string().min(20).max(900),
  follow_up_question: z.string().min(5).max(240),
});

const practiceSchema = z.object({
  scores: z.object({ clarity: z.number().int().min(1).max(5), empathy: z.number().int().min(1).max(5), next_step: z.number().int().min(1).max(5) }),
  feedback: z.array(z.string().min(3).max(240)).min(1).max(4),
  improved_reply: z.string().min(20).max(900),
  try_next: z.string().min(5).max(240),
});

export async function coachObjection(input: { text: string; context: string; userId: string; locale: string }): Promise<ObjectionAdvice> {
  const lang = langOf(input.locale);
  const hit = matchObjection(input.text);
  const floor: ObjectionAdvice | null = hit
    ? { meaning: hit.meaning[lang], approaches: hit.approaches[lang], sampleReply: hit.sample[lang], followUpQuestion: hit.followUp[lang], matchedKey: hit.key, source: "rules" }
    : null;

  const res = await runAi(
    "coach",
    { mode: "objection", context: input.context || "—", client: input.text, agent_reply: "—", library_hint: hit ? { key: hit.key, approaches: hit.approaches[lang] } : "none" },
    objectionSchema,
    { userId: input.userId, locale: input.locale, refType: "coach_objection" },
  );
  if (res.ok) {
    const o = res.output;
    return { meaning: o.meaning, approaches: o.approaches, sampleReply: o.sample_reply, followUpQuestion: o.follow_up_question, matchedKey: hit?.key ?? null, source: "ai", model: `${res.provider}/${res.model}` };
  }
  const reason = res.kind === "denied" ? res.reason : "failed";
  if (floor) return { ...floor, reason };
  return { meaning: "", approaches: [], sampleReply: "", followUpQuestion: "", matchedKey: null, source: "rules", reason };
}

export async function coachPractice(input: { scenarioKey: string; reply: string; userId: string; locale: string }): Promise<PracticeFeedback> {
  const lang = langOf(input.locale);
  const scenario = SCENARIOS.find((s) => s.key === input.scenarioKey);
  if (!scenario) throw new Error("unknown scenario");

  const res = await runAi(
    "coach",
    { mode: "practice", context: scenario.context[lang], client: scenario.client[lang], agent_reply: input.reply },
    practiceSchema,
    { userId: input.userId, locale: input.locale, refType: "coach_practice", refId: undefined },
  );
  if (res.ok) {
    const o = res.output;
    return { scores: o.scores, feedback: o.feedback, improvedReply: o.improved_reply, tryNext: o.try_next, source: "ai", model: `${res.provider}/${res.model}` };
  }
  // No model: the rules can still say something true about the reply itself.
  const r = input.reply.trim();
  const feedback: string[] = [];
  const hasQuestion = /\?/.test(r);
  const hasNext = /\b(viewing|lihat|lawat|call|telepon|hubungi|send|kirim|hantar|tomorrow|besok|esok|today|hari ini|jam|pukul|\d{1,2}[:.]\d{2})\b/i.test(r);
  if (r.length < 60) feedback.push(lang === "id" ? "Balasan sangat singkat — tambahkan satu kalimat yang menunjukkan Anda mendengar." : lang === "ms" ? "Balasan sangat ringkas — tambah satu ayat yang menunjukkan anda mendengar." : "Very short — add one sentence that shows you heard them.");
  if (!hasQuestion) feedback.push(lang === "id" ? "Tidak ada pertanyaan — akhiri dengan satu pertanyaan agar percakapan berlanjut." : lang === "ms" ? "Tiada soalan — akhiri dengan satu soalan supaya perbualan berterusan." : "No question — end with one question so the conversation continues.");
  if (!hasNext) feedback.push(lang === "id" ? "Belum ada langkah berikutnya yang konkret (waktu lihat, telepon, kirim dokumen)." : lang === "ms" ? "Belum ada langkah seterusnya yang konkrit (masa lawatan, panggilan, hantar dokumen)." : "No concrete next step yet (a viewing time, a call, a document to send).");
  if (!feedback.length) feedback.push(lang === "id" ? "Sudah baik: ada empati, ada pertanyaan, ada langkah berikutnya." : lang === "ms" ? "Sudah baik: ada empati, ada soalan, ada langkah seterusnya." : "Good: it listens, asks and proposes a next step.");
  return { scores: null, feedback, improvedReply: null, tryNext: null, source: "rules", reason: res.kind === "denied" ? res.reason : "failed" };
}
