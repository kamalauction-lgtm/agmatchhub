#!/usr/bin/env node
/**
 * Capture the screenshots used by the in-app Help walkthroughs.
 *
 *   node scripts/capture-help-shots.mjs              # every shot, en + id
 *   node scripts/capture-help-shots.mjs a-onboard    # only shots whose id starts with this
 *   node scripts/capture-help-shots.mjs --probe /admin/agents/<id>   # full-page look, for writing selectors
 *
 * Screenshots come from STAGING only (demo data, never real agents or
 * clients) — the script refuses the production host. It signs in with the
 * standing test accounts from packages/db/.env.staging; no credential is
 * printed. Each shot is written to public/help/shots/<lang>/<id>.webp and its
 * highlight box (percentages of the image) to src/lib/help/shots.json, which
 * the walkthrough reads. Emails and long digit runs are masked before capture.
 *
 * When a screen changes: re-run for the affected ids, look at the images, and
 * commit them with the feature change (same rule as the Help text).
 *
 * Needs Playwright. If it is not installed in the repo, point at one:
 *   PLAYWRIGHT_MODULE=<path to playwright/index.mjs>  CHROME_PATH=<chrome.exe>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const hub = join(here, "..");
const repo = join(hub, "..", "..");
const BASE = process.env.HELP_SHOTS_BASE || "https://hub-staging.propertiguru.id";
if (/\/\/hub\.propertiguru\.id/.test(BASE)) {
  console.error("Refusing: Help screenshots are taken on staging (demo data), never production.");
  process.exit(1);
}

const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : await import("playwright");

const env = Object.fromEntries(
  readFileSync(join(repo, "packages", "db", ".env.staging"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const ACCOUNTS = {
  admin: ["TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD"],
  agent: ["PILOT_ID_A_EMAIL", "PILOT_ID_A_PASSWORD"],
};

/**
 * One entry per screenshot. `target` is a Playwright selector (every match is
 * boxed together), `{ nav: href }` for a side-menu link, or omitted for no
 * highlight. `open` clicks the first match before capturing (to reach a page
 * whose id differs between environments).
 */
