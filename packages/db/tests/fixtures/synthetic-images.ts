import { deflateSync } from "node:zlib";

/**
 * Synthetic images for the photo tests (P0-e-1a). Generated, never downloaded:
 * no third-party photograph is used anywhere in the suite.
 */

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const be32 = (n: number) => Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const chunk = (type: string, data: Uint8Array) => {
  const t = new TextEncoder().encode(type);
  return concat(be32(data.length), t, data, be32(crc32(concat(t, data))));
};

/** A valid RGB PNG of the given size, filled with one colour. `seed` changes the bytes. */
export function syntheticPng(width = 64, height = 48, seed = 0): Uint8Array {
  const row = new Uint8Array(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = (40 + seed * 37) & 255;
    row[2 + x * 3] = (120 + seed * 11) & 255;
    row[3 + x * 3] = (200 + seed * 5) & 255;
  }
  const raw = new Uint8Array(row.length * height);
  for (let y = 0; y < height; y++) raw.set(row, y * row.length);
  const ihdr = concat(be32(width), be32(height), Uint8Array.of(8, 2, 0, 0, 0));
  return concat(
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  );
}

/**
 * A JPEG-shaped file carrying a FAKE GPS position in its EXIF block, and an
 * SOF0 header saying 800×600. It is not a viewable picture; it exists to prove
 * that an original with location data is kept private.
 */
export function syntheticJpegWithGps(seed = 0): Uint8Array {
  const tiff = Uint8Array.of(
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,   // big-endian TIFF, IFD0 at 8
    0x00, 0x01,                                         // 1 entry
    0x88, 0x25, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01,     // GPSInfo IFD pointer
    0x00, 0x00, 0x00, 0x1a,
    0x00, 0x00, 0x00, 0x00,                             // next IFD: none
    0x00, 0x01,                                         // GPS IFD: 1 entry
    0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02,     // GPSLatitudeRef "S"
    0x53, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  );
  const exif = concat(new TextEncoder().encode("Exif\0\0"), tiff);
  const app1 = concat(Uint8Array.of(0xff, 0xe1), Uint8Array.of((exif.length + 2) >> 8, (exif.length + 2) & 255), exif);
  const sof0 = Uint8Array.of(0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01);
  return concat(Uint8Array.of(0xff, 0xd8), app1, sof0, Uint8Array.of(0xff, 0xfe, 0x00, 0x04, seed & 255, 0x00), Uint8Array.of(0xff, 0xd9));
}

/** A minimal RIFF/WEBP header. */
export function syntheticWebpHeader(): Uint8Array {
  return concat(new TextEncoder().encode("RIFF"), be32(4), new TextEncoder().encode("WEBPVP8 "));
}
