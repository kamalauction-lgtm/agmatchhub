"use client";

import { useState } from "react";
import type { SecretaryDraft } from "@/lib/ai/secretary";
import { CompanionBadge, type Companion } from "@/components/ai/companion";

/**
 * The Secretary on one lead: draft → edit → send.
 *
 * WhatsApp has two doors. wa.me opens the agent's own WhatsApp with the text
 * (they press send on their phone) and is always there. The PLATFORM number
 * (E12, Meta Cloud API) appears only when the server says this lead may be
 * messaged that way right now: inside the 24-hour window as plain text, or
 * outside it with an approved template. The server decides; this panel only
 * shows the door it was handed.
 *
 * E-mail posts the edited subject and body to the server action, which sends
 * through the platform and stamps the first response.
 */

export type ReplyLabels = {
  draftWhatsapp: string;
  draftEmail: string;
  working: string;
  sourceAi: string;        // [model]
  sourceRules: string;
  reasons: Record<string, string>;
  nextStep: string;
  questions: string;
  openWhatsapp: string;
  sendEmail: string;
  subject: string;
  noEmail: string;
  copy: string;
  copied: string;
  quota: string;           // [remaining] [total] — empty hides
  platform: {
    send: string;          // Send from the platform number
    testMode: string;
    windowClosed: string;  // outside the 24 h window
    useTemplate: string;
    sendTemplate: string;
    variable: string;      // Value {n}
    reasons: Record<string, string>;
  };
};

export type PlatformWhatsapp = {
  /** 'ok' = session text may go now; otherwise the reason (window_closed, opted_out, …). */
  session: string;
  mode: "test" | "live";
  templates: { id: string; name: string; language: string; body: string; variables: number }[];
};

