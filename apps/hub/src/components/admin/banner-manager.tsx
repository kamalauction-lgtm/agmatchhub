"use client";

import { useState } from "react";
import { BannerForm, type BannerFormLabels, type BannerRow } from "./banner-form";
import { toggleBanner, deleteBanner } from "@/app/(admin)/admin/banners/actions";

/**
 * The banner list, with inline create and edit.
 *
 * Inline rather than a separate route per banner: there will rarely be more
 * than a handful of live campaigns, and editing one next to the others is how
 * an admin actually checks that two banners in the same slot do not clash.
 */

export function BannerManager({
  banners,
  labels,
  marketplaceUrl,
}: {
  banners: BannerRow[];
  labels: BannerFormLabels;
  marketplaceUrl: string;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const bySlot = {
    home_top: banners.filter((b) => b.slot === "home_top"),
    home_middle: banners.filter((b) => b.slot === "home_middle"),
  };

  return (
    <>
      {!creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
        >
          {labels.create}
        </button>
      ) : (
        <BannerForm
          labels={labels}
          marketplaceUrl={marketplaceUrl}
          onCancel={() => setCreating(false)}
        />
      )}

      {(["home_top", "home_middle"] as const).map((slot) => (
        <section key={slot} className="mt-8">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
            {slot === "home_top" ? labels.slotTop : labels.slotMiddle}
          </h2>
          <p className="mb-3 text-xs text-muted">
            {slot === "home_top" ? labels.slotTopHelp : labels.slotMiddleHelp}
          </p>

          {!bySlot[slot].length ? (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {labels.empty}
            </p>
          ) : (
            <div className="space-y-3">
              {bySlot[slot].map((b) =>
                editingId === b.id ? (
                  <BannerForm
                    key={b.id}
                    banner={b}
                    labels={labels}
                    marketplaceUrl={marketplaceUrl}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <article
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            b.is_active
                              ? "bg-success/10 text-success"
                              : "bg-surface text-muted"
                          }`}
                        >
                          {b.is_active ? labels.live : labels.paused}
                        </span>
                        <span className="text-xs text-muted">#{b.position}</span>
                        {(b.starts_at || b.ends_at) && (
                          <span className="text-xs text-muted">
                            {b.starts_at?.slice(0, 10) ?? "…"} → {b.ends_at?.slice(0, 10) ?? "…"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-semibold">{b.title}</p>
                      {b.advertiser_label && (
                        <p className="text-xs text-muted">{b.advertiser_label}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(b.id)}
                        className="rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:border-crimson hover:text-crimson"
                      >
                        {labels.edit}
                      </button>

                      <form action={toggleBanner}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="isActive" value={String(!b.is_active)} />
                        <button
                          type="submit"
                          className="rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:border-crimson hover:text-crimson"
                        >
                          {b.is_active ? labels.pause : labels.activate}
                        </button>
                      </form>

                      {/* Deletion is permanent and the row is the only record of
                          what ran, so it asks first. The audit entry survives. */}
                      <form
                        action={deleteBanner}
                        onSubmit={(e) => {
                          if (!confirm(labels.confirmDelete)) e.preventDefault();
                        }}
                      >
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted hover:border-danger hover:text-danger"
                        >
                          {labels.delete}
                        </button>
                      </form>
                    </div>
                  </article>
                )
              )}
            </div>
          )}
        </section>
      ))}
    </>
  );
}
