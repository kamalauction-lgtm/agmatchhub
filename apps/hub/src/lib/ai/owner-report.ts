import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/listings/format";
import { runAi, type DeniedReason } from "./engine";

/**
 * The Owner Report Writer: one listing's period in numbers (00098
 * `my_listing_owner_report`) turned into the update an agent sends to the
 * owner. The numbers are the floor; the prose is the model's, or a plain
 * template when the model is not available.
 */
export type OwnerNumbers = {
  views: number; unique_views: number; saves: number; shares: number; inquiries: number; whatsapp_clicks: number;
  views_prev: number; inquiries_prev: number;
  leads_total: number; leads_new: number; leads_contacted: number; leads_viewing: number; leads_negotiating: number;
  viewings_upcoming: number; price_changes: number; days_live: number;
};

export type OwnerReport = {
  listing: { id: string; human_readable_id: string; title: string; price: string; status: string };
  days: number;
  numbers: OwnerNumbers;
  subject: string;
  report: string;
  nextSteps: string[];
  askOwner: string | null;
  source: "ai" | "rules";
  reason?: DeniedReason | "failed";
  model?: string;
};

const schema = z.object({
  subject: z.string().min(5).max(100),
  report: z.string().min(120).max(2200),
  next_steps: z.array(z.string().max(200)).min(1).max(3),
  ask_owner: z.string().max(240).nullable(),
});

function ruleReport(l: OwnerReport["listing"], n: OwnerNumbers, days: number, agent: string, locale: string): Pick<OwnerReport, "subject" | "report" | "nextSteps" | "askOwner"> {
  const trend = n.views_prev === 0 ? null : Math.round(((n.views - n.views_prev) / Math.max(n.views_prev, 1)) * 100);
  if (locale === "en") {
    return {
      subject: `${l.title} — update for the last ${days} days`,
      report: `Here is the update on ${l.title} (${l.human_readable_id}) for the last ${days} days.\n\nThe listing was viewed ${n.views} times (${n.unique_views} people)${trend != null ? `, ${trend >= 0 ? "up" : "down"} ${Math.abs(trend)}% on the previous period` : ""}, saved ${n.saves} times and opened ${n.whatsapp_clicks} WhatsApp conversations. ${n.leads_new} new enquiries came in; ${n.leads_viewing} are at viewing stage and ${n.leads_negotiating} are negotiating. ${n.viewings_upcoming} viewings are booked.\n\nNext, I will follow up every open enquiry this week and refresh the photos and copy where it helps. It has been live for ${n.days_live} days at ${l.price}.`,
      nextSteps: ["Follow up every open enquiry", "Refresh photos and description", n.views < 20 ? "Review the asking price against comparables" : "Schedule a social post for the listing"],
      askOwner: n.views_prev > 0 && n.views < n.views_prev / 2 ? "Would you consider a small price adjustment or new photos to lift interest?" : null,
    };
  }
  if (locale === "ms") {
    return {
      subject: `${l.title} — kemas kini ${days} hari terakhir`,
      report: `Berikut kemas kini untuk ${l.title} (${l.human_readable_id}) bagi ${days} hari terakhir.\n\nPenyenaraian dilihat ${n.views} kali (${n.unique_views} orang)${trend != null ? `, ${trend >= 0 ? "naik" : "turun"} ${Math.abs(trend)}% berbanding tempoh sebelumnya` : ""}, disimpan ${n.saves} kali dan membuka ${n.whatsapp_clicks} perbualan WhatsApp. ${n.leads_new} pertanyaan baharu diterima; ${n.leads_viewing} di peringkat lawatan dan ${n.leads_negotiating} sedang berunding. ${n.viewings_upcoming} lawatan telah ditempah.\n\nSeterusnya, saya akan susuli setiap pertanyaan terbuka minggu ini dan segarkan gambar serta teks jika perlu. Ia telah aktif selama ${n.days_live} hari pada ${l.price}.`,
      nextSteps: ["Susuli setiap pertanyaan terbuka", "Segarkan gambar dan keterangan", n.views < 20 ? "Semak harga tawaran berbanding unit setara" : "Jadualkan hantaran sosial untuk penyenaraian"],
      askOwner: n.views_prev > 0 && n.views < n.views_prev / 2 ? "Adakah tuan/puan bersedia mempertimbangkan pelarasan harga kecil atau gambar baharu untuk menarik minat?" : null,
    };
  }
  return {
    subject: `${l.title} — laporan ${days} hari terakhir`,
    report: `Berikut laporan untuk ${l.title} (${l.human_readable_id}) selama ${days} hari terakhir.\n\nListing dilihat ${n.views} kali (${n.unique_views} orang)${trend != null ? `, ${trend >= 0 ? "naik" : "turun"} ${Math.abs(trend)}% dibanding periode sebelumnya` : ""}, disimpan ${n.saves} kali dan membuka ${n.whatsapp_clicks} percakapan WhatsApp. ${n.leads_new} pertanyaan baru masuk; ${n.leads_viewing} di tahap kunjungan dan ${n.leads_negotiating} sedang negosiasi. ${n.viewings_upcoming} kunjungan sudah terjadwal.\n\nSelanjutnya, saya akan menindaklanjuti setiap pertanyaan yang masih terbuka minggu ini dan memperbarui foto serta deskripsi bila perlu. Listing sudah tayang ${n.days_live} hari di harga ${l.price}.`,
    nextSteps: ["Tindak lanjuti setiap pertanyaan terbuka", "Perbarui foto dan deskripsi", n.views < 20 ? "Tinjau harga dibanding unit pembanding" : "Jadwalkan unggahan sosial untuk listing"],
    askOwner: n.views_prev > 0 && n.views < n.views_prev / 2 ? "Apakah Bapak/Ibu bersedia mempertimbangkan penyesuaian harga kecil atau foto baru untuk menaikkan minat?" : null,
  };
}

