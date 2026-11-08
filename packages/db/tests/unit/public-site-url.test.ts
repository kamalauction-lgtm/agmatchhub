import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { publicSiteUrl } from "../../../../apps/hub/src/lib/public-site-url";

/**
 * Regression: an unset or malformed NEXT_PUBLIC_MARKETPLACE_URL must not throw.
 * publicSiteUrl() returns null, and callers withhold share links. A value
 * with a path keeps only its origin, so share links never get a stray path.
 */
describe("publicSiteUrl", () => {
  const KEY = "NEXT_PUBLIC_MARKETPLACE_URL";
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[KEY];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  });

  const withValue = (value: string | undefined) => {
    if (value === undefined) delete process.env[KEY];
    else process.env[KEY] = value;
    return publicSiteUrl();
  };

  it("returns null when the variable is unset", () => {
    expect(withValue(undefined)).toBeNull();
  });

  it("returns null when the variable is empty or only whitespace", () => {
    expect(withValue("")).toBeNull();
    expect(withValue("   ")).toBeNull();
  });

  it("returns null for a value without a scheme", () => {
    expect(withValue("www.propertiguru.id")).toBeNull();
  });

  it("returns null for a non-http scheme", () => {
    expect(withValue("ftp://www.propertiguru.id")).toBeNull();
  });

  it("returns null for text that is not a URL", () => {
    expect(withValue("not a url")).toBeNull();
  });

  it("returns the origin for a valid https URL", () => {
    expect(withValue("https://www.propertiguru.id")).toBe("https://www.propertiguru.id");
  });

  it("drops a trailing slash and any path", () => {
    expect(withValue("https://www.propertiguru.id/")).toBe("https://www.propertiguru.id");
    expect(withValue("https://www.propertiguru.id/sub/path")).toBe("https://www.propertiguru.id");
  });

  it("accepts a local http origin with a port (dev only)", () => {
    expect(withValue("http://localhost:8154")).toBe("http://localhost:8154");
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(withValue("  https://www.propertiguru.id  ")).toBe("https://www.propertiguru.id");
  });
});
