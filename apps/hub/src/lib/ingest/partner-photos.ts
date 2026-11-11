import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeFetchImage, UnsafeUrlError } from "@/lib/import/safe-fetch";
import { isPropertyPhoto } from "@/lib/import/adapters";
import { intakePath, sha256Hex, sniffImage } from "@/lib/import/photos";

/**
 * Partner-feed photos (D6, P0-e-3b): fetched safely, kept PRIVATE, processed,
 * and published only by moderation — the same path as imported photos.
 *
 * Rights basis (owner decision, 11 Nov 2026): the written partner agreement,
 * whose reference comes from the country's settings and is recorded on each
 * photo's provenance row by attach_partner_photo (00113). With no reference
 * configured, nothing is fetched or stored.
 *
 * A photo failure never fails the listing. Results are counted per reason so
 * the ingest response and the audit row say what happened.
 */

export type PartnerPhotoResult = {
  stored: number;
  existing: number;
  skipped: Record<string, number>;
  basis: string | null;
};

const MAX_PARTNER_PHOTOS = 20;

export async function attachPartnerPhotos(
  service: SupabaseClient,
  args: {
    agentId: string;
    listingId: string;
    pageUrl: string | null;
    agreementRef: string | null;
    images: { url: string; is_cover?: boolean }[];
  },
): Promise<PartnerPhotoResult> {
  const result: PartnerPhotoResult = { stored: 0, existing: 0, skipped: {}, basis: null };
  const skip = (why: string) => { result.skipped[why] = (result.skipped[why] ?? 0) + 1; };
  if (!args.images.length) return result;
  const ref = args.agreementRef?.trim() || null;
  if (!ref) {
    for (let i = 0; i < args.images.length; i++) skip("no_agreement_ref");
    return result;
  }
  result.basis = `partner_agreement:${ref}`;

  // The sender's chosen cover goes first, so it becomes the cover when the listing has none.
  const ordered = [...args.images.filter((i) => i.is_cover), ...args.images.filter((i) => !i.is_cover)].slice(0, MAX_PARTNER_PHOTOS);

  for (const img of ordered) {
    if (!isPropertyPhoto(img.url)) { skip("not_property"); continue; }
    let bytes: Uint8Array;
    try {
      bytes = (await safeFetchImage(img.url)).bytes;
    } catch (e) {
      skip(e instanceof UnsafeUrlError ? e.reason : "source_error");
      continue;
    }
    const image = sniffImage(bytes);
    if (!image) { skip("not_image"); continue; }

    const hash = await sha256Hex(bytes);
    const path = intakePath(args.agentId, args.listingId, hash, image.ext);
    const { error: upErr } = await service.storage
      .from("listing-media-intake")
      .upload(path, bytes, { contentType: image.mime, upsert: false });
    if (upErr && !/exist|duplicate/i.test(upErr.message)) { skip("save_failed"); continue; }

    const { data, error } = await service.rpc("attach_partner_photo", {
      p_listing: args.listingId,
      p_storage_path: path,
      p_content_hash: hash,
      p_image_url: img.url,
      p_page_url: args.pageUrl ?? "",
      p_agreement_ref: ref,
      p_byte_size: bytes.byteLength,
      p_width: image.width,
      p_height: image.height,
    });
    if (error) { skip("save_failed"); continue; }
    if ((data as { created?: boolean } | null)?.created) result.stored++;
    else result.existing++;
  }
  return result;
}
