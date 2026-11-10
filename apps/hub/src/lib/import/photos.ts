/**
 * Imported photos (00108): what a downloaded file really is, and its keys.
 *
 * Pure functions, no imports, so they run in the hub and in unit tests alike.
 * The declared content type of a response is only a hint; the format is
 * decided here from the file's own first bytes, so an HTML error page or a
 * renamed file is never stored as a photograph.
 */

export type SniffedImage = { ext: "jpg" | "png" | "webp"; mime: string; width: number | null; height: number | null };

export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  const b = bytes;
  // PNG: 89 50 4E 47 0D 0A 1A 0A, IHDR width/height big-endian at 16..23.
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { ext: "png", mime: "image/png", width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // JPEG: FF D8 FF; dimensions in the first SOF0..SOF15 marker (not C4/C8/CC).
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { ext: "jpg", mime: "image/jpeg", height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      }
      if (len < 2) break;
      i += 2 + len;
    }
    return { ext: "jpg", mime: "image/jpeg", width: null, height: null };
  }
  // WebP: "RIFF" .... "WEBP"
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { ext: "webp", mime: "image/webp", width: null, height: null };
  }
  return null;
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

/** The intake object key: the owner's folder, the listing, and the content. */
export function intakePath(agentId: string, listingId: string, contentHash: string, ext: string): string {
  return `${agentId}/${listingId}/src-${contentHash.slice(0, 16)}.${ext}`;
}

/** A short, non-reversible key for a photo URL, for per-URL results without storing the URL twice. */
export async function urlKey(url: string): Promise<string> {
  return (await sha256Hex(url)).slice(0, 16);
}

/** Why a photo was not saved — the codes the batch page explains. */
export type PhotoFailure =
  | "blocked" | "not_image" | "too_large" | "timeout" | "source_error"
  | "not_property" | "unsafe_url" | "save_failed";

export const MAX_PHOTO_ATTEMPTS = 3;
