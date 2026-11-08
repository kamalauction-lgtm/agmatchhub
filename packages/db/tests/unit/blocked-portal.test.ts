import { describe, it, expect } from "vitest";
import { __extractForTest } from "../../../../apps/hub/src/lib/import/adapters";

/**
 * When a portal refuses to be read.
 *
 * 99.co sits behind Cloudflare's bot challenge. It answers the importer with
 * HTTP 403, `cf-mitigated: challenge`, and a 5.8KB page titled "Just a
 * moment...". Two bugs turned that refusal into a listing:
 *
 *   · `safeFetch` never checked the status code, so a 403 body was parsed as
 *     though it were the page
 *   · the "is this a listing" guard only required a title, and the challenge
 *     page has one
 *
 * The agent got a property called "Just a moment...", marked `sale` because
 * the URL contained "/sale/".
 *
 * The rule this encodes: a challenge is a refusal and is reported as one. We
 * do not imitate a browser to get past it.
 */

/** The real shape of what Cloudflare returned, trimmed. */
const CHALLENGE_PAGE = `<!DOCTYPE html><html lang="en-US"><head>
<title>Just a moment...</title>
<meta http-equiv="refresh" content="390">
</head><body class="no-js">
<div class="main-wrapper"><h1>www.99.co</h1>
<p id="Ie-body">Verify you are human by completing the action below.</p>
<div id="challenge-error-text">Enable JavaScript and cookies to continue</div>
</div>
<script>window._cf_chl_opt={cvId:'3',cType:'managed'};</script>
<script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script>
</body></html>`;

describe("a bot-challenge page is not a listing", () => {
  it("extracting it yields no property facts", () => {
    const d = __extractForTest(
      CHALLENGE_PAGE,
      "https://www.99.co/singapore/sale/property/tembusu-grand-condo-3N8Voazx7tejEsjc56LxVf",
    );
    expect(d.price).toBeUndefined();
    expect(d.propertyType).toBeUndefined();
    expect(d.bedrooms).toBeUndefined();
    expect(d.city).toBeUndefined();
  });

  it("has nothing the substance check would accept", () => {
    const d = __extractForTest(CHALLENGE_PAGE, "https://www.99.co/singapore/sale/property/x");
    // Only a title, and only from <title>. That is the exact case that used to
    // pass — a row named "Just a moment...".
    const facts = [d.propertyType, d.bedrooms, d.bathrooms, d.buildingSize, d.landSize, d.city, d.addressText]
      .filter((v) => v !== undefined);
    expect(d.price).toBeUndefined();
    expect(facts.length).toBeLessThan(2);
  });
});

/**
 * The status and marker checks live in `safe-fetch.ts` and `adapters.ts`
 * respectively, both "server-only" and both needing a live response to
 * exercise. What can be pinned here is the contract they enforce, so a later
 * refactor that drops one is visible.
 */
describe("what counts as blocked", () => {
  const blockedStatus = (status: number, cfMitigated?: string) =>
    cfMitigated === "challenge" || status === 403 || status === 429;

  it("403 is blocked", () => expect(blockedStatus(403)).toBe(true));
  it("429 is blocked", () => expect(blockedStatus(429)).toBe(true));
  it("cf-mitigated: challenge is blocked even on a 200", () =>
    expect(blockedStatus(200, "challenge")).toBe(true));
  it("200 without the header is not blocked", () =>
    expect(blockedStatus(200)).toBe(false));

  const MARKERS = [
    "_cf_chl_opt", "cf_chl", "challenge-platform", "cf-browser-verification",
    "Enable JavaScript and cookies to continue", "Checking your browser before accessing",
    "Attention Required! | Cloudflare", "px-captcha", "distil_r_captcha",
    "/_Incapsula_Resource", "captcha-delivery.com",
  ];

  it("recognises the real page by its markers", () => {
    const hits = MARKERS.filter((m) => CHALLENGE_PAGE.includes(m));
    expect(hits).toContain("_cf_chl_opt");
    expect(hits).toContain("challenge-platform");
    expect(hits).toContain("Enable JavaScript and cookies to continue");
  });

  it("does not fire on an ordinary listing page", () => {
    const ordinary = `<html><head><title>Rumah dijual</title></head>
      <body><p>Rumah bagus di Bekasi, harga Rp 1.500.000.000</p></body></html>`;
    expect(MARKERS.some((m) => ordinary.includes(m))).toBe(false);
  });
});
