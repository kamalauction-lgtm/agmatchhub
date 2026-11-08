"use client";

import { useState } from "react";
import { offerToPool, withdrawOffer } from "@/app/(agent)/listings/offer-actions";

/**
 * "Let other agents market this" — the listing agent's side of co-marketing.
 *
 * Collapsed by default. The terms are a real commercial commitment, so opening
 * the form is a deliberate act, not something an agent trips over next to the
 * boost button.
 *
 * The split is shown as money, live, while they type. "50% of 2%" is an
 * abstraction; "you keep Rp 32.000.000, they get Rp 32.000.000" is the decision
 * they are actually making.
 */

export type OfferLabels = {
  cta: string;
  heading: string;
  help: string;
  totalCommission: string;
  totalCommissionHelp: string;
  marketingShare: string;
  marketingShareHelp: string;
  payer: string;
  payerOwner: string;
  payerBuyer: string;
  payerDeveloper: string;
  maxAgents: string;
  maxAgentsHelp: string;
  requiresApproval: string;
  requiresApprovalHelp: string;
  minPrice: string;
  minPriceHelp: string;
  notes: string;
  notesPlaceholder: string;
  submit: string;
  cancel: string;
  preview: string;
  youKeep: string;
  theyGet: string;
  live: string;
  liveHelp: string;
  withdraw: string;
};

export function OfferToPool({
  listingId,
  price,
  currency,
  labels,
  activeOffer,
}: {
  listingId: string;
  price: number;
  currency: string;
  labels: OfferLabels;
  activeOffer: { id: string; marketing_agent_share_pct: number; engagements: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(2);
  const [share, setShare] = useState(50);

  if (activeOffer) {
    return (
      <div className="mt-4 rounded-lg border border-success/40 bg-success/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-success">{labels.live}</p>
            <p className="mt-0.5 text-xs text-muted">
              {labels.liveHelp
                .replace("{share}", String(Number(activeOffer.marketing_agent_share_pct)))
                .replace("{count}", String(activeOffer.engagements))}
            </p>
          </div>
          <form action={withdrawOffer}>
            <input type="hidden" name="offerId" value={activeOffer.id} />
            <button
              type="submit"
              className="rounded-lg border border-line bg-background px-3 py-2 text-xs font-semibold hover:border-danger hover:text-danger"
            >
              {labels.withdraw}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:border-crimson hover:text-crimson"
      >
        🤝 {labels.cta}
      </button>
    );
  }

  const commission = (price * total) / 100;
  const theirs = (commission * share) / 100;
  const mine = commission - theirs;
  const fmt = (n: number) => `${currency} ${Math.round(n).toLocaleString("id-ID")}`;

  return (
    <form action={offerToPool} className="mt-4 rounded-lg border border-crimson/40 p-4">
      <input type="hidden" name="listingId" value={listingId} />

      <p className="text-sm font-semibold">{labels.heading}</p>
      <p className="mt-1 text-xs text-muted">{labels.help}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-medium">
          {labels.totalCommission}
          <input
            name="totalCommission"
            type="number"
            step="0.25"
            min={0}
            max={100}
            value={total}
            onChange={(e) => setTotal(Number(e.target.value) || 0)}
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson"
          />
          <span className="mt-1 block font-normal text-muted">{labels.totalCommissionHelp}</span>
        </label>

        <label className="text-xs font-medium">
          {labels.marketingShare}
          <input
            name="marketingShare"
            type="number"
            step="1"
            min={1}
            max={99}
            value={share}
            onChange={(e) => setShare(Number(e.target.value) || 0)}
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson"
          />
          <span className="mt-1 block font-normal text-muted">{labels.marketingShareHelp}</span>
        </label>
      </div>

      {/* The split as money, not as percentages of percentages. */}
      <div className="mt-4 rounded-lg bg-surface p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {labels.preview}
        </p>
        <div className="mt-2 flex flex-wrap justify-between gap-3 text-sm">
          <span>
            {labels.youKeep} <strong className="text-success">{fmt(mine)}</strong>
          </span>
          <span>
            {labels.theyGet} <strong className="text-crimson">{fmt(theirs)}</strong>
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-medium">
          {labels.payer}
          <select
            name="payer"
            defaultValue="owner"
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson"
          >
            <option value="owner">{labels.payerOwner}</option>
            <option value="buyer">{labels.payerBuyer}</option>
            <option value="developer">{labels.payerDeveloper}</option>
          </select>
        </label>

        <label className="text-xs font-medium">
          {labels.maxAgents}
          <input
            name="maxAgents"
            type="number"
            min={1}
            max={500}
            placeholder="—"
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson"
          />
          <span className="mt-1 block font-normal text-muted">{labels.maxAgentsHelp}</span>
        </label>

        <label className="text-xs font-medium">
          {labels.minPrice}
          <input
            name="minPrice"
            type="number"
            min={0}
            placeholder="—"
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson"
          />
          <span className="mt-1 block font-normal text-muted">{labels.minPriceHelp}</span>
        </label>

        <label className="flex items-start gap-2 text-xs font-medium">
          <input
            name="requiresApproval"
            type="checkbox"
            value="true"
            className="mt-0.5 h-4 w-4 accent-crimson"
          />
          <span>
            {labels.requiresApproval}
            <span className="mt-0.5 block font-normal text-muted">
              {labels.requiresApprovalHelp}
            </span>
          </span>
        </label>
      </div>

      <label className="mt-4 block text-xs font-medium">
        {labels.notes}
        <textarea
          name="notes"
          rows={2}
          maxLength={600}
          placeholder={labels.notesPlaceholder}
          className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson"
        />
      </label>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
        >
          {labels.submit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-crimson hover:text-crimson"
        >
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
