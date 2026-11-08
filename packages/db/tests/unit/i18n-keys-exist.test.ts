import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every literal translation key a component asks for must exist.
 *
 * WHY THIS IS SEPARATE FROM THE PARITY TEST
 *   `i18n-parity` proves the three locale files agree with each other. It
 *   cannot catch a key that exists in all three and is looked up in the wrong
 *   NAMESPACE — `tp("planLabel")` where `planLabel` lives under `dashboard`,
 *   not `plans`. That renders the literal string "plans.planLabel" as a panel
 *   heading on the agent's home screen, and it shipped exactly once before this
 *   test was written.
 *
 * HOW IT WORKS
 *   For each .tsx file, find every `getTranslations("ns")` and the variable it
 *   was assigned to, then check every `thatVariable("literal.key")` call
 *   resolves in en.json.
 *
 * WHAT IT DELIBERATELY SKIPS
 *   Template-literal keys — `t(\`queue.${c.key}\`)` — cannot be resolved
 *   statically without evaluating the component. Those are covered by the
 *   screens being opened, and by the parity test for the locale side. A check
 *   that guessed at them would produce false failures, and a test people learn
 *   to ignore is worse than no test.
 */

const APPS = [
  { name: "hub", src: join(process.cwd(), "..", "..", "apps", "hub", "src"),
    messages: join(process.cwd(), "..", "..", "apps", "hub", "messages", "en.json") },
  { name: "www", src: join(process.cwd(), "..", "..", "apps", "www", "src"),
    messages: join(process.cwd(), "..", "..", "apps", "www", "messages", "en.json") },
] as const;

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.add(key);
    else for (const nested of flatten(v, key)) out.add(nested);
  }
  return out;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe.each(APPS)("translation keys used in components ($name)", ({ src: APP, messages }) => {
  const keys = flatten(JSON.parse(readFileSync(messages, "utf8")));

  it("every literal key resolves in en.json", () => {
    const problems: string[] = [];

    for (const file of walk(APP)) {
      const src = readFileSync(file, "utf8");

      // `const t = await getTranslations("dashboard")` → t maps to "dashboard".
      const namespaces = new Map<string, string>();
      for (const m of src.matchAll(
        /const\s+(\w+)\s*=\s*(?:await\s+)?(?:getTranslations|useTranslations)\(\s*"([^"]+)"\s*\)/g
      )) {
        namespaces.set(m[1], m[2]);
      }
      if (namespaces.size === 0) continue;

      for (const [variable, ns] of namespaces) {
        // `t("some.key")` — double-quoted literals only; backticks are skipped
        // on purpose (see the note above).
        const call = new RegExp(`\\b${variable}\\(\\s*"([^"]+)"`, "g");
        for (const m of src.matchAll(call)) {
          const full = `${ns}.${m[1]}`;
          if (!keys.has(full)) {
            problems.push(`${relative(APP, file)}: ${variable}("${m[1]}") → ${full} not found`);
          }
        }
      }
    }

    expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
  });
});
