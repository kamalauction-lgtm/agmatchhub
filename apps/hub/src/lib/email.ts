import "server-only";

/**
 * Transactional email via Resend's REST API (plain fetch — Workers-safe).
 * No-op until RESEND_API_KEY is configured. Never throws: notification
 * delivery must not break the action that triggered it.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  heading: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.EMAIL_FROM ?? "MatchHub <onboarding@resend.dev>";
  const base = process.env.APP_BASE_URL ?? "";

  const html = `<!doctype html>
<body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:#1F1F1F;padding:18px 24px">
          <span style="color:#ffffff;font-size:16px;font-weight:bold">IQI <span style="color:#d4a941">AG</span> Match<span style="color:#d94356">Hub</span></span>
        </td></tr>
        <tr><td style="padding:28px 24px 8px">
          <h1 style="margin:0 0 12px;font-size:18px;color:#1F1F1F">${escapeHtml(opts.heading)}</h1>
          ${opts.body ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b5563">${escapeHtml(opts.body)}</p>` : ""}
          ${opts.ctaUrl ? `<a href="${base}${opts.ctaUrl}" style="display:inline-block;margin:8px 0 16px;background:#B11226;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 22px;border-radius:8px">${escapeHtml(opts.ctaLabel ?? "Open MatchHub")}</a>` : ""}
        </td></tr>
        <tr><td style="padding:12px 24px 24px;border-top:1px solid #e5e7eb">
          <p style="margin:8px 0 0;font-size:11px;color:#9ca3af">IQI AG MatchHub — One Requirement. Multiple Opportunities. Controlled Collaboration.<br>
          This is an automated notification from ${base.replace("https://", "")}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html }),
    });
    if (!res.ok) {
      console.error("[email] resend failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send error:", e instanceof Error ? e.message : e);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
