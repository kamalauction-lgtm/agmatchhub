/**
 * The Communication Secretary's deterministic floor: a courteous, factual
 * first reply built from the lead and the listing, in the enquirer's language.
 *
 * Pure — no server imports — so it is unit-tested and so the model version is
 * an upgrade on top of something that already reads well, not a rescue.
 * Every sentence is true by construction: it quotes the listing's own price
 * and never promises availability, discounts or terms it cannot know.
 */

export type ReplyInput = {
  locale: string;                 // enquirer's language: id | en | ms
  channel: "whatsapp" | "email";
  firstName: string | null;
  agentName: string;
  inquiryType: string;            // general | viewing_request | price_question | availability | financing
  listingTitle: string;
  priceText: string | null;       // already formatted, e.g. "Rp2,75 miliar"
  negotiable: boolean;
};

const L = {
  id: {
    hi: (n: string | null) => (n ? `Halo ${n},` : "Halo,"),
    thanks: (t: string) => `terima kasih sudah menghubungi kami tentang "${t}".`,
    type: {
      viewing_request: "Dengan senang hati saya aturkan jadwal survey.",
      price_question: (p: string | null, nego: boolean) =>
        p ? `Harga yang tertera ${p}${nego ? " (masih bisa nego)" : ""}.` : "Saya kirimkan detail harganya segera.",
      availability: "Saya konfirmasi ketersediaannya hari ini juga.",
      financing: "Saya bisa bantu informasi KPR dan simulasi cicilannya.",
      general: "",
    },
    ask: "Kapan waktu yang nyaman untuk saya hubungi, atau untuk jadwal survey?",
    sign: (a: string) => `Salam,\n${a}`,
    nextStep: "Usulkan dua pilihan waktu survey.",
    questions: ["Rencana pindah/pakai kapan?", "Budget maksimal dan skema pembayaran (cash/KPR)?"],
  },
  en: {
    hi: (n: string | null) => (n ? `Hello ${n},` : "Hello,"),
    thanks: (t: string) => `thank you for your enquiry about "${t}".`,
    type: {
      viewing_request: "I would be glad to arrange a viewing.",
      price_question: (p: string | null, nego: boolean) =>
        p ? `The asking price is ${p}${nego ? " (open to offers)" : ""}.` : "I will send the price details shortly.",
      availability: "I will confirm availability for you today.",
      financing: "I can help with financing options and a repayment estimate.",
      general: "",
    },
    ask: "When would be a good time to call you, or to view the property?",
    sign: (a: string) => `Best regards,\n${a}`,
    nextStep: "Offer two viewing slots.",
    questions: ["When do you plan to move or use the property?", "Budget range and payment plan (cash / loan)?"],
  },
  ms: {
    hi: (n: string | null) => (n ? `Hai ${n},` : "Hai,"),
    thanks: (t: string) => `terima kasih kerana menghubungi kami tentang "${t}".`,
    type: {
      viewing_request: "Saya boleh aturkan sesi lawatan dengan senang hati.",
      price_question: (p: string | null, nego: boolean) =>
        p ? `Harga tawaran ialah ${p}${nego ? " (boleh dirunding)" : ""}.` : "Saya akan hantar butiran harga sebentar lagi.",
      availability: "Saya akan sahkan ketersediaan untuk anda hari ini.",
      financing: "Saya boleh bantu dengan pilihan pembiayaan dan anggaran ansuran.",
      general: "",
    },
    ask: "Bilakah masa yang sesuai untuk saya hubungi anda, atau untuk melawat hartanah ini?",
    sign: (a: string) => `Salam hormat,\n${a}`,
    nextStep: "Cadangkan dua slot lawatan.",
    questions: ["Bila anda merancang untuk berpindah atau menggunakan hartanah ini?", "Julat bajet dan pelan bayaran (tunai / pinjaman)?"],
  },
} as const;

export type ReplyDraft = { reply: string; nextStep: string; questions: string[] };

export function ruleReply(i: ReplyInput): ReplyDraft {
  const d = L[(i.locale as keyof typeof L) in L ? (i.locale as keyof typeof L) : "id"];
  const typeLine =
    i.inquiryType === "price_question"
      ? d.type.price_question(i.priceText, i.negotiable)
      : (d.type[i.inquiryType as "viewing_request" | "availability" | "financing" | "general"] ?? "");
  const lines = [`${d.hi(i.firstName)} ${d.thanks(i.listingTitle)}`, typeLine, d.ask, "", d.sign(i.agentName)].filter(
    (l, idx, arr) => !(l === "" && arr[idx - 1] === ""),
  );
  const reply = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { reply, nextStep: d.nextStep, questions: [...d.questions] };
}

/** First name only — a reply greets a person, it does not read out their record. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}
