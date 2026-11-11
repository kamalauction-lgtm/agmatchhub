import "server-only";

/**
 * Agent invitation tokens (00106).
 *
 * The token is 32 random bytes, base64url — it exists only in the link the
 * admin sends and in the agent's browser. The database stores and compares
 * its SHA-256 hex digest, so a read of agent_invitations (or a backup) never
 * yields a usable link. Web Crypto, because the hub runs on Workers.
 */

export const INVITE_LINK_COOKIE = "pg_invite_link";
export const INVITE_VALID_DAYS = 7;

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function hashInviteToken(token: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

export async function newInviteToken(): Promise<{ token: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = toBase64Url(bytes);
  return { token, hash: await hashInviteToken(token) };
}

/** A token is base64url of 32 bytes: 43 characters. Anything else is not one. */
export function looksLikeInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function inviteLink(token: string): string {
  const base = (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/invite/${token}`;
}
