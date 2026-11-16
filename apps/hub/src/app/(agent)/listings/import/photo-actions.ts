"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { isPropertyPhoto } from "@/lib/import/adapters";
import { safeFetchImage, UnsafeUrlError } from "@/lib/import/safe-fetch";
import {
  intakePath, MAX_PHOTO_ATTEMPTS, sha256Hex, sniffImage, urlKey, type PhotoFailure,
} from "@/lib/import/photos";

/**
 * Attach an imported item's photos (P0-e-1a, 00108).
 *
 * Runs AFTER the commit, one item per call, in the agent's own session — so a
 * slow or broken image delays one item, and the listing already exists
 * whatever happens here. Each URL is fetched through the SSRF-safe fetcher,
 * confirmed to be an image from its bytes, stored in the PRIVATE intake bucket
 * under the agent's folder with a key derived from its content, and recorded
 * by attach_import_photo() as `pending`. Nothing becomes public.
 *
 * A retry re-runs only the URLs that did not save; the content-derived key and
 * the (listing, content_hash) unique index make a repeat a no-op.
 */

export type PhotoRun = {
  state: "disabled" | "forbidden" | "none" | "done" | "partial" | "failed" | "exhausted";
  saved: number;
  total: number;
};

const REASON: Partial<Record<string, PhotoFailure>> = {
  blocked_by_site: "blocked",
  timeout: "timeout",
  too_large: "too_large",
  unsupported_content: "not_image",
  not_found: "source_error",
  fetch_failed: "source_error",
  invalid_url: "unsafe_url",
  unsupported_scheme: "unsafe_url",
  blocked_host: "unsafe_url",
  private_address: "unsafe_url",
  too_many_redirects: "unsafe_url",
};

export async function attachItemPhotos(formData: FormData): Promise<PhotoRun> {
  const user = await requireUser();
  const parsed = z.string().uuid().safeParse(formData.get("itemId"));
  if (!parsed.success) return { state: "forbidden", saved: 0, total: 0 };
  const itemId = parsed.data;
  const supabase = await createClient();

  const { data: enabled } = await supabase.rpc("is_feature_enabled", { p_key: "import_photos", p_user: user.id });
  if (!enabled) return { state: "disabled", saved: 0, total: 0 };

  const { data: item } = await supabase
    .from("import_items")
    .select("id, batch_id, listing_id, extracted, media_attempts, media_results")
    .eq("id", itemId)
    .maybeSingle();
  if (!item?.listing_id) return { state: "forbidden", saved: 0, total: 0 };
  const { data: batch } = await supabase.from("import_batches").select("agent_id").eq("id", item.batch_id).maybeSingle();
  // The D15 rule: only the batch's own agent attaches its photos.
  if (!batch || batch.agent_id !== user.id) return { state: "forbidden", saved: 0, total: 0 };

  const urls = [...new Set(((item.extracted as { imageUrls?: unknown }).imageUrls ?? []) as string[])]
    .filter((u) => typeof u === "string")
    .slice(0, 12);
  if (!urls.length) return { state: "none", saved: 0, total: 0 };

  const previous = new Map<string, string>(
    ((item.media_results ?? []) as { u: string; s: string }[]).map((r) => [r.u, r.s]),
  );
  const alreadySaved = [...previous.values()].filter((s) => s === "saved").length;
  if (item.media_attempts >= MAX_PHOTO_ATTEMPTS && alreadySaved < urls.length) {
    return { state: "exhausted", saved: alreadySaved, total: urls.length };
  }

  const results: { u: string; s: string }[] = [];
  for (const url of urls) {
    const key = await urlKey(url);
    if (previous.get(key) === "saved") {
      results.push({ u: key, s: "saved" });
      continue;
    }
    results.push({ u: key, s: await attachOne(supabase, user.id, item.id, item.listing_id, url) });
  }

  const saved = results.filter((r) => r.s === "saved").length;
  const state: PhotoRun["state"] = saved === urls.length ? "done" : saved > 0 ? "partial" : "failed";
  await supabase.from("import_items").update({
    media_state: state,
    media_total: urls.length,
    media_saved: saved,
    media_attempts: item.media_attempts + 1,
    media_results: results,
  }).eq("id", item.id);

  await logAudit({
    action: "listing_import.photos_attached",
    entityType: "import_item",
    entityId: item.id,
    next: {
      listing_id: item.listing_id,
      saved,
      total: urls.length,
      attempt: item.media_attempts + 1,
      failed: results.filter((r) => r.s !== "saved").map((r) => r.s),
    },
  });

  revalidatePath(`/listings/import/${item.batch_id}`);
  return { state, saved, total: urls.length };
}

async function attachOne(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agentId: string,
  itemId: string,
  listingId: string,
  url: string,
): Promise<string> {
  // Share cards, logos and watermark paths are skipped, never altered.
  if (!isPropertyPhoto(url)) return "not_property";
  let bytes: Uint8Array;
  try {
    bytes = (await safeFetchImage(url)).bytes;
  } catch (e) {
    return e instanceof UnsafeUrlError ? REASON[e.reason] ?? "source_error" : "source_error";
  }
  const image = sniffImage(bytes);
  if (!image) return "not_image";

  const hash = await sha256Hex(bytes);
  const path = intakePath(agentId, listingId, hash, image.ext);
  const { error: upErr } = await supabase.storage
    .from("listing-media-intake")
    .upload(path, bytes, { contentType: image.mime, upsert: false });
  // Already there means a previous attempt stored it: reuse, never duplicate.
  if (upErr && !/exist|duplicate/i.test(upErr.message)) return "save_failed";

  const { error } = await supabase.rpc("attach_import_photo", {
    p_item: itemId,
    p_storage_path: path,
    p_content_hash: hash,
    p_image_url: url,
    p_byte_size: bytes.byteLength,
    p_width: image.width,
    p_height: image.height,
  });
  return error ? "save_failed" : "saved";
}

/** The same, as a form action: the per-item buttons work without JavaScript. */
export async function attachItemPhotosForm(formData: FormData): Promise<void> {
  await attachItemPhotos(formData);
}
