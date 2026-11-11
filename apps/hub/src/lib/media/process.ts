import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServiceClient } from "@/lib/supabase/service";
import { DERIVATIVES, derivedPath, metadataFound, sniffImage } from "@/lib/import/photos";

/**
 * P0-e-2a photo processor (00109). Runs from the hub cron, on the operator
 * path (service role, no user session).
 *
 * For each claimed intake photo: read the private original, make two WebP
 * derivatives through the Cloudflare Images binding, confirm from their bytes
 * that they are WebP and carry no EXIF/XMP, store them PRIVATELY next to the
 * original, and mark the photo `processed`. Publication — copying to the public
 * bucket — happens only when a moderator approves the listing.
 *
 * Failure never touches the listing: the photo's attempts go up with backoff
 * and after three it is `failed`. Hitting the Images quota (error 9422) or the
 * owner's monthly cap PAUSES the photo instead of failing it.
 */

const BACKOFF_MINUTES = [15, 60, 360];
/** Owner-approved pilot cap: pause at 4,500, below the free plan's 5,000 stop. */
export const DEFAULT_CAP = 4500;

/** The cap in force: MEDIA_TRANSFORM_CAP, or the owner-approved default. */
export function transformCap(): number {
  return Number(process.env.MEDIA_TRANSFORM_CAP ?? DEFAULT_CAP);
}

type ImagesBinding = {
  input(stream: ReadableStream): {
    transform(options: Record<string, unknown>): {
      output(options: { format: string; quality?: number }): Promise<{ response(): Response }>;
    };
  };
};

type Claimed = { id: string; storage_path: string; processing_attempts: number };

function images(): ImagesBinding | null {
  try {
    const { env } = getCloudflareContext();
    return ((env as unknown as { IMAGES?: ImagesBinding }).IMAGES) ?? null;
  } catch {
    return null;
  }
}

export async function processIntakeMedia(limit = 10): Promise<Record<string, unknown>> {
  const binding = images();
  if (!binding) return { skipped: "no_images_binding" };

  const service = createServiceClient();
  const cap = transformCap();
  const { data: used } = await service.rpc("media_processing_usage_now");
  const perPhoto = DERIVATIVES.length;
  if (Number(used ?? 0) + perPhoto > cap) {
    await service.from("listing_media")
      .update({ processing_error: "paused_cap" })
      .eq("processing_state", "pending").like("storage_path", "listing-media-intake/%");
    return { paused: "monthly_cap", used, cap };
  }

  const room = Math.max(1, Math.floor((cap - Number(used ?? 0)) / perPhoto));
  const { data: claimed, error } = await service.rpc("claim_intake_media", { p_limit: Math.min(limit, room) });
  if (error) return { error: error.message };

  let processed = 0, failed = 0, retrying = 0, paused = 0;
  for (const m of (claimed ?? []) as Claimed[]) {
    const outcome = await processOne(service, binding, m);
    if (outcome === "processed") processed++;
    else if (outcome === "failed") failed++;
    else if (outcome === "paused") paused++;
    else retrying++;
  }
  return { claimed: (claimed ?? []).length, processed, retrying, failed, paused, cap };
}

async function processOne(
  service: ReturnType<typeof createServiceClient>,
  binding: ImagesBinding,
  m: Claimed,
): Promise<"processed" | "retry" | "failed" | "paused"> {
  const original = m.storage_path.replace(/^listing-media-intake\//, "");
  try {
    const { data: blob, error: dlErr } = await service.storage.from("listing-media-intake").download(original);
    if (dlErr || !blob) throw new Error(`original_unreadable: ${dlErr?.message ?? "missing"}`);
    if (!sniffImage(new Uint8Array(await blob.slice(0, 64).arrayBuffer()))) throw new Error("original_not_image");

    const paths: Record<string, string> = {};
    let width: number | null = null, height: number | null = null;
    for (const d of DERIVATIVES) {
      const result = await binding
        .input(blob.stream())
        .transform({ width: d.width, fit: "scale-down" })
        .output({ format: "image/webp", quality: 82 });
      const bytes = new Uint8Array(await result.response().arrayBuffer());
      const kind = sniffImage(bytes);
      if (kind?.ext !== "webp") throw new Error("derivative_not_webp");
      const left = metadataFound(bytes);
      if (left.length) throw new Error(`metadata_left: ${left.join(",")}`);
      const path = derivedPath(m.storage_path, m.id, d.suffix);
      const { error: upErr } = await service.storage.from("listing-media-intake")
        .upload(path, bytes, { contentType: "image/webp", upsert: true });
      if (upErr) throw new Error(`derivative_upload: ${upErr.message}`);
      paths[d.suffix] = path;
      if (d.suffix === "1600") ({ width, height } = webpSize(bytes));
    }
    await service.rpc("media_processing_usage_add", { p_count: DERIVATIVES.length });

    await service.from("listing_media").update({
      processing_state: "processed",
      derived_path: `listing-media-intake/${paths["1600"]}`,
      derived_thumb_path: `listing-media-intake/${paths["400"]}`,
      width, height,
      processing_error: null,
      processing_started_at: null,
      processing_next_at: null,
    }).eq("id", m.id);
    return "processed";
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    if (/9422/.test(message)) {
      await service.from("listing_media").update({
        processing_state: "pending", processing_error: "paused_quota", processing_started_at: null,
      }).eq("id", m.id);
      return "paused";
    }
    const attempts = m.processing_attempts + 1;
    const done = attempts >= BACKOFF_MINUTES.length;
    await service.from("listing_media").update({
      processing_state: done ? "failed" : "pending",
      processing_attempts: attempts,
      processing_error: message,
      processing_started_at: null,
      processing_next_at: done ? null : new Date(Date.now() + BACKOFF_MINUTES[attempts - 1] * 60_000).toISOString(),
    }).eq("id", m.id);
    console.error(`[photo-processing] ${m.id} attempt ${attempts}: ${message}`);
    return done ? "failed" : "retry";
  }
}

/** Width and height of a lossy or lossless WebP (VP8 / VP8L / VP8X). */
function webpSize(b: Uint8Array): { width: number | null; height: number | null } {
  const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (tag === "VP8X" && b.length >= 30) {
    return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  if (tag === "VP8 " && b.length >= 30) {
    return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  if (tag === "VP8L" && b.length >= 25) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { width: null, height: null };
}
