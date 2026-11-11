import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { rightsBasis, type RightsBasis } from "./rights";

/**
 * Publication of processed photos (P0-e-2a, 00109).
 *
 * Called by listing moderation on approval, after its capability, country and
 * separation-of-duties checks. Copies each `processed` photo's two WebP
 * derivatives from the private intake bucket to listing-media-public and marks
 * the photo `ready`. The ORIGINAL is never copied. Quarantined, failed and
 * still-pending photos are left alone, so the listing publishes with what is
 * clean and nothing else.
 *
 * P1-a: a processed photo with no rights evidence (no provenance row, or one
 * with neither the agent's import consent nor a partner agreement) is HELD:
 * it stays private and is counted, never published.
 */
export async function publishProcessedPhotos(
  listingId: string,
  opts: { onlyBasis?: RightsBasis[] } = {},
): Promise<{ published: number; failed: number; heldNoRights: number }> {
  const service = createServiceClient();
  const { data: rows } = await service
    .from("listing_media")
    .select("id, listing_id, storage_path, derived_path, derived_thumb_path")
    .eq("listing_id", listingId)
    .eq("processing_state", "processed");

  const ids = (rows ?? []).map((m) => m.id);
  const { data: prov } = ids.length
    ? await service.from("listing_media_source").select("media_id, consent_record_id, licence_note").in("media_id", ids)
    : { data: [] };
  const provOf = new Map((prov ?? []).map((p) => [p.media_id as string, p]));

  let published = 0, failed = 0, heldNoRights = 0;
  for (const m of rows ?? []) {
    const basis = rightsBasis(m.storage_path, provOf.get(m.id));
    if (basis === "missing") {
      heldNoRights++;
      continue;
    }
    if (opts.onlyBasis && !opts.onlyBasis.includes(basis)) continue;
    try {
      const out: Record<"full" | "thumb", string> = { full: "", thumb: "" };
      for (const [key, from] of [["full", m.derived_path], ["thumb", m.derived_thumb_path]] as const) {
        if (!from) throw new Error("missing_derivative");
        const source = from.replace(/^listing-media-intake\//, "");
        // Only the exact file the processor writes for THIS photo, in the
        // original owner's folder, is ever published (00110).
        const owner = m.storage_path.replace(/^listing-media-intake\//, "").split("/")[0];
        const expected = `${owner}/${m.listing_id}/derived-${m.id}-${key === "full" ? "1600" : "400"}.webp`;
        if (source !== expected) throw new Error("unexpected_derivative_path");
        const target = source.replace(/derived-/, "");          // <agent>/<listing>/<media>-1600.webp
        const { error } = await service.storage
          .from("listing-media-intake")
          .copy(source, target, { destinationBucket: "listing-media-public" });
        if (error && !/exist|duplicate/i.test(error.message)) throw new Error(error.message);
        out[key] = `listing-media-public/${target}`;
      }
      await service.from("listing_media").update({
        processing_state: "ready",
        processed_path: out.full,
        thumbnail_path: out.thumb,
      }).eq("id", m.id);
      published++;
    } catch (e) {
      failed++;
      console.error(`[photo-publish] ${m.id}:`, e instanceof Error ? e.message : e);
    }
  }
  return { published, failed, heldNoRights };
}
