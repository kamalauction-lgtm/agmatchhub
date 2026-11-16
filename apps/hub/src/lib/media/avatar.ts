import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { metadataFound, sha256Hex, sniffImage } from "@/lib/import/photos";
import { images, transformCap } from "./process";

/**
 * Profile photos (P1-b-4, 00118; owner decision 11 Nov 2026).
 *
 * The agent's file is re-encoded through the Cloudflare Images binding into ONE
 * WebP, at most 512 px on its long side, and checked from its bytes: it must
 * be WebP and carry no EXIF or XMP. Only that derivative is ever stored, in
 * the public bucket, by the service client. The original is never stored
 * anywhere.
 *
 * It counts against the same $0 monthly cap as listing photos (one transform
 * per upload). At the cap, or where the binding is missing (local dev), it
 * refuses: a raw file is never stored as a fallback.
 */

export const AVATAR_BUCKET = "agent-profile-public";
export const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const AVATAR_EDGE = 512;

export type AvatarFailure = "invalid_file_type" | "file_too_large" | "photo_paused" | "upload_failed";

/** `<uid>/avatar-<hash16>.webp`, the only shape 00118 accepts in profiles.avatar_url. */
export function avatarPath(userId: string, hash: string): string {
  return `${userId}/avatar-${hash.slice(0, 16)}.webp`;
}

/** True for a path this code produced for this user (and so may delete). */
export function isOwnAvatarPath(userId: string, path: string | null | undefined): boolean {
  if (!path) return false;
  const clean = path.replace(new RegExp(`^${AVATAR_BUCKET}/`), "");
  return new RegExp(`^${userId}/[^/]+$`).test(clean);
}

export async function storeCleanAvatar(
  userId: string,
  bytes: Uint8Array,
): Promise<{ ok: true; path: string } | { ok: false; error: AvatarFailure }> {
  if (bytes.byteLength > MAX_AVATAR_BYTES) return { ok: false, error: "file_too_large" };
  if (!sniffImage(bytes)) return { ok: false, error: "invalid_file_type" };   // judged by its bytes

  const binding = images();
  if (!binding) return { ok: false, error: "photo_paused" };
  const service = createServiceClient();
  const { data: used } = await service.rpc("media_processing_usage_now");
  if (Number(used ?? 0) + 1 > transformCap()) return { ok: false, error: "photo_paused" };

  let clean: Uint8Array;
  try {
    const stream = new Blob([bytes as BlobPart]).stream();
    const result = await binding
      .input(stream)
      .transform({ width: AVATAR_EDGE, height: AVATAR_EDGE, fit: "scale-down" })
      .output({ format: "image/webp", quality: 85 });
    clean = new Uint8Array(await result.response().arrayBuffer());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[avatar] transform failed:", message.slice(0, 200));
    return { ok: false, error: /9422/.test(message) ? "photo_paused" : "upload_failed" };
  }
  await service.rpc("media_processing_usage_add", { p_count: 1 });
  if (sniffImage(clean)?.ext !== "webp" || metadataFound(clean).length) return { ok: false, error: "upload_failed" };

  const path = avatarPath(userId, await sha256Hex(clean));
  const { error } = await service.storage.from(AVATAR_BUCKET).upload(path, clean, { contentType: "image/webp", upsert: true });
  if (error) return { ok: false, error: "upload_failed" };
  return { ok: true, path };
}

/** Remove a superseded avatar — only inside the agent's own folder. */
export async function removeOldAvatar(userId: string, oldPath: string | null | undefined, keep: string): Promise<void> {
  if (!isOwnAvatarPath(userId, oldPath)) return;
  const clean = oldPath!.replace(new RegExp(`^${AVATAR_BUCKET}/`), "");
  if (clean === keep) return;
  const { error } = await createServiceClient().storage.from(AVATAR_BUCKET).remove([clean]);
  if (error) console.error("[avatar] old photo not removed:", error.message);
}
