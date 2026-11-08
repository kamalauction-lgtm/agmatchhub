import { describe, it, expect } from "vitest";
import {
  scanAlphaBox, scaleBox, cropRect, type Box,
} from "../../../../apps/hub/src/lib/profile/avatar-crop";

/**
 * The avatar crop heuristic.
 *
 * The numbers below are Kamal's actual profile photo, measured from the file:
 * 1024×1536, with the subject occupying x 392–1024, y 184–1396. That is 392
 * columns of empty transparency down the left side — which is why a centred
 * square crop put him against the right edge of the circle with half the frame
 * empty, and why `object-position` could not fix it.
 */

const REAL_PHOTO = { width: 1024, height: 1536 };
const REAL_SUBJECT: Box = { x0: 392, y0: 184, x1: 1024, y1: 1396 };

/** A tiny RGBA buffer with an opaque rectangle in it. */
function buffer(w: number, h: number, opaque?: { x0: number; y0: number; x1: number; y1: number }) {
  const data = new Uint8ClampedArray(w * h * 4);
  if (!opaque) return data;
  for (let y = opaque.y0; y < opaque.y1; y++) {
    for (let x = opaque.x0; x < opaque.x1; x++) {
      data[(y * w + x) * 4 + 3] = 255;
    }
  }
  return data;
}

describe("finding the subject in a cut-out", () => {
  it("measures the opaque region", () => {
    const data = buffer(20, 20, { x0: 5, y0: 3, x1: 15, y1: 18 });
    expect(scanAlphaBox(data, 20, 20)).toEqual({ x0: 5, y0: 3, x1: 15, y1: 18 });
  });

  it("returns nothing for a fully opaque image — an ordinary photo", () => {
    const data = buffer(20, 20, { x0: 0, y0: 0, x1: 20, y1: 20 });
    expect(scanAlphaBox(data, 20, 20)).toBeNull();
  });

  it("returns nothing for a fully transparent image", () => {
    expect(scanAlphaBox(buffer(20, 20), 20, 20)).toBeNull();
  });

  it("ignores near-transparent anti-aliasing rather than chasing it", () => {
    const data = buffer(20, 20, { x0: 8, y0: 8, x1: 12, y1: 12 });
    data[(2 * 20 + 2) * 4 + 3] = 10;           // a faint stray pixel
    expect(scanAlphaBox(data, 20, 20)).toEqual({ x0: 8, y0: 8, x1: 12, y1: 12 });
  });

  it("scales a box measured on a downscaled scan back to source pixels", () => {
    expect(scaleBox({ x0: 10, y0: 20, x1: 30, y1: 50 }, 4)).toEqual({
      x0: 40, y0: 80, x1: 120, y1: 200,
    });
  });
});