const nav = (href) => ({ nav: href });
/** Real staff appear on the staging access list; blur the person column. */
const USERS_BLUR = ["main section:first-of-type tbody td:first-child", "main select option"];
const SHOTS = [
  // ── admin ─────────────────────────────────────────────
  { id: "a-overview-queue", as: "admin", path: "/admin", target: "[data-action-queue]" },
  { id: "a-nav-agents", as: "admin", path: "/admin/agents", target: nav("/admin/agents") },
  { id: "a-agents-window", as: "admin", path: "/admin/agents?status=new&h=24&q=DEMO", target: 'main a[href*="status=new&h="]' },
  { id: "a-agent-open", as: "admin", path: "/admin/agents?status=all&q=DEMO", target: 'main tbody a[href^="/admin/agents/"] >> nth=0' },
  { id: "a-agent-detail", as: "admin", path: "/admin/agents?status=all&q=DEMO", open: 'main tbody a[href^="/admin/agents/"]' },
  { id: "a-agent-suspend", as: "admin", path: "/admin/agents?status=all&q=DEMO", open: 'main tbody a[href^="/admin/agents/"]', target: 'main form:has(textarea) >> nth=1' },
  { id: "a-agent-decision", as: "admin", path: "/admin/agents?status=all&q=DEMO", open: 'main tbody a[href^="/admin/agents/"]', target: 'main form:has(textarea) >> nth=0' },
  { id: "a-agent-ban", as: "admin", path: "/admin/agents?status=all&q=DEMO", open: 'main tbody a[href^="/admin/agents/"]', target: "main details >> nth=-1" },
  { id: "a-nav-onboard", as: "admin", path: "/admin/agents/onboard", target: nav("/admin/agents/onboard") },
  { id: "a-onboard-details", as: "admin", path: "/admin/agents/onboard", target: 'main form input[name="fullName"], main form input[name="email"], main form input[name="whatsapp"], main form select[name="country"], main form input[name="sourcePlatform"]' },
  { id: "a-onboard-consent", as: "admin", path: "/admin/agents/onboard", target: "main form fieldset" },
  { id: "a-onboard-submit", as: "admin", path: "/admin/agents/onboard", target: 'main form select[name="language"], main form button[type="submit"], main form input[name="confirmed"]' },
  { id: "a-onboard-list", as: "admin", path: "/admin/agents/onboard", target: "main section >> nth=-1" },
  { id: "a-imports-forms", as: "admin", path: "/admin/imports", target: "main section >> nth=1" },
  { id: "a-batch-items", as: "admin", path: "/admin/imports", open: 'main a[href^="/admin/imports/"]', target: "[data-item] >> nth=0" },
  { id: "a-batch-publish", as: "admin", path: "/admin/imports", open: 'main a[href^="/admin/imports/"]', target: "[data-on-behalf], [data-committed], [data-in-control]" },
  { id: "a-invite-form", as: "admin", path: "/admin/agents/invitations", target: "main section >> nth=0" },
  { id: "a-invite-actions", as: "admin", path: "/admin/agents/invitations", target: ["main section >> nth=1 >> form >> nth=0", "main section >> nth=1 >> form >> nth=1"] },
  { id: "a-mod-tabs", as: "admin", path: "/admin/listings", target: 'main a[href^="/admin/listings?status="]' },
  { id: "a-mod-decide", as: "admin", path: "/admin/listings", target: 'main form:not(#bulk):has(button[value="approve"]) >> nth=0' },
  { id: "a-mod-reports", as: "admin", path: "/admin/listings", target: "[data-reports-link]" },
  { id: "a-nav-handover", as: "admin", path: "/admin/handover", target: nav("/admin/handover") },
  { id: "a-review-tab", as: "admin", path: "/admin/agents?status=under_review&h=168", target: 'main a[href^="/admin/agents?status=under_review"]' },
  { id: "a-orgs", as: "admin", path: "/admin/organisations", target: "main h1" },
  { id: "a-nav-hero", as: "admin", path: "/admin/hero", target: nav("/admin/hero") },
  { id: "a-users-current", as: "admin", path: "/admin/users", target: "main section >> nth=0", blur: USERS_BLUR },
  { id: "a-users-register", as: "admin", path: "/admin/users", target: "main section >> nth=1", blur: USERS_BLUR },
  { id: "a-users-grant", as: "admin", path: "/admin/users", target: "main section >> nth=2", blur: USERS_BLUR },
  { id: "a-nav-countries", as: "admin", path: "/admin/countries", target: nav("/admin/countries") },
  { id: "a-nav-flags", as: "admin", path: "/admin/flags", target: nav("/admin/flags") },
  { id: "a-nav-audit", as: "admin", path: "/admin/audit", target: nav("/admin/audit") },
  // ── agent ─────────────────────────────────────────────
  { id: "g-register-who", as: null, path: "/register", target: ["main form >> label >> nth=0", "main form select"] },
  { id: "g-register-login", as: null, path: "/register", target: 'main form input[type="email"], main form input[type="password"]' },
  { id: "g-login", as: null, path: "/login", target: "main form" },
  { id: "g-login-resend", as: null, path: "/login", target: 'a[href="/verify-email"]' },
  { id: "g-login-forgot", as: null, path: "/login", target: 'a[href="/forgot-password"]' },
  { id: "g-nav-profile", as: "agent", path: "/profile", target: nav("/profile") },
  { id: "g-profile-photo", as: "agent", path: "/profile", target: "main form >> nth=0 >> button >> nth=0" },
  { id: "g-profile-save", as: "agent", path: "/profile", target: "main form >> nth=0 >> button >> nth=-1" },
  { id: "g-profile-company", as: "agent", path: "/profile", target: "[data-company]" },
  { id: "g-profile-certificate", as: "agent", path: "/profile", target: "[data-certificate]" },
  { id: "g-verification", as: "agent", path: "/verification", target: "main" },
  { id: "g-listings-new", as: "agent", path: "/listings", target: 'main a[href="/listings/new"]' },
  { id: "g-listings-actions", as: "agent", path: "/listings", target: ['main a[href$="/edit"] >> nth=0', "[data-withdraw] >> nth=0"] },
  { id: "g-listings-wizard", as: "agent", path: "/listings/new", target: [0, 1, 2, 3, 4, 5, 6].map((i) => `main button >> nth=${i}`) },
  { id: "g-nav-import", as: "agent", path: "/listings/import", target: nav("/listings/import") },
  { id: "g-import-portal", as: "agent", path: "/listings/import", target: "main section >> nth=0" },
  { id: "g-nav-notifications", as: "agent", path: "/notifications", target: nav("/notifications") },
  { id: "g-requests-new", as: "agent", path: "/requests", target: 'main a[href="/requests/new"]' },
  { id: "g-requests-list", as: "agent", path: "/requests", target: 'main a[href^="/requests/"][href*="-"] >> nth=0' },
  { id: "g-nav-wanted", as: "agent", path: "/dashboard", target: nav("/wanted") },
  { id: "g-nav-pool", as: "agent", path: "/collab/pool", target: nav("/collab/pool") },
  { id: "g-leads", as: "agent", path: "/leads", target: 'main form:has(button) >> nth=0' },
  { id: "g-nav-tasks", as: "agent", path: "/tasks", target: nav("/tasks") },
  { id: "g-nav-card", as: "agent", path: "/card", target: nav("/card") },
];

const VIEW = { width: 1280, height: 800 };
const LANGS = ["en", "id"];
const exe = process.env.CHROME_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

async function session(as, lang) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await ctx.addCookies([{ name: "locale", value: lang, url: BASE }]);
  const page = await ctx.newPage();
  if (as) {
    const [e, p] = ACCOUNTS[as];
    if (!env[e] || !env[p]) throw new Error(`${e}/${p} missing from packages/db/.env.staging`);
    await page.goto(BASE + "/login");
    await page.fill('input[name="email"]', env[e]);
    await page.fill('input[name="password"]', env[p]);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }),
      page.press('input[name="password"]', "Enter"),
    ]);
  }
  return { ctx, page };
}

