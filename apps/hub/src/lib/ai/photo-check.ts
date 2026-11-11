import "server-only";
import { z } from "zod";
import type { Attachment } from "@pg/ai";
import { createClient } from "@/lib/supabase/server";
import { publicMediaUrl } from "@/lib/studio/listings";
import { runAi, type DeniedReason } from "./engine";
import { ruleCheckPhotos, type MediaFacts, type RulePhotoFlag } from "./photo-rules";

/**
 * The Photo Checker on one listing: the rules first (duplicates, resolution,
 * count — free), then the model looks at up to eight photos for what only
 * eyes can see. Photos travel as bytes the platform fetched from its own
 * public bucket; nothing is stored, only the ledger row.
 */
export type PhotoIssue = "blur" | "dark" | "face" | "plate" | "document" | "watermark" | "not_property" | "other";

export type PhotoCheckResult = {
  count: number;
  hasCover: boolean;
  tooFew: boolean;
  ruleFlags: RulePhotoFlag[];
  photos: { index: number; id: string; url: string | null; ok: boolean; issues: PhotoIssue[]; note: string }[];
  bestCoverIndex: number | null;
  summary: string | null;
  checked: number;
  source: "ai" | "rules";
  reason?: DeniedReason | "failed";
  model?: string;
};

const schema = z.object({
  photos: z.array(z.object({
    index: z.number().int().min(1),
    ok: z.boolean(),
    issues: z.array(z.enum(["blur", "dark", "face", "plate", "document", "watermark", "not_property", "other"])).default([]),
    note: z.string().max(200).default(""),
  })).max(12),
  best_cover_index: z.number().int().min(1).nullable(),
  summary: z.string().max(400),
});

const MAX_PHOTOS = 8;
const MAX_BYTES = 1_500_000;

async function fetchAttachment(url: string): Promise<Attachment | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return null;
    return { mimeType: type, dataBase64: Buffer.from(buf).toString("base64") };
  } catch {
    return null;
  }
}

export async function checkListingPhotos(input: { listingId: string; userId: string; locale: string; withAi: boolean }): Promise<PhotoCheckResult> {
  const supabase = await createClient();
  // RLS: the owner (or a borrowing marketer) sees these rows; anyone else sees none.
  const [{ data: media }, { data: listing }] = await Promise.all([
    supabase.from("listing_media").select("id, position, is_cover, width, height, byte_size, phash, thumbnail_path, processed_path, storage_path, kind")
      .eq("listing_id", input.listingId).eq("kind", "image").neq("processing_state", "removed").order("position"),
    supabase.from("listings").select("title, listing_type, properties (property_type, regency_name)").eq("id", input.listingId).maybeSingle(),
  ]);
  const rows = (media ?? []) as (MediaFacts & { thumbnail_path: string | null; processed_path: string | null; storage_path: string })[];
  const rules = ruleCheckPhotos(rows);
  // Only public files have a public URL. An imported photo still in the
  // private intake bucket has none (P0-e-3a): building one produced a broken
  // link, and the model could not fetch it either.
  const urlOf = (m: (typeof rows)[number]) => {
    const path = m.thumbnail_path ?? m.processed_path ?? m.storage_path;
    return path && !path.startsWith("listing-media-intake/") ? publicMediaUrl(path) : null;
  };
  const base: PhotoCheckResult = {
    count: rules.count, hasCover: rules.hasCover, tooFew: rules.tooFew, ruleFlags: rules.flags,
    photos: rows.map((m, i) => ({ index: i + 1, id: m.id, url: urlOf(m), ok: true, issues: [], note: "" })),
    bestCoverIndex: null, summary: null, checked: 0, source: "rules",
  };
  if (!input.withAi || !rows.length) return base;

  const subset = rows.slice(0, MAX_PHOTOS);
  const fetched = await Promise.all(subset.map((m) => { const u = urlOf(m); return u ? fetchAttachment(u) : Promise.resolve(null); }));
  const attachments = fetched.filter((a): a is Attachment => !!a);
  const attachedIndexes = subset.map((_, i) => i + 1).filter((_, i) => !!fetched[i]);
  if (!attachments.length) return { ...base, reason: "failed" };

  const p = (Array.isArray(listing?.properties) ? listing?.properties[0] : listing?.properties) as { property_type: string; regency_name: string | null } | null | undefined;
  const res = await runAi(
    "photo_check",
    { count: attachments.length, listing: { title: listing?.title ?? "", type: p?.property_type ?? "", area: p?.regency_name ?? "", listing_type: listing?.listing_type ?? "" } },
    schema,
    { userId: input.userId, locale: input.locale, refType: "listing", refId: input.listingId, redactInput: false, attachments, timeoutMs: 45_000 },
  );
  if (!res.ok) return { ...base, reason: res.kind === "denied" ? res.reason : "failed" };

  // The model numbered the ATTACHED photos 1..n; map back to listing positions.
  const photos = base.photos.map((ph) => {
    const k = attachedIndexes.indexOf(ph.index);
    const o = k >= 0 ? res.output.photos.find((x) => x.index === k + 1) : undefined;
    return o ? { ...ph, ok: o.ok, issues: o.issues, note: o.note } : ph;
  });
  const best = res.output.best_cover_index != null ? attachedIndexes[res.output.best_cover_index - 1] ?? null : null;
  return { ...base, photos, bestCoverIndex: best, summary: res.output.summary, checked: attachments.length, source: "ai", model: `${res.provider}/${res.model}` };
}
