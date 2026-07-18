import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CommissionPanel } from "@/components/collab/commission-panel";
import {
  sendMessage, submitOffer, respondOffer, requestViewing,
  respondViewing, requestContactRelease,
} from "@/app/(agent)/collab/actions";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";
const btnPri =
  "rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong";
const btnSec =
  "rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-crimson hover:text-crimson";

/**
 * Collaboration panels (§24–27): message thread, offers, viewings, contact
 * release. Rendered for both parties; `role` controls which actions show.
 */
export async function CollabPanels({
  submissionId,
  role,
  currency,
  offerType,
}: {
  submissionId: string;
  role: "ra" | "sa";
  currency: string;
  offerType: "purchase" | "rental";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const t = await getTranslations("collab");

  const [{ data: conv }, { data: offers }, { data: viewings }, { data: release }] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("id, messages(id, sender_id, body, flagged, created_at, profiles(display_name))")
        .eq("submission_id", submissionId)
        .maybeSingle(),
      supabase
        .from("offers")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false }),
      supabase
        .from("viewing_appointments")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_release_requests")
        .select("*")
        .eq("submission_id", submissionId)
        .maybeSingle(),
    ]);

  const messages = (conv?.messages ?? []).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // Contact info of the other party once release is approved (§25)
  let releasedContact: { name: string; email: string | null; mobile: string | null; whatsapp: string | null } | null = null;
  if (release?.status === "approved") {
    const { data: parties } = await supabase
      .from("property_submissions")
      .select("supply_agent_id, property_requests(requesting_agent_id)")
      .eq("id", submissionId)
      .single();
    const req = Array.isArray(parties?.property_requests)
      ? parties?.property_requests[0]
      : parties?.property_requests;
    const otherId =
      role === "ra" ? parties?.supply_agent_id : req?.requesting_agent_id;
    if (otherId) {
      const [{ data: priv }, { data: prof }] = await Promise.all([
        supabase.from("users_private").select("email, mobile_number, whatsapp_number").eq("user_id", otherId).maybeSingle(),
        supabase.from("profiles").select("display_name").eq("id", otherId).maybeSingle(),
      ]);
      if (priv || prof) {
        releasedContact = {
          name: prof?.display_name ?? "",
          email: priv?.email ?? null,
          mobile: priv?.mobile_number ?? null,
          whatsapp: priv?.whatsapp_number ?? null,
        };
      }
    }
  }

  const money = (n: unknown, cur = currency) =>
    n == null ? "—" : `${cur} ${Number(n).toLocaleString()}`;

  return (
    <div className="space-y-8">
      {/* --------------------------------------- commission (§72–78) ----- */}
      <CommissionPanel submissionId={submissionId} role={role} currency={currency} />

      {/* ------------------------------------------------ messages ------- */}
      <section className="rounded-xl border border-line p-6">
        <h2 className="mb-4 font-semibold">{t("messages.title")}</h2>
        <div className="mb-4 max-h-80 space-y-3 overflow-y-auto">
          {!messages.length && <p className="text-sm text-muted">{t("messages.empty")}</p>}
          {messages.map((m) => {
            const mine = m.sender_id === user.id;
            const sender = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                  mine ? "bg-crimson text-white" : "bg-surface"
                }`}>
                  {!mine && (
                    <p className="mb-0.5 text-xs font-semibold opacity-80">{sender?.display_name}</p>
                  )}
                  <p className="whitespace-pre-line">{m.body}</p>
                  {m.flagged && (
                    <p className={`mt-1 text-[10px] font-semibold ${mine ? "text-white/80" : "text-warning"}`}>
                      ⚠ {t("messages.flagged")}
                    </p>
                  )}
                  <p className={`mt-1 text-[10px] ${mine ? "text-white/60" : "text-muted"}`}>
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <form action={sendMessage} className="flex gap-2">
          <input type="hidden" name="submissionId" value={submissionId} />
          <input name="body" required maxLength={4000} placeholder={t("messages.placeholder")}
            className={inputCls} autoComplete="off" />
          <button type="submit" className={btnPri}>{t("messages.send")}</button>
        </form>
        <p className="mt-2 text-xs text-muted">{t("messages.policyHint")}</p>
      </section>

      {/* ------------------------------------------------ offers --------- */}
      <section className="rounded-xl border border-line p-6">
        <h2 className="mb-4 font-semibold">{t("offers.title")}</h2>
        <div className="mb-4 space-y-3">
          {!offers?.length && <p className="text-sm text-muted">{t("offers.empty")}</p>}
          {offers?.map((o) => (
            <div key={o.id} className="rounded-lg bg-surface p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted">{o.human_readable_id}</span>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold">
                  {t(`offers.status.${o.status}`)}
                </span>
              </div>
              <p className="mt-1 font-semibold">{money(o.amount, o.currency)}</p>
              {o.conditions && <p className="mt-1 text-xs text-muted">{o.conditions}</p>}
              {o.counter_amount != null && (
                <p className="mt-1 text-sm">
                  {t("offers.counterLabel")}: <span className="font-semibold">{money(o.counter_amount, o.currency)}</span>
                  {o.counter_terms && <span className="text-xs text-muted"> — {o.counter_terms}</span>}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {role === "sa" && o.status === "submitted" && (
                  <>
                    <OfferAction sid={submissionId} oid={o.id} action="accept" label={t("offers.accept")} primary />
                    <OfferAction sid={submissionId} oid={o.id} action="reject" label={t("offers.reject")} />
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold text-crimson">{t("offers.counter")}</summary>
                      <form action={respondOffer} className="mt-2 flex gap-2">
                        <input type="hidden" name="submissionId" value={submissionId} />
                        <input type="hidden" name="offerId" value={o.id} />
                        <input type="hidden" name="action" value="counter" />
                        <input type="number" name="counterAmount" min="1" step="1000" required
                          placeholder={t("offers.counterAmount")} className={inputCls} />
                        <input name="counterTerms" placeholder={t("offers.counterTerms")} className={inputCls} />
                        <button type="submit" className={btnSec}>{t("offers.sendCounter")}</button>
                      </form>
                    </details>
                  </>
                )}
                {role === "ra" && o.status === "submitted" && (
                  <OfferAction sid={submissionId} oid={o.id} action="withdraw" label={t("offers.withdraw")} />
                )}
                {role === "ra" && o.status === "countered" && (
                  <>
                    <OfferAction sid={submissionId} oid={o.id} action="accept_counter" label={t("offers.acceptCounter")} primary />
                    <OfferAction sid={submissionId} oid={o.id} action="reject_counter" label={t("offers.rejectCounter")} />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        {role === "ra" && (
          <details className="rounded-lg border border-line p-4">
            <summary className="cursor-pointer text-sm font-semibold">{t("offers.newOffer")}</summary>
            <form action={submitOffer} className="mt-3 space-y-3">
              <input type="hidden" name="submissionId" value={submissionId} />
              <input type="hidden" name="offerType" value={offerType} />
              <input type="hidden" name="currency" value={currency} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">{t("offers.amount", { currency })}</span>
                  <input type="number" name="amount" min="1" step="1000" required className={inputCls} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">{t("offers.validUntil")}</span>
                  <input type="date" name="validUntil" className={inputCls} />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{t("offers.conditions")}</span>
                <input name="conditions" maxLength={2000} className={inputCls} />
              </label>
              <p className="text-xs text-muted">{t("offers.notBinding")}</p>
              <button type="submit" className={btnPri}>{t("offers.submit")}</button>
            </form>
          </details>
        )}
      </section>

      {/* ------------------------------------------------ viewings ------- */}
      <section className="rounded-xl border border-line p-6">
        <h2 className="mb-4 font-semibold">{t("viewings.title")}</h2>
        <div className="mb-4 space-y-3">
          {!viewings?.length && <p className="text-sm text-muted">{t("viewings.empty")}</p>}
          {viewings?.map((v) => (
            <div key={v.id} className="rounded-lg bg-surface p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted">{v.human_readable_id}</span>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold">
                  {t(`viewings.status.${v.status}`)}
                </span>
              </div>
              <p className="mt-1 font-semibold">
                {v.proposed_date}{v.proposed_time ? ` · ${v.proposed_time}` : ""} · {t(`viewings.type.${v.viewing_type}`)}
              </p>
              {v.notes && <p className="mt-1 text-xs text-muted">{v.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {v.status === "requested" && v.proposed_by !== user.id && (
                  <>
                    <ViewingAction sid={submissionId} vid={v.id} status="confirmed" label={t("viewings.confirm")} primary />
                    <ViewingAction sid={submissionId} vid={v.id} status="reschedule_requested" label={t("viewings.reschedule")} />
                  </>
                )}
                {v.status === "confirmed" && (
                  <ViewingAction sid={submissionId} vid={v.id} status="completed" label={t("viewings.markCompleted")} />
                )}
                {!["completed", "cancelled"].includes(v.status) && (
                  <ViewingAction sid={submissionId} vid={v.id} status="cancelled" label={t("viewings.cancel")} />
                )}
              </div>
            </div>
          ))}
        </div>
        <details className="rounded-lg border border-line p-4">
          <summary className="cursor-pointer text-sm font-semibold">{t("viewings.propose")}</summary>
          <form action={requestViewing} className="mt-3 space-y-3">
            <input type="hidden" name="submissionId" value={submissionId} />
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{t("viewings.date")}</span>
                <input type="date" name="proposedDate" required className={inputCls} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{t("viewings.time")}</span>
                <input name="proposedTime" placeholder="10:30" className={inputCls} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{t("viewings.typeLabel")}</span>
                <select name="viewingType" className={inputCls}>
                  <option value="physical">{t("viewings.type.physical")}</option>
                  <option value="virtual">{t("viewings.type.virtual")}</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{t("viewings.notes")}</span>
              <input name="notes" maxLength={1000} className={inputCls} />
            </label>
            <button type="submit" className={btnPri}>{t("viewings.submit")}</button>
          </form>
        </details>
      </section>

      {/* ------------------------------------------------ contact release  */}
      <section className="rounded-xl border border-line p-6">
        <h2 className="mb-2 font-semibold">{t("release.title")}</h2>
        {release?.status === "approved" && releasedContact ? (
          <div className="rounded-lg bg-success/10 p-4 text-sm">
            <p className="mb-2 font-semibold text-success">{t("release.approved")}</p>
            <p className="font-medium">{releasedContact.name}</p>
            {releasedContact.mobile && <p>{t("release.mobile")}: {releasedContact.mobile}</p>}
            {releasedContact.whatsapp && <p>WhatsApp: {releasedContact.whatsapp}</p>}
            {releasedContact.email && <p>{t("release.email")}: {releasedContact.email}</p>}
          </div>
        ) : release ? (
          <div className="text-sm">
            <p className="mb-3 rounded-lg bg-warning/10 px-4 py-3">
              {(role === "ra" && release.accepted_by_ra) || (role === "sa" && release.accepted_by_sa)
                ? t("release.waitingOther")
                : t("release.otherRequested")}
            </p>
            {!((role === "ra" && release.accepted_by_ra) || (role === "sa" && release.accepted_by_sa)) && (
              <form action={requestContactRelease}>
                <input type="hidden" name="submissionId" value={submissionId} />
                <button type="submit" className={btnPri}>{t("release.accept")}</button>
              </form>
            )}
          </div>
        ) : (
          <div className="text-sm">
            <p className="mb-3 text-muted">{t("release.intro")}</p>
            <form action={requestContactRelease}>
              <input type="hidden" name="submissionId" value={submissionId} />
              <button type="submit" className={btnSec}>{t("release.request")}</button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}

function OfferAction({
  sid, oid, action, label, primary = false,
}: {
  sid: string; oid: string; action: string; label: string; primary?: boolean;
}) {
  return (
    <form action={respondOffer} className="inline">
      <input type="hidden" name="submissionId" value={sid} />
      <input type="hidden" name="offerId" value={oid} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="counterAmount" value="" />
      <input type="hidden" name="counterTerms" value="" />
      <button type="submit" className={primary ? btnPri : btnSec}>{label}</button>
    </form>
  );
}

function ViewingAction({
  sid, vid, status, label, primary = false,
}: {
  sid: string; vid: string; status: string; label: string; primary?: boolean;
}) {
  return (
    <form action={respondViewing} className="inline">
      <input type="hidden" name="submissionId" value={sid} />
      <input type="hidden" name="viewingId" value={vid} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={primary ? btnPri : btnSec}>{label}</button>
    </form>
  );
}
