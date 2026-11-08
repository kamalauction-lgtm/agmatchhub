import "server-only";

/**
 * Fetching a URL an agent pasted.
 *
 * This is the most dangerous input surface in the product: the agent types a
 * URL and the SERVER fetches it. Without the checks below that is a
 * server-side request forgery primitive — the worker sits inside Cloudflare's
 * network and would happily fetch a cloud metadata endpoint, an internal
 * service, or localhost, and hand the response back.
 *
 * What is enforced:
 *   · http/https only — no file:, gopher:, data:, ftp:
 *   · no localhost, no private ranges, no link-local, no cloud metadata
 *   · every redirect hop re-checked, because a public host can redirect to
 *     169.254.169.254 and the first check would have passed
 *   · a response size cap, so a multi-gigabyte body cannot exhaust the worker
 *   · a hard timeout
 *   · HTML and JSON only
 *
 * DNS rebinding is the one class this cannot fully close: a hostname that
 * resolves publicly on the check and privately on the fetch. Workers cannot
 * resolve then connect-by-IP, so the mitigation is the redirect re-check plus
 * the blocklist, and the honest note that a determined attacker with their own
 * DNS could still reach an internal address. That risk is accepted for a
 * feature only verified agents can reach, and is written down rather than
 * left implicit.
 */

const MAX_BYTES = 3_000_000;      // a listing page; anything larger is not one
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;

const BLOCKED_HOSTNAMES = new Set([
  "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]",
  "metadata.google.internal", "metadata.goog",
  "instance-data", "169.254.169.254",
]);

/** Private, loopback, link-local and carrier-grade NAT ranges. */
function isPrivateAddress(host: string): boolean {
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;   // link-local + AWS/GCP metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true;                  // multicast / reserved
    return false;
  }
  // IPv6 loopback, unique-local (fc00::/7), link-local (fe80::/10)
  const v6 = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(v6)) return true;
  // IPv4-mapped IPv6. Two spellings, and the second is the dangerous one:
  // `new URL()` normalises [::ffff:127.0.0.1] to [::ffff:7f00:1], so a check
  // that only understands the dotted form waves loopback straight through.
  // 0x7f00 0x0001 IS 127.0.0.1.
  const mappedDotted = v6.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted) return isPrivateAddress(mappedDotted[1]);

  const mappedHex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const dotted = [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
    return isPrivateAddress(dotted);
  }
  return false;
}

export type UrlRejection =
  | "invalid_url"
  | "unsupported_scheme"
  | "blocked_host"
  | "private_address"
  | "too_many_redirects"
  | "too_large"
  | "timeout"
  | "unsupported_content"
  | "blocked_by_site"
  | "not_found"
  | "fetch_failed";

export class UnsafeUrlError extends Error {
  constructor(public readonly reason: UrlRejection, message?: string) {
    super(message ?? reason);
    this.name = "UnsafeUrlError";
  }
}

/**
 * Parse and vet a URL. Exported separately so the UI can reject a paste before
 * any network call happens, and so tests can assert the rules directly.
 */
export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("invalid_url");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("unsupported_scheme", url.protocol);
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new UnsafeUrlError("blocked_host", host);
  }
  if (isPrivateAddress(host)) {
    throw new UnsafeUrlError("private_address", host);
  }
  // Credentials in a URL are never legitimate here and would be logged.
  url.username = "";
  url.password = "";
  return url;
}

export type SafeResponse = {
  url: string;          // the FINAL url after redirects
  status: number;
  contentType: string;
  body: string;
};

/**
 * Fetch a vetted URL, re-vetting every redirect hop.
 *
 * `redirect: "manual"` rather than "follow": letting fetch follow redirects
 * itself would skip the check on the intermediate hops, which is exactly how a
 * public host reaches a private one.
 */
export async function safeFetch(raw: string): Promise<SafeResponse> {
  let url = assertSafeUrl(raw);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          // Identify honestly. Pretending to be a browser to defeat bot
          // protection is exactly what the brief forbids.
          "User-Agent": "PropertiGuruImporter/1.0 (+https://www.propertiguru.id)",
          Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
        },
      });
    } catch (e) {
      const timedOut = e instanceof Error && /timeout|abort/i.test(e.message);
      throw new UnsafeUrlError(timedOut ? "timeout" : "fetch_failed", String(e));
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new UnsafeUrlError("fetch_failed", "redirect without location");
      // Re-vet. This is the whole point of manual redirects.
      url = assertSafeUrl(new URL(location, url).toString());
      continue;
    }

    /* Check the STATUS before the body.
     *
     * This was missing, and it mattered: Cloudflare answers a bot challenge
     * with 403 and a small HTML page titled "Just a moment...". Content-type
     * is text/html, so the body sailed through and was parsed as a listing —
     * the agent got a property called "Just a moment...".
     *
     * A challenge is a refusal. We report it and offer the file import
     * instead; we do not retry it wearing a browser's user agent. */
    if (res.headers.get("cf-mitigated") === "challenge" || res.status === 403 || res.status === 429) {
      throw new UnsafeUrlError("blocked_by_site", `HTTP ${res.status}`);
    }
    if (res.status === 404 || res.status === 410) {
      throw new UnsafeUrlError("not_found", `HTTP ${res.status}`);
    }
    if (res.status >= 400) {
      throw new UnsafeUrlError("fetch_failed", `HTTP ${res.status}`);
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!/text\/html|application\/xhtml|application\/json|text\/plain/.test(contentType)) {
      throw new UnsafeUrlError("unsupported_content", contentType || "unknown");
    }

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new UnsafeUrlError("too_large", `${declared} bytes`);

    // content-length can lie or be absent, so cap while reading too.
    const reader = res.body?.getReader();
    if (!reader) return { url: url.toString(), status: res.status, contentType, body: "" };

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new UnsafeUrlError("too_large", `>${MAX_BYTES} bytes`);
      }
      chunks.push(value);
    }

    const buf = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { buf.set(c, offset); offset += c.length; }

    return {
      url: url.toString(),
      status: res.status,
      contentType,
      body: new TextDecoder("utf-8").decode(buf),
    };
  }

  throw new UnsafeUrlError("too_many_redirects");
}

/**
 * Strip every tag and decode entities.
 *
 * Imported text is written into listing titles and descriptions that other
 * people will read. It must never reach a page as markup, and it must never be
 * stored as markup either — a sanitiser at render time is one forgotten
 * `dangerouslySetInnerHTML` away from failing.
 */
export function sanitiseText(input: string | null | undefined, maxLength = 4000): string | null {
  if (!input) return null;
  let s = String(input);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<[^>]*>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  // Anything still angle-bracketed after decoding was double-encoded markup.
  s = s.replace(/<[^>]*>/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, maxLength) || null;
}
