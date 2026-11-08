"use client";

import { useState } from "react";
import { market } from "@/config/market";
import { formatPriceExact } from "@/lib/format";

/**
 * KPR (mortgage) estimator.
 *
 * Every Indonesian property portal puts one of these on the front page, and it
 * is the single most-used tool on them — buyers here shop by monthly instalment
 * far more than by headline price. Rumah123 links out to a separate calculator
 * page; putting it on the homepage costs one client component and removes a
 * navigation step from the most common question a buyer has.
 *
 * Pure arithmetic, no network, no data. Deliberately an ESTIMATE and labelled
 * as one: real KPR pricing depends on the bank, the tenor structure (most
 * Indonesian products are fixed-then-floating), insurance and provisi fees.
 * Presenting this as a quotation would be misleading, so the copy does not.
 */

/* Was `Rp ${n.toLocaleString("id-ID")}` with rupiah-scaled slider bounds and a
   default of 1,500,000,000 — which on the Malaysian build read as a RM1.5
   BILLION house. Currency, bounds and the starting figure all come from the
   market now. */
const fmtMoney = (n: number) => formatPriceExact(Math.round(n), market.currency);

export type KprLabels = {
  title: string;
  intro: string;
  price: string;
  downPayment: string;
  rate: string;
  years: string;
  monthly: string;
  loanAmount: string;
  disclaimer: string;
  cta: string;
};

export function KprCalculator({
  labels,
  searchHref,
  /** Seeded from the listing on a property page; a generic default elsewhere. */
  initialPrice = market.loan.defaultPrice,
}: {
  labels: KprLabels;
  searchHref: string;
  initialPrice?: number;
}) {
  const [price, setPrice] = useState(initialPrice);
  const [dpPct, setDpPct] = useState(20);
  const [rate, setRate] = useState(7.5);
  const [years, setYears] = useState(15);

  const loan = Math.max(0, price - (price * dpPct) / 100);
  const r = rate / 100 / 12;
  const n = years * 12;

  // Standard annuity payment. r = 0 is not a realistic rate but it is a
  // reachable input, and dividing by zero on the way to a NaN in the UI is not
  // an acceptable way to find that out.
  const monthly = n === 0 ? 0 : r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));

  // Rough affordability: what a buyer on this instalment could look at.
  const searchMax = Math.round(price / 100_000_000) * 100_000_000;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
      <div>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{labels.title}</h2>
        <p className="mt-1 max-w-lg text-sm text-muted">{labels.intro}</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            {labels.price}
            <input
              type="range"
              min={market.loan.minPrice}
              max={market.loan.maxPrice}
              step={market.loan.priceStep}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="mt-2 w-full accent-brand"
            />
            <output className="mt-1 block text-sm font-semibold text-brand">
              {fmtMoney(price)}
            </output>
          </label>

          <label className="text-sm font-medium">
            {labels.downPayment}
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={dpPct}
              onChange={(e) => setDpPct(Number(e.target.value))}
              className="mt-2 w-full accent-brand"
            />
            <output className="mt-1 block text-sm font-semibold text-brand">
              {dpPct}% · {fmtMoney((price * dpPct) / 100)}
            </output>
          </label>

          <label className="text-sm font-medium">
            {labels.rate}
            <input
              type="range"
              min={0}
              max={20}
              step={0.25}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="mt-2 w-full accent-brand"
            />
            <output className="mt-1 block text-sm font-semibold text-brand">
              {rate.toFixed(2)}%
            </output>
          </label>

          <label className="text-sm font-medium">
            {labels.years}
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              className="mt-2 w-full accent-brand"
            />
            <output className="mt-1 block text-sm font-semibold text-brand">
              {years}
            </output>
          </label>
        </div>
      </div>

      <div className="flex flex-col justify-center rounded-card border border-line bg-surface-raised p-6 text-center lg:w-72">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {labels.monthly}
        </p>
        <p className="mt-2 text-3xl font-extrabold tracking-tight text-brand">
          {fmtMoney(monthly)}
        </p>
        <p className="mt-3 text-xs text-muted">
          {labels.loanAmount}: <strong className="text-foreground">{fmtMoney(loan)}</strong>
        </p>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">{labels.disclaimer}</p>
        <a
          href={`${searchHref}?type=sale&maxPrice=${searchMax}`}
          className="mt-4 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong"
        >
          {labels.cta}
        </a>
      </div>
    </div>
  );
}