export async function buildOwnerReport(input: { listingId: string; days: number; ownerName: string | null; agentName: string; userId: string; locale: string; withAi: boolean }): Promise<OwnerReport | null> {
  const supabase = await createClient();
  const [{ data: listing }, { data: rows }] = await Promise.all([
    supabase.from("listings").select("id, human_readable_id, title, price, currency, rent_period, status").eq("id", input.listingId).eq("agent_id", input.userId).maybeSingle(),
    supabase.rpc("my_listing_owner_report", { p_listing: input.listingId, p_days: input.days }),
  ]);
  if (!listing) return null;
  const raw = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | undefined;
  const n = Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, Number(v ?? 0)])) as unknown as OwnerNumbers;
  const l = { id: listing.id, human_readable_id: listing.human_readable_id, title: listing.title, price: money(listing.currency, Number(listing.price), listing.rent_period), status: listing.status };
  const floor = ruleReport(l, n, input.days, input.agentName, input.locale);
  const base: OwnerReport = { listing: l, days: input.days, numbers: n, ...floor, source: "rules" };
  if (!input.withAi) return base;

  const res = await runAi(
    "owner_report",
    {
      listing: { title: l.title, id: l.human_readable_id, price: l.price, status: l.status, days_live: n.days_live },
      days: input.days,
      numbers: { views: n.views, unique_views: n.unique_views, saves: n.saves, shares: n.shares, whatsapp_clicks: n.whatsapp_clicks, new_enquiries: n.leads_new, enquiries_total: n.leads_total, at_viewing_stage: n.leads_viewing, negotiating: n.leads_negotiating, viewings_booked: n.viewings_upcoming, price_changes: n.price_changes },
      previous: { views: n.views_prev, enquiries: n.inquiries_prev },
      agent_name: input.agentName, owner_name: input.ownerName ?? "—",
      deterministic_report: floor.report,
    },
    schema,
    { userId: input.userId, locale: input.locale, refType: "listing", refId: input.listingId, redactInput: false },
  );
  if (res.ok) {
    const o = res.output;
    return { ...base, subject: o.subject, report: o.report, nextSteps: o.next_steps, askOwner: o.ask_owner, source: "ai", model: `${res.provider}/${res.model}` };
  }
  return { ...base, reason: res.kind === "denied" ? res.reason : "failed" };
}
