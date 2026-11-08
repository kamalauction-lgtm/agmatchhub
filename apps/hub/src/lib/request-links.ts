import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 192-bit non-sequential link token (§15). */
export function generateLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

/** 8-char access code from an unambiguous alphabet (no 0/O/1/I). */
export function generateLinkPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h per unlocked link

function secret(): string {
  const s = process.env.TOKEN_SIGNING_SECRET;
  if (!s) throw new Error("TOKEN_SIGNING_SECRET is not configured");
  return s;
}

/** HMAC-signed proof that this browser passed the link's password gate. */
export function signLinkSession(linkId: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${linkId}.${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${exp}.${sig}`;
}

export function verifyLinkSession(value: string | undefined, linkId: string): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const exp = Number(value.slice(0, dot));
  const sig = value.slice(dot + 1);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = createHmac("sha256", secret())
    .update(`${linkId}.${exp}`)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const linkCookieName = (linkId: string) => `rl_${linkId.replaceAll("-", "")}`;
