"use client";

import { useState } from "react";
import type { RequirementResult } from "@/lib/ai/requirement";
import { AiStatus, type AiStatusLabels } from "@/components/ai/ai-status";
import { CompanionBadge, type Companion } from "@/components/ai/companion";

/**
 * Buyer Profile Builder on /requests/new: paste the chat, the fields below
 * fill in, the agent checks every one and presses Save as usual. Writes to
 * the form on this page only; nothing is saved by this component.
 */
const FIELD: Record<string, string> = {
  title: "title", transaction_type: "transactionType", property_category: "propertyCategory", property_type: "propertyType", city: "city", state_region: "stateRegion",
  budget_min: "budgetMin", budget_max: "budgetMax", max_monthly_rent: "maxMonthlyRent", bedrooms_min: "bedroomsMin", bathrooms_min: "bathroomsMin", car_parks_min: "carParksMin",
  min_built_up: "minBuiltUp", furnishing: "furnishing", expected_move_in: "expectedMoveIn", other_requirements: "otherRequirements", client_profile: "clientProfileAnonymised",
};

export function ChatToRequirement({ action, companion, labels }: {
  action: (input: { chat: string }) => Promise<RequirementResult>;
  companion?: Companion;
  labels: AiStatusLabels & { title: string; hint: string; placeholder: string; run: string; working: string; filled: string; missing: string; privacy: string };
}) {
  const [chat, setChat] = useState("");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<RequirementResult | null>(null);
  const [filled, setFilled] = useState(0);
  const [err, setErr] = useState(false);

  function setField(name: string, value: unknown): boolean {
    // The requirement form is the one that carries the transaction field; the shell has forms of its own.
    const form = [...document.querySelectorAll<HTMLFormElement>("form")].find((f) => f.elements.namedItem("transactionType"));
    const el = form?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (!el || value == null || value === "") return false;
    const v = Array.isArray(value) ? value.join(", ") : String(value);
    if (el instanceof HTMLSelectElement && ![...el.options].some((o) => o.value === v)) return false;
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function run() {
    setBusy(true); setErr(false);
    try {
      const res = await action({ chat });
      setR(res);
      let n = 0;
      for (const [k, name] of Object.entries(FIELD)) if (setField(name, (res as unknown as Record<string, unknown>)[k])) n++;
      if (res.preferred_areas.length && setField("preferredAreas", res.preferred_areas)) n++;
      setFilled(n);
    } catch { setErr(true); } finally { setBusy(false); }
  }

  return (
    <section className="mb-6 rounded-xl border border-line bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <CompanionBadge c={companion} size="md" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{labels.title}</h2>
          <p className="text-xs text-muted">{labels.hint}</p>
          <textarea value={chat} onChange={(e) => setChat(e.target.value)} rows={5} placeholder={labels.placeholder} maxLength={8000} className="mt-3 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm" />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={run} disabled={busy || chat.trim().length < 10} className="rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-50">{busy ? labels.working : `✦ ${labels.run}`}</button>
            {r && <span className="text-xs text-success">{labels.filled.replace("{count}", String(filled))}</span>}
            {err && <span className="text-xs text-danger">{labels.reasons.failed}</span>}
          </div>
          {r && <AiStatus source={r.source} reason={r.reason} model={r.model} labels={labels} className="mt-2" />}
          {r && r.missing.length > 0 && <p className="mt-1 text-xs text-muted">{labels.missing}: {r.missing.join(" · ")}</p>}
          <p className="mt-2 text-[11px] text-muted">{labels.privacy}</p>
        </div>
      </div>
    </section>
  );
}