describe("head crop, on Kamal's real photo", () => {
  const { x, y, side } = cropRect(REAL_PHOTO.width, REAL_PHOTO.height, REAL_SUBJECT, "head");

  it("follows the subject instead of the frame", () => {
    // A centred crop would start at x = (1024-side)/2. The subject's centre is
    // at x = 708, so the window has to sit well right of that.
    const centred = (REAL_PHOTO.width - side) / 2;
    expect(x).toBeGreaterThan(centred);
  });

  it("starts at the top of the subject, where the head is", () => {
    expect(y).toBeLessThan(REAL_SUBJECT.y0 + 10);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  it("takes a square big enough to be a portrait, not a close-up of an ear", () => {
    const subjectHeight = REAL_SUBJECT.y1 - REAL_SUBJECT.y0;
    expect(side).toBeGreaterThan(subjectHeight * 0.4);
    expect(side).toBeLessThan(subjectHeight * 0.8);
  });

  it("stays inside the image", () => {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + side).toBeLessThanOrEqual(REAL_PHOTO.width + 0.001);
    expect(y + side).toBeLessThanOrEqual(REAL_PHOTO.height + 0.001);
  });

  it("keeps the head inside the window", () => {
    // The head occupies roughly the top eighth of a standing subject.
    const headBottom = REAL_SUBJECT.y0 + (REAL_SUBJECT.y1 - REAL_SUBJECT.y0) * 0.18;
    expect(y).toBeLessThanOrEqual(REAL_SUBJECT.y0);
    expect(y + side).toBeGreaterThan(headBottom);
  });
});

describe("full-body crop", () => {
  const { x, y, side } = cropRect(REAL_PHOTO.width, REAL_PHOTO.height, REAL_SUBJECT, "full");

  it("is larger than the head crop", () => {
    const head = cropRect(REAL_PHOTO.width, REAL_PHOTO.height, REAL_SUBJECT, "head");
    expect(side).toBeGreaterThan(head.side);
  });

  it("contains the whole subject", () => {
    expect(side).toBeGreaterThanOrEqual(REAL_SUBJECT.y1 - REAL_SUBJECT.y0);
    expect(x).toBeLessThanOrEqual(REAL_SUBJECT.x0);
    expect(y).toBeLessThanOrEqual(REAL_SUBJECT.y0);
    expect(x + side).toBeGreaterThanOrEqual(REAL_SUBJECT.x1);
    expect(y + side).toBeGreaterThanOrEqual(REAL_SUBJECT.y1);
  });

  /* The regression this replaced an assertion for. The first version clamped
     the window to the image, which for a subject taller than the frame is wide
     forced side = image width and x = 0 — putting the person hard against the
     right edge, exactly the fault being fixed. Padding is required, so the
     window MUST be allowed outside the image. */
  it("centres the subject even though that means falling outside the image", () => {
    const subjectCentreX = REAL_SUBJECT.x0 + (REAL_SUBJECT.x1 - REAL_SUBJECT.x0) / 2;
    expect(x + side / 2).toBeCloseTo(subjectCentreX, 0);

    // It must genuinely overhang — that is the proof it was not clamped. Which
    // edge depends on where the subject stands; here he is on the right, so
    // the window runs off the right, not the left.
    const overhangs =
      x < 0 || y < 0 || x + side > REAL_PHOTO.width || y + side > REAL_PHOTO.height;
    expect(overhangs).toBe(true);
  });
});

describe("the nudge control", () => {
  const base = cropRect(REAL_PHOTO.width, REAL_PHOTO.height, REAL_SUBJECT, "head", 0);

  it("moves the window down when pushed positive", () => {
    const down = cropRect(REAL_PHOTO.width, REAL_PHOTO.height, REAL_SUBJECT, "head", 1);
    expect(down.y).toBeGreaterThan(base.y);
  });

  it("cannot push the window outside the image", () => {
    for (const n of [-5, -1, 1, 5]) {
      const r = cropRect(REAL_PHOTO.width, REAL_PHOTO.height, REAL_SUBJECT, "head", n);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.side).toBeLessThanOrEqual(REAL_PHOTO.height + 0.001);
    }
  });
});

describe("ordinary photos with no transparency", () => {
  // scanAlphaBox returns null, so the caller passes the whole frame.
  const full: Box = { x0: 0, y0: 0, x1: 800, y1: 600 };

  it("takes a square from a landscape photo without leaving the frame", () => {
    const r = cropRect(800, 600, full, "head");
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.side).toBeLessThanOrEqual(800.001);
    expect(r.y + r.side).toBeLessThanOrEqual(600.001);
  });

  it("handles a square photo", () => {
    const r = cropRect(600, 600, { x0: 0, y0: 0, x1: 600, y1: 600 }, "full");
    expect(r.side).toBe(600);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it("never returns a zero or negative side", () => {
    const r = cropRect(10, 10, { x0: 5, y0: 5, x1: 5, y1: 5 }, "head");
    expect(r.side).toBeGreaterThan(0);
  });
});
