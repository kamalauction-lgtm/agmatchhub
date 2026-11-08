/**
 * Signature primitives shared by the three gateway adapters. Web Crypto only,
 * so the same code runs in Node (tests), Next dev and the Cloudflare Worker.
 * Pure: no env, no I/O — which is what makes the adapters' verification
 * unit-testable without a gateway.
 */

const enc = new TextEncoder();

export async function hmacHex(algorithm: "SHA-256" | "SHA-512", secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: algorithm }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return toHex(sig);
}

export async function digestHex(algorithm: "SHA-256" | "SHA-512", data: string): Promise<string> {
  return toHex(await crypto.subtle.digest(algorithm, enc.encode(data)));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time comparison of two hex/base64 strings. A plain `===` returns
 * early on the first differing character, which leaks how much of a forged
 * signature was right.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Base64 of a UTF-8 string, for HTTP Basic auth headers (Workers have no Buffer). */
export function base64(s: string): string {
  const bytes = enc.encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
