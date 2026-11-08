import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Each app's locale files must agree with each other.
 *
 * WHY THIS EXISTS
 *   A key added to `en.json` and forgotten in the others does not throw. It
 *   renders the key itself: an Indonesian admin sees the literal string
 *   `admin.nav.search` in their navigation. That shipped to production once,
 *   and the only reason it was caught is that someone happened to look at the
 *   right screen at the right width.
 *
 *   `id` is the default locale and the majority of users, so a gap there is
 *   worse than a gap in `en` — and it is exactly the gap most likely to
 *   happen, because the copy gets written in English first.
 *
 * WHAT IT CHECKS
 *   Identical key sets, and identical ICU placeholders per key. The second one
 *   matters as much as the first: a translation that drops `{count}` renders a
 *   sentence with a hole in it, and one that invents `{total}` throws at
 *   runtime for that locale only.
 */

/**
 * Both apps now ship all three languages.
 *
 * The marketplace was Indonesia-only (id/en). It is now built per MARKET from
 * one codebase: the Indonesian deployment serves id then en, the Malaysian one
 * serves en then ms. Which pair a deployment routes is decided by
 * `NEXT_PUBLIC_MARKET`; the message files have to carry all three regardless,
 * so every key resolves whichever market is built.
 */
const APPS = [
  { name: "hub", dir: join(process.cwd(), "..", "..", "apps", "hub", "messages"), locales: ["en", "id", "ms"] },
  { name: "www", dir: join(process.cwd(), "..", "..", "apps", "www", "messages"), locales: ["en", "id", "ms"] },
] as const;

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else out.set(key, ""), out.delete(key), flatten(v, key).forEach((val, kk) => out.set(kk, val));
  }
  return out;
}

const SEP = String.fromCharCode(10);

/** `{count}`, `{name}` — but not the `plural`/`select` machinery around them. */
function placeholders(message: string): Set<string> {
  const found = new Set<string>();
  for (const m of message.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*[,}]/g)) found.add(m[1]);
  return found;
}

function load(dir: string, locales: readonly string[]) {
  return Object.fromEntries(
    locales.map((l) => [l, flatten(JSON.parse(readFileSync(join(dir, `${l}.json`), "utf8")))])
  ) as Record<string, Map<string, string>>;
}

describe.each(APPS)("locale files ($name)", ({ dir, locales }) => {
  const loaded = load(dir, locales);
  const base = locales[0] === "en" ? "en" : locales[0];
  const others = locales.filter((l) => l !== base);

  it("every declared locale file exists and is non-trivial", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    expect(files).toEqual([...locales].sort().map((l) => `${l}.json`));
    for (const l of locales) expect(loaded[l].size).toBeGreaterThan(100);
  });

  it("every key in English exists in the other locales", () => {
    for (const l of others) {
      const missing = [...loaded[base].keys()].filter((k) => !loaded[l].has(k));
      expect(missing, `${l}.json is missing ${missing.length} key(s)`).toEqual([]);
    }
  });

  it("no locale carries a key English does not have", () => {
    /* A leftover key is dead weight, but more importantly it usually means a
     * key was RENAMED in en and the rename was not carried across — so the
     * other locale still has the old one and is silently missing the new. */
    for (const l of others) {
      const extra = [...loaded[l].keys()].filter((k) => !loaded[base].has(k));
      expect(extra, `${l}.json has ${extra.length} key(s) English does not`).toEqual([]);
    }
  });

  it("placeholders match across locales", () => {
    const problems: string[] = [];
    for (const [key, enMessage] of loaded[base]) {
      const expected = placeholders(enMessage);
      for (const l of others) {
        const actual = placeholders(loaded[l].get(key) ?? "");
        const missing = [...expected].filter((ph) => !actual.has(ph));
        const invented = [...actual].filter((ph) => !expected.has(ph));
        if (missing.length || invented.length) {
          problems.push(`${l}:${key} missing=[${missing.join(",")}] invented=[${invented.join(",")}]`);
        }
      }
    }
    expect(problems, problems.join(SEP)).toEqual([]);
  });

  it("no message is left as an empty string", () => {
    /* An empty string renders as nothing, which looks like a layout bug rather
     * than a missing translation and gets debugged in the wrong place. */
    for (const l of locales) {
      const blank = [...loaded[l].entries()].filter(([, v]) => v.trim() === "").map(([k]) => k);
      expect(blank, `${l}.json has ${blank.length} blank message(s)`).toEqual([]);
    }
  });

  it("no translated message is still the English text", () => {
    /* Not a hard rule — "Platform", "Status" and "Admin" are legitimately the
     * same word — so this asserts a proportion rather than zero. A jump here
     * means a block of copy was pasted across without being translated. */
    for (const l of others) {
      const comparable = [...loaded[base].entries()].filter(([, v]) => v.trim().length > 12);
      const identical = comparable.filter(([k, v]) => loaded[l].get(k) === v);
      const ratio = identical.length / comparable.length;
      expect(ratio, `${Math.round(ratio * 100)}% of ${l} messages are untranslated English`)
        .toBeLessThan(0.1);
    }
  });
});
