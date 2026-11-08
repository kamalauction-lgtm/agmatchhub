/**
 * The Lead Qualifier's deterministic floor: an intent score 1–5 from the
 * enquiry type and the words the enquirer used, with the reason in words.
 *
 * It is a sort key, not a verdict — the page shows every lead whatever the
 * number says — so the scale is simple on purpose: 2 is "asked a question",
 * 4 is "asked to see it", 5 is "asked to see it and talked money".
 */

export type QualifyInput = { message: string | null; inquiryType: string; locale: string };
export type Qualification = { intent: 1 | 2 | 3 | 4 | 5; reason: string; signals: string[]; suggestedAction: string };

const KW = {
  viewing: /\b(survey|viewing|view|visit|lihat|tengok|melihat|datang|jadwal|jadual|appointment|lawat)\b/i,
  money: /\b(nego|negotiable|harga|price|budget|bajet|cash|tunai|dp|kpr|loan|pinjaman|cicilan|ansuran|offer|tawar)\b/i,
  timing: /\b(kapan|bila|when|segera|asap|minggu ini|this week|weekend|akhir pekan|hujung minggu|bulan ini|this month)\b/i,
  availability: /\b(masih (ada|tersedia)|available|availability|kosong|vacant|sudah laku|terjual)\b/i,
};

const BASE: Record<string, number> = { viewing_request: 4, financing: 3, price_question: 3, availability: 3, general: 2 };

const TEXT: Record<string, { reason: (s: string[]) => string; action: Record<string, string>; signal: Record<string, string> }> = {
  en: {
    reason: (s) => (s.length ? `Enquiry ${s.join(", ")}.` : "A general enquiry with no specific ask yet."),
    action: { high: "Offer two viewing slots today.", mid: "Answer the question and propose a viewing.", low: "Reply warmly and ask what they are looking for." },
    signal: { asks_viewing: "asks to view", asks_price: "talks about price or payment", mentions_timing: "mentions a timeframe", asks_availability: "asks about availability", short_message: "is brief" },
  },
  id: {
    reason: (s) => (s.length ? `Pertanyaan ${s.join(", ")}.` : "Pertanyaan umum, belum ada permintaan spesifik."),
    action: { high: "Tawarkan dua jadwal survey hari ini.", mid: "Jawab pertanyaannya dan usulkan survey.", low: "Balas dengan ramah dan tanyakan apa yang dicari." },
    signal: { asks_viewing: "minta survey", asks_price: "membahas harga atau pembayaran", mentions_timing: "menyebut waktu", asks_availability: "menanyakan ketersediaan", short_message: "singkat" },
  },
  ms: {
    reason: (s) => (s.length ? `Pertanyaan ${s.join(", ")}.` : "Pertanyaan umum, belum ada permintaan khusus."),
    action: { high: "Tawarkan dua slot lawatan hari ini.", mid: "Jawab soalan dan cadangkan lawatan.", low: "Balas dengan mesra dan tanya apa yang dicari." },
    signal: { asks_viewing: "minta melawat", asks_price: "membincangkan harga atau bayaran", mentions_timing: "menyebut tempoh masa", asks_availability: "bertanya ketersediaan", short_message: "ringkas" },
  },
};

export function ruleQualify(i: QualifyInput): Qualification {
  const msg = (i.message ?? "").trim();
  const signals: string[] = [];
  let score = BASE[i.inquiryType] ?? 2;
  if (KW.viewing.test(msg)) { signals.push("asks_viewing"); score += i.inquiryType === "viewing_request" ? 0 : 1; }
  if (KW.money.test(msg)) { signals.push("asks_price"); score += 1; }
  if (KW.timing.test(msg)) { signals.push("mentions_timing"); score += 1; }
  if (KW.availability.test(msg)) { signals.push("asks_availability"); }
  if (msg.length > 0 && msg.length < 25) { signals.push("short_message"); score -= 1; }
  const intent = Math.min(5, Math.max(1, score)) as Qualification["intent"];

  const t = TEXT[i.locale] ?? TEXT.en;
  const words = signals.map((s) => t.signal[s]).filter(Boolean);
  return {
    intent,
    reason: t.reason(words),
    signals,
    suggestedAction: intent >= 4 ? t.action.high : intent === 3 ? t.action.mid : t.action.low,
  };
}
