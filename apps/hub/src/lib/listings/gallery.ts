import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicMediaUrl } from "@/lib/studio/listings";

/**
 * The agent's gallery for one listing (P0-e-3a): every photo that is not
 * removed, in order, with a thumbnail the owner may see.
 *
 *   · public photos (wizard uploads, published derivatives) use their public URL;
 *   · imported photos still private use a 10-minute signed URL of the clean
 *     400 px derivative when there is one, otherwise of the owner's own
 *     original (the intake read policy allows the owner's folder only).
 *
 * Read with the agent's session: RLS returns rows only for their own listing.
 */

export type GalleryState = "pending" | "processing" | "processed" | "ready" | "failed" | "quarantined";

export type GalleryItem = {
  id: string;
  position: number;
  isCover: boolean;
  state: GalleryState;
  imported: boolean;
  thumbUrl: string | null;
};

const SIGNED_TTL = 600;
const INTAKE = "listing-media-intake/";

export async function getGallery(supabase: SupabaseClient, listingId: string): Promise<GalleryItem[]> {
  const { data } = await supabase
    .from("listing_media")
    .select("id, position, is_cover, processing_state, storage_path, processed_path, thumbnail_path, derived_thumb_path, created_at")
    .eq("listing_id", listingId)
    .eq("kind", "image")
    .neq("processing_state", "removed")
    .order("position")
    .order("created_at");
  const rows = (data ?? []) as {
    id: string; position: number; is_cover: boolean; processing_state: GalleryState; storage_path: string;
    processed_path: string | null; thumbnail_path: string | null; derived_thumb_path: string | null;
  }[];

  return Promise.all(
    rows.map(async (r) => {
      const imported = r.storage_path.startsWith(INTAKE);
      let thumbUrl: string | null = null;
      const pub = r.thumbnail_path ?? r.processed_path;
      if (r.processing_state === "ready" && pub && !pub.startsWith(INTAKE)) {
        thumbUrl = publicMediaUrl(pub);
      } else if (!imported) {
        thumbUrl = publicMediaUrl(r.storage_path);
      } else {
        const key = (r.derived_thumb_path ?? r.storage_path).slice(INTAKE.length);
        const { data: signed } = await supabase.storage.from("listing-media-intake").createSignedUrl(key, SIGNED_TTL);
        thumbUrl = signed?.signedUrl ?? null;
      }
      return { id: r.id, position: r.position, isCover: r.is_cover, state: r.processing_state, imported, thumbUrl };
    }),
  );
}