/** Replace emails and long digit runs in visible text; demo data, but belt and braces. */
async function mask(page, blur) {
  await page.evaluate((blur) => {
    // People who are not demo records (real staff on the staging access list) are blurred.
    for (const sel of blur ?? []) for (const el of document.querySelectorAll(sel)) el.style.filter = "blur(9px)";
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
    const digits = /(?<![\w-])(\+?6[02]|0)[\s-]?\d[\d\s-]{6,}\d/g;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const v = n.nodeValue;
      if (v && (email.test(v) || digits.test(v))) n.nodeValue = v.replace(email, "agent@example.com").replace(digits, "+62 8xx-xxxx-xxxx");
    }
    for (const i of document.querySelectorAll("input")) {
      if (i.type === "email" || i.type === "tel" || i.type === "password") i.value = "";
    }
    document.documentElement.style.scrollBehavior = "auto";
  }, blur);
}

async function targetRects(page, target) {
  if (!target) return [];
  if (target.nav) {
    return page.evaluate((href) => {
      const a = [...document.querySelectorAll(`a[href="${href}"]`)].find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.x < 250; });
      if (!a) return [];
      a.scrollIntoView({ block: "center" });
      const r = a.getBoundingClientRect();
      return [{ x: r.x, y: r.y, w: r.width, h: r.height }];
    }, target.nav);
  }
  if (Array.isArray(target)) {
    const all = [];
    for (const t of target) all.push(...(await targetRects(page, t)));
    return all;
  }
  const loc = page.locator(target);
  const n = await loc.count();
  if (!n) return [];
  await loc.first().scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  const first = await loc.first().boundingBox();
  if (first && first.y > VIEW.height * 0.55) {
    await page.mouse.wheel(0, first.y - VIEW.height * 0.3);
    await page.waitForTimeout(150);
  }
  const rects = [];
  for (let i = 0; i < n; i++) {
    const b = await loc.nth(i).boundingBox();
    if (b && b.width > 0 && b.height > 0) rects.push({ x: b.x, y: b.y, w: b.width, h: b.height });
  }
  return rects;
}

function unionPct(rects) {
  if (!rects.length) return null;
  const pad = 6;
  let x1 = Math.min(...rects.map((r) => r.x)) - pad, y1 = Math.min(...rects.map((r) => r.y)) - pad;
  let x2 = Math.max(...rects.map((r) => r.x + r.w)) + pad, y2 = Math.max(...rects.map((r) => r.y + r.h)) + pad;
  x1 = Math.max(0, x1); y1 = Math.max(0, y1); x2 = Math.min(VIEW.width, x2); y2 = Math.min(VIEW.height, y2);
  if (x2 <= x1 || y2 <= y1) return null;
  const p = (v, of) => Math.round((v / of) * 1000) / 10;
  return { x: p(x1, VIEW.width), y: p(y1, VIEW.height), w: p(x2 - x1, VIEW.width), h: p(y2 - y1, VIEW.height) };
}

// ── probe mode ──
const args = process.argv.slice(2);
if (args[0] === "--probe") {
  const { page } = await session(args[2] || "admin", "en");
  await page.goto(BASE + args[1], { waitUntil: "networkidle" });
  const file = join(hub, ".help-probe.png");
  await page.screenshot({ path: file, fullPage: true });
  console.log("probe saved", file, page.url());
  await browser.close();
  process.exit(0);
}

const only = args[0];
const manifestFile = join(hub, "src", "lib", "help", "shots.json");
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : {};
const todo = SHOTS.filter((s) => !only || s.id.startsWith(only));
const sessions = {};
let failed = 0;

for (const lang of LANGS) {
  const out = join(hub, "public", "help", "shots", lang);
  mkdirSync(out, { recursive: true });
  for (const shot of todo) {
    const key = `${shot.as ?? "anon"}:${lang}`;
    sessions[key] ??= await session(shot.as, lang);
    const { page } = sessions[key];
    try {
      await page.goto(BASE + shot.path, { waitUntil: "networkidle", timeout: 60000 });
      if (shot.open) {
        const before = page.url();
        await page.locator(shot.open).first().click();
        await page.waitForURL((u) => u.href !== before, { timeout: 30000 });
        await page.waitForLoadState("networkidle");
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await mask(page, shot.blur);
      const rects = await targetRects(page, shot.target);
      const box = unionPct(rects);
      const png = await page.screenshot({ type: "png" });
      await sharp(png).webp({ quality: 72 }).toFile(join(out, `${shot.id}.webp`));
      manifest[shot.id] ??= {};
      manifest[shot.id][lang] = { box, w: VIEW.width, h: VIEW.height };
      console.log(`${lang} ${shot.id}${shot.target && !box ? "  (target not found — no highlight)" : ""}`);
    } catch (err) {
      failed++;
      console.error(`${lang} ${shot.id} FAILED: ${err.message.split("\n")[0]}`);
    }
  }
}

const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
writeFileSync(manifestFile, JSON.stringify(sorted, null, 2) + "\n");
await browser.close();
console.log(`${todo.length * LANGS.length - failed} captured, ${failed} failed → ${manifestFile}`);
process.exit(failed ? 1 : 0);
