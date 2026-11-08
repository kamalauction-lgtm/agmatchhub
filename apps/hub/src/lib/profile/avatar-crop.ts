/**
 * The avatar crop heuristic, with no DOM in it.
 *
 * Kept separate from the upload component so the arithmetic can be tested
 * against real photographs instead of being trusted. The component does the
 * canvas work — rasterise, read pixels, encode — and calls these for every
 * decision that could be wrong.
 */

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type CropMode = "head" | "full";

/** Below this a pixel is background, not subject. */
export const ALPHA_THRESHOLD = 16;

/**
 * The subject's bounding box from an RGBA buffer.
 *
 * Agent photographs are usually cut-outs on transparency, and the alpha channel
 * is an exact silhouette — so this is a measurement, not a guess. Returns null
 * when the image is fully opaque (an ordinary photo, nothing to find) or fully
 * transparent (nothing there at all).
 */
export function scanAlphaBox(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  threshold = ALPHA_THRESHOLD,
): Box | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }

  if (x1 < 0) return null;                                    // nothing opaque
  // Covers the whole frame: an ordinary photo with no transparency to exploit.
  if (x1 - x0 >= width - 2 && y1 - y0 >= height - 2) return null;
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Scale a box measured on a downscaled scan back to source pixels. */
export function scaleBox(box: Box, inverseScale: number): Box {
  return {
    x0: box.x0 * inverseScale,
    y0: box.y0 * inverseScale,
    x1: box.x1 * inverseScale,
    y1: box.y1 * inverseScale,
  };
}

/**
 * The square to take, in source pixels.
 *
 * `head`  — roughly the top half of the subject, which is where a head is on a
 *           standing or seated person. Also bounded by the subject's own width
 *           so a narrow figure does not drag in half the frame.
 * `full`  — the largest square that still holds the whole subject.
 *
 * `nudge` runs -1..1 and shifts the window by up to a quarter of the subject's
 * height, because "the head is at the top" is a rule with exceptions and the
 * agent can see the preview.
 *
 * The result is always inside the image.
 */
export function cropRect(
  imageWidth: number,
  imageHeight: number,
  box: Box,
  mode: CropMode,
  nudge = 0,
): { x: number; y: number; side: number } {
  const sw = box.x1 - box.x0;
  const sh = box.y1 - box.y0;
  const cx = box.x0 + sw / 2;
  const cy = box.y0 + sh / 2;

  /* No subject was found, so the "box" is the whole photograph. There is
     nothing to centre on and nothing to pad around — take the largest square
     the frame allows, which is an ordinary centre crop. */
  const wholeFrame =
    box.x0 <= 0 && box.y0 <= 0 && box.x1 >= imageWidth && box.y1 >= imageHeight;

  if (mode === "full" && wholeFrame) {
    const side = Math.max(1, Math.min(imageWidth, imageHeight));
    return {
      x: clamp(cx - side / 2, 0, Math.max(0, imageWidth - side)),
      y: clamp(cy - side / 2 + nudge * sh * 0.15, 0, Math.max(0, imageHeight - side)),
      side,
    };
  }

  if (mode === "full") {
    /* A square that CONTAINS the subject, centred on them — deliberately
     * allowed to fall outside the image, which the caller renders as empty
     * margin.
     *
     * Clamping here was wrong and the first version did it: a subject 632×1212
     * inside a 1024×1536 frame cannot fit in any square the image can supply,
     * so `side` pinned to the image width, `x` pinned to 0, and the person
     * ended up shoved against the right edge again — the exact fault this
     * whole component exists to remove. Padding is the only honest answer to
     * "show all of them, square".
     */
    const side = Math.max(1, Math.max(sw, sh) * 1.06);
    return { x: cx - side / 2, y: cy - side / 2 + nudge * sh * 0.15, side };
  }

  // head: a window inside the image, so it never shows empty margin.
  const side = Math.max(1, Math.min(sh * 0.55, Math.max(sw, 1) * 1.15, imageWidth, imageHeight));
  const top = box.y0 - sh * 0.02;

  return {
    x: clamp(cx - side / 2, 0, Math.max(0, imageWidth - side)),
    y: clamp(top + nudge * sh * 0.25, 0, Math.max(0, imageHeight - side)),
    side,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
