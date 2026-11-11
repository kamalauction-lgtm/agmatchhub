/**
 * Transactional email layout (D10, P1-b). Pure: no imports, unit-tested.
 *
 * Every brand value — name, tagline, colours — comes from `brand_settings`
 * (hard rule 12: no hard-coded app name or colours; risk R1: no brand asset
 * may be baked into code). With no settings available the email is plain and
 * unbranded rather than carrying an old name.
 */

export type EmailBrand = {
  appName: string | null;
  appShortName: string | null;
  tagline: string | null;
  colors: { header?: string; accent?: string; text?: string };
};

export type EmailContent = {
  heading: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const colour = (v: string | undefined, fallback: string) => (v && HEX.test(v) ? v : fallback);

/** Brand settings row → the few values the layout needs. */
export function emailBrandFrom(row: { app_name?: string | null; app_short_name?: string | null; tagline?: string | null; colors?: Record<string, string> | null } | null | undefined): EmailBrand {
  const c = row?.colors ?? {};
  return {
    appName: row?.app_name?.trim() || null,
    appShortName: row?.app_short_name?.trim() || null,
    tagline: row?.tagline?.trim() || null,
    colors: { header: c.charcoal ?? c.header, accent: c.crimson ?? c.accent, text: c.charcoal ?? c.text },
  };
}

export function renderEmailHtml(brand: EmailBrand, content: EmailContent, baseUrl: string): string {
  const header = colour(brand.colors.header, "#1f2937");
  const accent = colour(brand.colors.accent, "#1f2937");
  const text = colour(brand.colors.text, "#111827");
  const name = brand.appName ? escapeHtml(brand.appName) : "";
  const host = escapeHtml(baseUrl.replace(/^https?:\/\//, ""));
  const cta = content.ctaUrl
    ? `<a href="${escapeHtml(baseUrl + content.ctaUrl)}" style="display:inline-block;margin:8px 0 16px;background:${accent};color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 22px;border-radius:8px">${escapeHtml(content.ctaLabel ?? (brand.appShortName ? `Open ${brand.appShortName}` : "Open"))}</a>`
    : "";
  return `<!doctype html>
<body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
        ${name ? `<tr><td style="background:${header};padding:18px 24px"><span style="color:#ffffff;font-size:16px;font-weight:bold">${name}</span></td></tr>` : ""}
        <tr><td style="padding:28px 24px 8px">
          <h1 style="margin:0 0 12px;font-size:18px;color:${text}">${escapeHtml(content.heading)}</h1>
          ${content.body ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b5563">${escapeHtml(content.body)}</p>` : ""}
          ${cta}
        </td></tr>
        <tr><td style="padding:12px 24px 24px;border-top:1px solid #e5e7eb">
          <p style="margin:8px 0 0;font-size:11px;color:#9ca3af">${[name, brand.tagline ? escapeHtml(brand.tagline) : ""].filter(Boolean).join(" — ")}${name || brand.tagline ? "<br>" : ""}
          This is an automated notification from ${host}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>`;
}
