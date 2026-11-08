/**
 * The Task Planner's deterministic floor.
 *
 * From a lead: the obvious next moves for its enquiry type, with sensible due
 * times. From the morning brief: one task per ranked action, due this
 * afternoon. Pure — unit-tested, and the model version only has to be better.
 */

export type TaskKind = "call" | "message" | "viewing" | "document" | "follow_up" | "other";
export type ProposedTask = { title: string; kind: TaskKind; dueAt: string | null };

const T = {
  en: {
    viewing_request: (n: string) => [`Propose two viewing slots to ${n}`, `Confirm the viewing with ${n}`],
    price_question: (n: string) => [`Send ${n} the price details and nearby comparables`],
    availability: (n: string) => [`Confirm availability with the owner, then reply to ${n}`],
    financing: (n: string) => [`Share financing options and a repayment estimate with ${n}`],
    general: (n: string) => [`Reply to ${n} and ask what they are looking for`],
    followUp: (n: string) => `Follow up ${n} if there is no reply`,
    briefPrefix: "",
  },
  id: {
    viewing_request: (n: string) => [`Usulkan dua jadwal survey ke ${n}`, `Konfirmasi survey dengan ${n}`],
    price_question: (n: string) => [`Kirim detail harga dan pembanding sekitar ke ${n}`],
    availability: (n: string) => [`Konfirmasi ketersediaan ke pemilik, lalu balas ${n}`],
    financing: (n: string) => [`Kirim opsi pembiayaan dan simulasi cicilan ke ${n}`],
    general: (n: string) => [`Balas ${n} dan tanyakan apa yang dicari`],
    followUp: (n: string) => `Follow up ${n} jika belum ada balasan`,
    briefPrefix: "",
  },
  ms: {
    viewing_request: (n: string) => [`Cadangkan dua slot lawatan kepada ${n}`, `Sahkan lawatan dengan ${n}`],
    price_question: (n: string) => [`Hantar butiran harga dan perbandingan berdekatan kepada ${n}`],
    availability: (n: string) => [`Sahkan ketersediaan dengan pemilik, kemudian balas ${n}`],
    financing: (n: string) => [`Kongsi pilihan pembiayaan dan anggaran ansuran dengan ${n}`],
    general: (n: string) => [`Balas ${n} dan tanya apa yang dicari`],
    followUp: (n: string) => `Susuli ${n} jika tiada balasan`,
    briefPrefix: "",
  },
} as const;

const KIND_FOR: Record<string, TaskKind> = {
  viewing_request: "message", price_question: "message", availability: "call", financing: "message", general: "message",
};

const hours = (now: Date, h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

export function ruleTasksForLead(i: { locale: string; firstName: string | null; inquiryType: string; now?: Date }): ProposedTask[] {
  const d = T[(i.locale as keyof typeof T) in T ? (i.locale as keyof typeof T) : "en"];
  const now = i.now ?? new Date();
  const name = i.firstName ?? (i.locale === "id" ? "penanya" : i.locale === "ms" ? "penanya" : "the enquirer");
  const key = (i.inquiryType in d ? i.inquiryType : "general") as keyof typeof d & string;
  const titles = (d[key as "general"] as (n: string) => string[])(name);
  const out: ProposedTask[] = titles.map((title, idx) => ({
    title,
    kind: idx === 1 && i.inquiryType === "viewing_request" ? "viewing" : (KIND_FOR[i.inquiryType] ?? "message"),
    dueAt: hours(now, idx === 0 ? (i.inquiryType === "viewing_request" ? 4 : 2) : 48),
  }));
  out.push({ title: d.followUp(name), kind: "follow_up", dueAt: hours(now, 48) });
  return out.slice(0, 5);
}

/** One task per brief action, due at 17:00 of the agent's day (passed in as an ISO instant). */
export function ruleTasksForBrief(actions: { label: string; href: string }[], dueAt: string): ProposedTask[] {
  return actions.slice(0, 5).map((a) => ({
    title: a.label.slice(0, 160),
    kind: a.href.startsWith("/leads") ? "message" : a.href.startsWith("/listings") ? "document" : "other",
    dueAt,
  }));
}
