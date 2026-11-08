import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { runAi, type DeniedReason } from "./engine";

/**
 * The Offer Summary Writer: one MatchHub offer in plain language for the
 * owner and for the buyer. The agent reads it to the party they represent;
 * nothing is sent from here. RLS on `offers` (participants only) is the gate.
 */
export type OfferSummary = {
  forOwner: string; forBuyer: string; keyTerms: string[]; caveats: string[]; nextStep: string;
  source: "ai" | "rules"; reason?: DeniedReason | "failed"; model?: string;
};

const schema = z.object({
  for_owner: z.string().min(40).max(1000),
  for_buyer: z.string().min(40).max(1000),
  key_terms: z.array(z.string().max(120)).max(6).default([]),
  caveats: z.array(z.string().max(160)).max(3).default([]),
  next_step: z.string().min(5).max(240),
});

type OfferRow = {
  id: string; human_readable_id: string; offer_type: string; amount: number; currency: string; lease_term_months: number | null;
  conditions: string | null; valid_until: string | null; status: string; counter_amount: number | null; counter_terms: string | null; created_at: string;
  property_submissions: { title: string; asking_price: number | null; monthly_rental: number | null; currency: string; property_type: string | null; city: string | null } | { title: string; asking_price: number | null; monthly_rental: number | null; currency: string; property_type: string | null; city: string | null }[] | null;
};

export async function summariseOffer(input: { offerId: string; role: "ra" | "sa"; userId: string; locale: string }): Promise<OfferSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("offers")
    .select("id, human_readable_id, offer_type, amount, currency, lease_term_months, conditions, valid_until, status, counter_amount, counter_terms, created_at, property_submissions (title, asking_price, monthly_rental, currency, property_type, city)")
    .eq("id", input.offerId).maybeSingle();
  if (!data) return null;
  const o = data as unknown as OfferRow;
  const s = Array.isArray(o.property_submissions) ? o.property_submissions[0] : o.property_submissions;
  const fmt = (n: number | null | undefined) => (n == null ? "—" : `${o.currency} ${Number(n).toLocaleString()}`);
  const asking = o.offer_type === "rent" ? s?.monthly_rental : s?.asking_price;
  const pct = asking && asking > 0 ? Math.round((Number(o.amount) / Number(asking) - 1) * 100) : null;

  const l = input.locale;
  const floor = {
    forOwner: l === "id"
      ? `Ada penawaran ${o.offer_type === "rent" ? "sewa" : "beli"} sebesar ${fmt(o.amount)}${pct != null ? ` (${pct >= 0 ? "+" : ""}${pct}% dari harga penawaran)` : ""} untuk ${s?.title ?? "properti ini"}.${o.conditions ? ` Syarat: ${o.conditions}.` : ""}${o.valid_until ? ` Berlaku sampai ${o.valid_until}.` : ""} Penawaran di platform ini belum mengikat sampai dokumen resmi ditandatangani.`
      : l === "ms"
      ? `Ada tawaran ${o.offer_type === "rent" ? "sewa" : "belian"} sebanyak ${fmt(o.amount)}${pct != null ? ` (${pct >= 0 ? "+" : ""}${pct}% daripada harga tawaran)` : ""} untuk ${s?.title ?? "hartanah ini"}.${o.conditions ? ` Syarat: ${o.conditions}.` : ""}${o.valid_until ? ` Sah hingga ${o.valid_until}.` : ""} Tawaran di platform ini tidak mengikat sehingga dokumen rasmi ditandatangani.`
      : `There is a${o.offer_type === "rent" ? " rental" :" purchase"} offer of ${fmt(o.amount)}${pct != null ? ` (${pct >= 0 ? "+" : ""}${pct}% against the asking price)` : ""} on ${s?.title ?? "this property"}.${o.conditions ? ` Conditions: ${o.conditions}.` : ""}${o.valid_until ? ` Valid until ${o.valid_until}.` : ""} Platform offers are not binding until formal documents are signed.`,
    forBuyer: l === "id"
      ? `Penawaran Anda sebesar ${fmt(o.amount)} untuk ${s?.title ?? "properti ini"} berstatus "${o.status}".${o.counter_amount != null ? ` Pemilik mengajukan penawaran balik ${fmt(o.counter_amount)}${o.counter_terms ? ` dengan syarat: ${o.counter_terms}` : ""}.` : ""}${o.valid_until ? ` Berlaku sampai ${o.valid_until}.` : ""} Belum mengikat sampai dokumen resmi ditandatangani.`
      : l === "ms"
      ? `Tawaran anda sebanyak ${fmt(o.amount)} untuk ${s?.title ?? "hartanah ini"} berstatus "${o.status}".${o.counter_amount != null ? ` Pemilik membuat tawaran balas ${fmt(o.counter_amount)}${o.counter_terms ? ` dengan syarat: ${o.counter_terms}` : ""}.` : ""}${o.valid_until ? ` Sah hingga ${o.valid_until}.` : ""} Tidak mengikat sehingga dokumen rasmi ditandatangani.`
      : `Your offer of ${fmt(o.amount)} on ${s?.title ?? "this property"} is "${o.status}".${o.counter_amount != null ? ` The owner has countered at ${fmt(o.counter_amount)}${o.counter_terms ? ` with terms: ${o.counter_terms}` : ""}.` : ""}${o.valid_until ? ` Valid until ${o.valid_until}.` : ""} Not binding until formal documents are signed.`,
    keyTerms: [fmt(o.amount), o.lease_term_months ? `${o.lease_term_months} months` : null, o.valid_until ? `until ${o.valid_until}` : null, o.conditions].filter((x): x is string => !!x),
    caveats: [],
    nextStep: o.status === "submitted" ? (l === "id" ? "Pemilik menerima, menolak, atau menawar balik." : l === "ms" ? "Pemilik menerima, menolak atau menawar balas." : "The owner accepts, rejects or counters.") : (l === "id" ? "Lanjutkan ke dokumen resmi bila kedua pihak sepakat." : l === "ms" ? "Teruskan ke dokumen rasmi apabila kedua-dua pihak bersetuju." : "Move to formal documents once both sides agree."),
  };

  const res = await runAi(
    "offer_summary",
    {
      offer: { id: o.human_readable_id, type: o.offer_type, amount: Number(o.amount), currency: o.currency, lease_term_months: o.lease_term_months, conditions: o.conditions, valid_until: o.valid_until, status: o.status, counter_amount: o.counter_amount != null ? Number(o.counter_amount) : null, counter_terms: o.counter_terms, submitted_at: o.created_at.slice(0, 10) },
      property: { title: s?.title, asking: asking != null ? Number(asking) : null, currency: s?.currency, type: s?.property_type, city: s?.city, offer_vs_asking_pct: pct },
      role: input.role === "ra" ? "requesting agent (represents the buyer/tenant)" : "supply agent (represents the owner)",
      deterministic: floor,
    },
    schema,
    { userId: input.userId, locale: input.locale, refType: "offer", refId: o.id, redactInput: false },
  );
  if (res.ok) {
    const r = res.output;
    return { forOwner: r.for_owner, forBuyer: r.for_buyer, keyTerms: r.key_terms, caveats: r.caveats, nextStep: r.next_step, source: "ai", model: `${res.provider}/${res.model}` };
  }
  return { ...floor, source: "rules", reason: res.kind === "denied" ? res.reason : "failed" };
}