export function ReplyPanel({
  leadId,
  phone,
  email,
  defaultSubject,
  draftAction,
  sendEmailAction,
  sendWhatsappAction,
  sendTemplateAction,
  platform,
  companions,
  quota,
  labels,
}: {
  leadId: string;
  phone: string | null;
  email: string | null;
  defaultSubject: string;
  draftAction: (leadId: string, channel: "whatsapp" | "email") => Promise<SecretaryDraft>;
  sendEmailAction: (fd: FormData) => void;
  sendWhatsappAction?: (fd: FormData) => void;
  sendTemplateAction?: (fd: FormData) => void;
  /** null = the platform number is not available to this agent (flag off / no account). */
  platform?: PlatformWhatsapp | null;
  /** The colleagues at the agent's side here: Mira drafts WhatsApp, Orion writes e-mail. */
  companions?: { whatsapp?: Companion; email?: Companion };
  quota: { remaining: number; total: number } | null;
  labels: ReplyLabels;
}) {
  const [channel, setChannel] = useState<"whatsapp" | "email" | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<SecretaryDraft | null>(null);
  const [text, setText] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [copied, setCopied] = useState(false);
  const [templateId, setTemplateId] = useState("");

  async function ask(ch: "whatsapp" | "email") {
    setBusy(true);
    setChannel(ch);
    try {
      const d = await draftAction(leadId, ch);
      setDraft(d);
      setText(d.reply);
    } catch {
      setDraft({ reply: "", nextStep: "", questions: [], source: "rules", reason: "failed" });
    } finally {
      setBusy(false);
    }
  }

  const btn = "rounded-lg px-3 py-2 text-xs font-semibold";
  const waHref = phone ? `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(text)}` : null;
  const tpl = platform?.templates.find((t) => t.id === templateId) ?? null;
  const platformBlocked = platform && platform.session !== "ok" && platform.session !== "window_closed";

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <CompanionBadge c={channel === "email" ? companions?.email ?? companions?.whatsapp : companions?.whatsapp} />
        <button type="button" disabled={busy || !phone} onClick={() => ask("whatsapp")} className={`${btn} border border-line bg-card hover:border-crimson hover:text-crimson disabled:opacity-50`}>
          {busy && channel === "whatsapp" ? labels.working : labels.draftWhatsapp}
        </button>
        <button type="button" disabled={busy || !email} onClick={() => ask("email")} title={!email ? labels.noEmail : undefined} className={`${btn} border border-line bg-card hover:border-crimson hover:text-crimson disabled:opacity-50`}>
          {busy && channel === "email" ? labels.working : labels.draftEmail}
        </button>
        {quota && labels.quota && (
          <span className="ml-auto text-[11px] tabular-nums text-muted">
            {labels.quota.replace("[remaining]", String(quota.remaining)).replace("[total]", String(quota.total))}
          </span>
        )}
      </div>

      {draft && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-muted">
            <span className={`mr-2 rounded-full px-2 py-0.5 font-semibold ${draft.source === "ai" ? "bg-indigo-soft text-indigo" : "bg-card text-muted"}`}>
              {draft.source === "ai" ? "✦ AI" : "✍︎"}
            </span>
            {draft.source === "ai" ? labels.sourceAi.replace("[model]", draft.model ?? "AI") : (labels.reasons[draft.reason ?? "failed"] ?? labels.sourceRules)}
          </p>

          {channel === "email" && (
            <input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label={labels.subject} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm" />
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={channel === "email" ? 9 : 6} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm leading-6" />

          {(draft.nextStep || draft.questions.length > 0) && (
            <div className="grid gap-2 text-xs text-muted sm:grid-cols-2">
              {draft.nextStep && <p><span className="font-semibold">{labels.nextStep}:</span> {draft.nextStep}</p>}
              {draft.questions.length > 0 && (
                <p><span className="font-semibold">{labels.questions}:</span> {draft.questions.join(" · ")}</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {channel === "whatsapp" && platform?.session === "ok" && sendWhatsappAction && (
              <form action={sendWhatsappAction}>
                <input type="hidden" name="leadId" value={leadId} />
                <input type="hidden" name="body" value={text} />
                <button type="submit" disabled={!text.trim()} className={`${btn} bg-crimson text-white hover:bg-crimson-strong disabled:opacity-50`}>
                  {labels.platform.send}{platform.mode === "test" ? ` · ${labels.platform.testMode}` : ""}
                </button>
              </form>
            )}
            {channel === "whatsapp" && waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className={`${btn} bg-success text-white hover:opacity-90`}>
                {labels.openWhatsapp}
              </a>
            )}
            {channel === "email" && email && (
              <form action={sendEmailAction}>
                <input type="hidden" name="leadId" value={leadId} />
                <input type="hidden" name="subject" value={subject} />
                <input type="hidden" name="body" value={text} />
                <button type="submit" disabled={!text.trim() || !subject.trim()} className={`${btn} bg-crimson text-white hover:bg-crimson-strong disabled:opacity-50`}>
                  {labels.sendEmail}
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={async () => {
                try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* selectable */ }
              }}
              className={`${btn} border border-line bg-card hover:bg-surface`}
            >
              {copied ? labels.copied : labels.copy}
            </button>
          </div>

          {/* Platform number, outside the window: an approved template or nothing. */}
          {channel === "whatsapp" && platform && platform.session === "window_closed" && (
            <div className="rounded-lg border border-dashed border-line bg-card p-3 text-xs">
              <p className="text-muted">{labels.platform.windowClosed}</p>
              {platform.templates.length > 0 && sendTemplateAction && (
                <form action={sendTemplateAction} className="mt-2 space-y-2">
                  <input type="hidden" name="leadId" value={leadId} />
                  <select name="templateId" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-xs" aria-label={labels.platform.useTemplate}>
                    <option value="">{labels.platform.useTemplate}</option>
                    {platform.templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.language}</option>)}
                  </select>
                  {tpl && (
                    <>
                      <p className="rounded-lg bg-surface px-2 py-1.5 leading-5">{tpl.body}</p>
                      {Array.from({ length: tpl.variables }, (_, i) => (
                        <input key={i} name={`v${i + 1}`} required maxLength={200} placeholder={labels.platform.variable.replace("{n}", String(i + 1))} className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-xs" />
                      ))}
                      <button type="submit" className={`${btn} bg-crimson text-white hover:bg-crimson-strong`}>
                        {labels.platform.sendTemplate}{platform.mode === "test" ? ` · ${labels.platform.testMode}` : ""}
                      </button>
                    </>
                  )}
                </form>
              )}
            </div>
          )}
          {channel === "whatsapp" && platformBlocked && (
            <p className="text-[11px] text-muted">{labels.platform.reasons[platform!.session] ?? platform!.session}</p>
          )}
        </div>
      )}
    </div>
  );
}
