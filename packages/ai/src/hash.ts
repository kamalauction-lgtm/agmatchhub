/**
 * SHA-256 hex of a normalised input, for the ledger's `input_hash`.
 *
 * WebCrypto, not node:crypto, so the same code runs on Workers and in Node.
 * The hash lets the engine recognise a repeat of the same request (cache) and
 * lets an admin see that two jobs had identical input — without the ledger
 * ever storing the input itself.
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Stable JSON for hashing: sorted keys, no whitespace. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}
