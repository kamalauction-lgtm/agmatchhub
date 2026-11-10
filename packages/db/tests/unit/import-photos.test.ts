import { describe, it, expect, afterEach, vi } from "vitest";
import { sniffImage, intakePath, sha256Hex, urlKey } from "../../../../apps/hub/src/lib/import/photos";
import { safeFetchImage } from "../../../../apps/hub/src/lib/import/safe-fetch";
import { syntheticPng, syntheticJpegWithGps, syntheticWebpHeader } from "../fixtures/synthetic-images";

/**
 * Imported photos (P0-e-1a): the file decides what it is, keys come from the
 * content, and the image fetcher refuses what the page fetcher refuses — plus
 * anything that is not an image or is over 10 MB. Synthetic images only.
 */

describe("sniffImage", () => {
  it("reads a PNG and its size", () => {
    expect(sniffImage(syntheticPng(64, 48))).toEqual({ ext: "png", mime: "image/png", width: 64, height: 48 });
  });
  it("reads a JPEG and its SOF0 size, past an EXIF block", () => {
    expect(sniffImage(syntheticJpegWithGps())).toEqual({ ext: "jpg", mime: "image/jpeg", width: 800, height: 600 });
  });
  it("recognises WebP", () => {
    expect(sniffImage(syntheticWebpHeader())?.ext).toBe("webp");
  });
  it("refuses HTML and empty files whatever they claim to be", () => {
    expect(sniffImage(new TextEncoder().encode("<!doctype html><title>Just a moment...</title>"))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
  });
});

describe("content keys", () => {
  it("the intake path is the owner's folder, the listing and a content prefix", async () => {
    const hash = await sha256Hex(syntheticPng());
    expect(intakePath("agent-1", "listing-1", hash, "png")).toBe(`agent-1/listing-1/src-${hash.slice(0, 16)}.png`);
  });
  it("the same bytes give the same key; different bytes a different one", async () => {
    expect(await sha256Hex(syntheticPng(10, 10, 1))).toBe(await sha256Hex(syntheticPng(10, 10, 1)));
    expect(await sha256Hex(syntheticPng(10, 10, 1))).not.toBe(await sha256Hex(syntheticPng(10, 10, 2)));
  });
  it("a URL key is short and not the URL", async () => {
    const k = await urlKey("https://example.test/photo.jpg");
    expect(k).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("safeFetchImage", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (body: Uint8Array | string, headers: Record<string, string>, status = 200) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body as BodyInit, { status, headers })));

  it("returns the bytes of an image", async () => {
    const png = syntheticPng();
    respond(png, { "content-type": "image/png", "content-length": String(png.length) });
    const r = await safeFetchImage("https://example.test/a.png");
    expect(r.bytes.length).toBe(png.length);
  });
  it("refuses an HTML page", async () => {
    respond("<html></html>", { "content-type": "text/html" });
    await expect(safeFetchImage("https://example.test/a.png")).rejects.toMatchObject({ reason: "unsupported_content" });
  });
  it("refuses a declared size over 10 MB without reading it", async () => {
    respond(syntheticPng(), { "content-type": "image/png", "content-length": String(11 * 1024 * 1024) });
    await expect(safeFetchImage("https://example.test/a.png")).rejects.toMatchObject({ reason: "too_large" });
  });
  it("treats a bot challenge as blocked, not as a photo", async () => {
    respond("challenge", { "content-type": "text/html", "cf-mitigated": "challenge" }, 403);
    await expect(safeFetchImage("https://example.test/a.png")).rejects.toMatchObject({ reason: "blocked_by_site" });
  });
  it("re-checks a redirect and refuses one to a private address", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } })));
    await expect(safeFetchImage("https://example.test/a.png")).rejects.toMatchObject({ reason: expect.stringMatching(/private_address|blocked_host/) });
  });
  it("refuses a private address outright", async () => {
    await expect(safeFetchImage("http://127.0.0.1/a.png")).rejects.toMatchObject({ reason: expect.stringMatching(/private_address|blocked_host/) });
  });
});

describe("metadataFound (P0-e-2a derivative check)", () => {
  it("a WebP with only image data is clean", async () => {
    const { metadataFound } = await import("../../../../apps/hub/src/lib/import/photos");
    const { syntheticWebpWithChunks } = await import("../fixtures/synthetic-images");
    expect(metadataFound(syntheticWebpWithChunks([]))).toEqual([]);
  });
  it("finds an EXIF or XMP chunk in a WebP", async () => {
    const { metadataFound } = await import("../../../../apps/hub/src/lib/import/photos");
    const { syntheticWebpWithChunks } = await import("../fixtures/synthetic-images");
    const exif = syntheticWebpWithChunks([{ fourcc: "EXIF", data: new TextEncoder().encode("Exif\0\0GPS") }]);
    expect(metadataFound(exif)).toContain("EXIF");
    const xmp = syntheticWebpWithChunks([{ fourcc: "XMP ", data: new TextEncoder().encode("<x:xmpmeta/>") }]);
    expect(metadataFound(xmp)).toContain("XMP");
  });
  it("finds an EXIF header in any file, such as the GPS JPEG", async () => {
    const { metadataFound } = await import("../../../../apps/hub/src/lib/import/photos");
    expect(metadataFound(syntheticJpegWithGps())).toContain("Exif header");
  });
  it("derivatives live in the owner's folder, next to the original", async () => {
    const { derivedPath } = await import("../../../../apps/hub/src/lib/import/photos");
    expect(derivedPath("listing-media-intake/agent/listing/src-0123456789abcdef.jpg", "media", "1600"))
      .toBe("agent/listing/derived-media-1600.webp");
  });
});
