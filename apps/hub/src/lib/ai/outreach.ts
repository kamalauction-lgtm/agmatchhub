import "server-only";
import { z } from "zod";
import { runAi, type DeniedReason } from "./engine";

/**
 * The Owner Outreach Drafter: the first message to an owner who may want to
 * sell or let. Nothing about the owner is stored — the agent types what they
 * know, gets a draft, and sends it from their own phone or e-mail.
 */
export type OutreachInput = {
  property: string;        // what the agent knows about the property
  source: string;          // how they came across the owner (expired listing, sign, referral…)
  offer: string;           // what the agent brings (buyers waiting, free valuation…)
  channel: "whatsapp" | "email";
  ownerName: string | null;
  agentName: string;
  agencyName: string | null;
};

export type OutreachDraft = {
  message: string; subject: string; followUp: string; tips: string[];
  source: "ai" | "rules"; reason?: DeniedReason | "failed"; model?: string;
};

const schema = z.object({
  message: z.string().min(40).max(1200),
  subject: z.string().max(100).default(""),
  follow_up: z.string().min(20).max(400),
  tips: z.array(z.string().max(160)).max(3).default([]),
});

function ruleDraft(i: OutreachInput, locale: string): Pick<OutreachDraft, "message" | "subject" | "followUp" | "tips"> {
  const who = i.agencyName ? `${i.agentName} (${i.agencyName})` : i.agentName;
  const greet = i.ownerName ? (locale === "en" ? `Hello ${i.ownerName},` : locale === "ms" ? `Salam sejahtera ${i.ownerName},` : `Halo Bapak/Ibu ${i.ownerName},`) : (locale === "en" ? "Hello," : locale === "ms" ? "Salam sejahtera," : "Halo Bapak/Ibu,");
  if (locale === "en") {
    return {
      message: `${greet}\n\nMy name is ${who}, a licensed property agent. I came across your property (${i.property}) ${i.source ? `— ${i.source}` : ""}.\n\n${i.offer || "I have buyers and tenants looking in this area and would be glad to share what similar units have been asking recently."}\n\nWould a short call this week suit you? No obligation at all.\n\n${i.agentName}`,
      subject: `About your property — ${i.property}`.slice(0, 80),
      followUp: `${greet}\n\nJust following up on my note last week about ${i.property}. If the timing is not right, no problem at all — I'm happy to stay in touch and share market updates when useful.\n\n${i.agentName}`,
      tips: ["Send on a weekday between 10:00 and 18:00.", "One follow-up after a week; then leave it.", "Never quote a price before you have seen the unit."],
    };
  }
  if (locale === "ms") {
    return {
      message: `${greet}\n\nSaya ${who}, perunding hartanah berlesen. Saya terjumpa hartanah tuan/puan (${i.property}) ${i.source ? `— ${i.source}` : ""}.\n\n${i.offer || "Saya ada pembeli dan penyewa yang sedang mencari di kawasan ini dan boleh kongsikan harga tawaran unit serupa kebelakangan ini."}\n\nBoleh kita berbual sebentar minggu ini? Tiada sebarang obligasi.\n\n${i.agentName}`,
      subject: `Tentang hartanah tuan/puan — ${i.property}`.slice(0, 80),
      followUp: `${greet}\n\nSekadar susulan mesej saya minggu lepas tentang ${i.property}. Jika masanya belum sesuai, tiada masalah — saya sedia kekal berhubung dan kongsi perkembangan pasaran apabila berguna.\n\n${i.agentName}`,
      tips: ["Hantar pada hari bekerja antara 10:00 dan 18:00.", "Satu susulan selepas seminggu; kemudian biarkan.", "Jangan sebut harga sebelum melihat unit."],
    };
  }
  return {
    message: `${greet}\n\nSaya ${who}, agen properti berlisensi. Saya melihat properti Bapak/Ibu (${i.property}) ${i.source ? `— ${i.source}` : ""}.\n\n${i.offer || "Saya punya pembeli dan penyewa yang sedang mencari di area ini dan dengan senang hati berbagi harga penawaran unit serupa belakangan ini."}\n\nApakah berkenan untuk telepon singkat minggu ini? Tanpa kewajiban apa pun.\n\n${i.agentName}`,
    subject: `Tentang properti Bapak/Ibu — ${i.property}`.slice(0, 80),
    followUp: `${greet}\n\nSekadar menindaklanjuti pesan saya minggu lalu tentang ${i.property}. Jika waktunya belum pas, tidak masalah — saya senang tetap terhubung dan berbagi info pasar bila berguna.\n\n${i.agentName}`,
    tips: ["Kirim di hari kerja antara 10.00 dan 18.00.", "Satu tindak lanjut setelah seminggu; lalu cukup.", "Jangan sebut harga sebelum melihat unitnya."],
  };
}

export async function draftOutreach(input: OutreachInput, ctx: { userId: string; locale: string }): Promise<OutreachDraft> {
  const floor = ruleDraft(input, ctx.locale);
  const res = await runAi(
    "owner_outreach",
    {
      agent: { name: input.agentName, agency: input.agencyName },
      property: input.property, source: input.source, offer: input.offer, channel: input.channel,
      owner_name: input.ownerName, deterministic_draft: floor.message,
    },
    schema,
    { userId: ctx.userId, locale: ctx.locale, refType: "outreach" },
  );
  if (res.ok) {
    const o = res.output;
    return { message: o.message, subject: input.channel === "email" ? o.subject || floor.subject : "", followUp: o.follow_up, tips: o.tips, source: "ai", model: `${res.provider}/${res.model}` };
  }
  return { ...floor, subject: input.channel === "email" ? floor.subject : "", source: "rules", reason: res.kind === "denied" ? res.reason : "failed" };
}
