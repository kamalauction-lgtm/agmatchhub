import { describe, it, expect } from "vitest";

/**
 * URL vetting for the listing importer.
 *
 * The agent types a URL and the SERVER fetches it, which is a server-side
 * request forgery primitive unless every one of these is refused. The rules
 * are duplicated here rather than imported because `safe-fetch.ts` is
 * "server-only" and cannot load in a plain Vitest process — so this asserts the
 * SPECIFICATION. If the two ever disagree, the copy below is what was agreed
 * and the implementation is what is wrong.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]",
  "metadata.google.internal", "metadata.goog", "instance-data", "169.254.169.254",
]);

function isPrivateAddress(host: string): boolean {
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  const v6 = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(v6)) return true;
  // Both spellings of IPv4-mapped IPv6. The hex one matters: `new URL()`
  // rewrites [::ffff:127.0.0.1] to [::ffff:7f00:1], so a dotted-only check
  // lets loopback straight through. This test caught exactly that.
  const mappedDotted = v6.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted) return isPrivateAddress(mappedDotted[1]);
  const mappedHex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPrivateAddress([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join("."));
  }
  return false;
}

function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported_scheme");
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("blocked_host");
  }
  if (isPrivateAddress(host)) throw new Error("private_address");
  return url;
}

const rejects = (url: string, reason: string) =>
  it(`rejects ${url}`, () => expect(() => assertSafeUrl(url)).toThrow(reason));

describe("import URL vetting", () => {
  describe("localhost and loopback", () => {
    rejects("http://localhost/admin", "blocked_host");
    rejects("http://localhost:8151/", "blocked_host");
    // The literal is on the blocklist, so it is refused a step earlier than
    // the range check. Both refuse it; the blocklist just gets there first.
    rejects("http://127.0.0.1/", "blocked_host");
    rejects("http://127.99.1.2/", "private_address");
    rejects("http://0.0.0.0/", "blocked_host");
    rejects("http://[::1]/", "blocked_host");
    rejects("http://anything.localhost/", "blocked_host");
  });

  describe("private ranges", () => {
    rejects("http://10.0.0.5/", "private_address");
    rejects("http://192.168.1.1/", "private_address");
    rejects("http://172.16.0.1/", "private_address");
    rejects("http://172.31.255.255/", "private_address");
    rejects("http://100.64.0.1/", "private_address");        // CGNAT
    it("allows 172.32.x, which is public", () => {
      expect(() => assertSafeUrl("http://172.32.0.1/")).not.toThrow();
    });
  });

  describe("cloud metadata — the one that leaks credentials", () => {
    rejects("http://169.254.169.254/latest/meta-data/", "blocked_host");
    rejects("http://169.254.1.1/", "private_address");        // link-local generally
    rejects("http://metadata.google.internal/", "blocked_host");
    rejects("http://instance-data/latest/", "blocked_host");
  });

  describe("IPv6 shorthands that bypass a naive v4 check", () => {
    rejects("http://[fc00::1]/", "private_address");          // unique-local
    rejects("http://[fe80::1]/", "private_address");          // link-local
    rejects("http://[::ffff:127.0.0.1]/", "private_address"); // v4-mapped loopback
    // …and the form `new URL()` actually produces from the line above. This
    // one was a live bypass until this test found it.
    rejects("http://[::ffff:7f00:1]/", "private_address");    // 127.0.0.1 in hex
    rejects("http://[::ffff:c0a8:1]/", "private_address");    // 192.168.0.1 in hex
    rejects("http://[::ffff:a9fe:a9fe]/", "private_address"); // 169.254.169.254
  });

  describe("schemes", () => {
    rejects("file:///etc/passwd", "unsupported_scheme");
    rejects("ftp://example.com/x", "unsupported_scheme");
    rejects("gopher://example.com/", "unsupported_scheme");
    rejects("data:text/html,<script>alert(1)</script>", "unsupported_scheme");
    rejects("javascript:alert(1)", "unsupported_scheme");
  });

  describe("malformed", () => {
    rejects("not a url", "invalid_url");
    rejects("", "invalid_url");
    rejects("://missing-scheme", "invalid_url");
  });

  describe("legitimate portal URLs pass", () => {
    for (const u of [
      "https://www.rumah123.com/properti/jakarta-selatan/hos12345678/",
      "https://www.99.co/id/properti/apartemen-1234567",
      "https://www.pinhome.id/properti/rumah-dijual-1234",
      "https://www.lamudi.co.id/rumah-dijual-abc/",
      "https://www.olx.co.id/item/rumah-iid-123456789",
      "http://example.com/listing",
    ]) {
      it(`allows ${u}`, () => expect(() => assertSafeUrl(u)).not.toThrow());
    }
  });
});

/**
 * Imported text is written into titles and descriptions other people read. It
 * must never be stored as markup — sanitising at render time is one forgotten
 * `dangerouslySetInnerHTML` away from failing.
 */
function sanitiseText(input: string | null | undefined, maxLength = 4000): string | null {
  if (!input) return null;
  let s = String(input);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<[^>]*>/g, " ");
  s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
       .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
       .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
       .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  s = s.replace(/<[^>]*>/g, " ");
  return s.replace(/\s+/g, " ").trim().slice(0, maxLength) || null;
}

describe("imported text sanitisation", () => {
  it("strips script tags and their contents", () => {
    expect(sanitiseText('<script>alert("x")</script>Rumah bagus')).toBe("Rumah bagus");
  });
  it("strips markup but keeps the words", () => {
    expect(sanitiseText("<b>Rumah</b> di <i>Bekasi</i>")).toBe("Rumah di Bekasi");
  });
  it("neutralises double-encoded markup", () => {
    // &lt;script&gt; decodes to <script>, which a single pass would leave intact
    expect(sanitiseText("&lt;script&gt;alert(1)&lt;/script&gt;Rumah")).not.toContain("<script>");
  });
  it("decodes ordinary entities", () => {
    expect(sanitiseText("Rumah &amp; Tanah")).toBe("Rumah & Tanah");
  });
  it("caps length", () => {
    expect(sanitiseText("a".repeat(5000), 100)?.length).toBe(100);
  });
  it("returns null for nothing", () => {
    expect(sanitiseText("")).toBeNull();
    expect(sanitiseText("   ")).toBeNull();
    expect(sanitiseText(null)).toBeNull();
  });
});
