import { describe, it, expect } from "vitest";
import { emailBrandFrom, renderEmailHtml } from "../../../../apps/hub/src/lib/email-template";

/**
 * D10 (P1-b): the email layout carries no brand in code. Every name, tagline
 * and colour comes from brand_settings; without settings it is plain.
 */

describe("email layout", () => {
  it("uses the brand settings it is given, escaped", () => {
    const brand = emailBrandFrom({ app_name: "Example <Homes>", app_short_name: "Homes", tagline: "Find a place", colors: { charcoal: "#111111", crimson: "#aa0000" } });
    const html = renderEmailHtml(brand, { heading: "A request", body: "Fix the price & size", ctaUrl: "/listings/1" }, "https://hub.example.test");
    expect(html).toContain("Example &lt;Homes&gt;");
    expect(html).toContain("Find a place");
    expect(html).toContain("background:#aa0000");
    expect(html).toContain("Open Homes");
    expect(html).toContain("Fix the price &amp; size");
    expect(html).toContain('href="https://hub.example.test/listings/1"');
  });

  it("without settings it is plain, with no brand name and no old brand", () => {
    const html = renderEmailHtml(emailBrandFrom(null), { heading: "Hello" }, "https://hub.example.test");
    expect(html).not.toMatch(/IQI|MatchHub|PropertiGuru/i);
    expect(html).toContain("Hello");
    expect(html).toContain("hub.example.test");
  });

  it("ignores colours that are not hex values", () => {
    const html = renderEmailHtml(emailBrandFrom({ app_name: "X", colors: { crimson: "red;background:url(x)" } }), { heading: "h", ctaUrl: "/" }, "https://h.test");
    expect(html).not.toContain("url(x)");
  });

  it("the source of the layout and the sender contains no brand literal", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["email-template.ts", "email.ts", "notification-titles.ts"]) {
      const src = readFileSync(new URL(`../../../../apps/hub/src/lib/${f}`, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/IQI|MatchHub/);
    }
  });
});
