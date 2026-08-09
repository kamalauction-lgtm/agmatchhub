"use client";

import { useState } from "react";
import { createBanner, updateBanner } from "@/app/(admin)/admin/banners/actions";

/**
 * Create/edit form for an advertising banner, with a live preview.
 *
 * The preview is the point. A banner is the most visible thing on the
 * marketplace and the hardest to check after the fact — an admin should see
 * what a buyer will see before pressing save, not after refreshing the public
 * site in another tab.
 */

export type BannerFormLabels = Record<string, string>;

export type BannerRow = {
  id: string;
  slot: string;
  title: string;
  subtitle: string | null;
  advertiser_label: string | null;
  location_label: string | null;
  price_label: string | null;
  image_path: string | null;
  link_url: string | null;
  cta_label: string | null;
  position: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

/** `2026-08-09T13:04:00Z` -> `2026-08-09T13:04`, which is what the input wants. */
const forInput = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

export function BannerForm({
  banner,
  labels,
  marketplaceUrl,
  onCancel,
}: {
  banner?: BannerRow;
  labels: BannerFormLabels;
  marketplaceUrl: string;
  onCancel?: () => void;
}) {
  const editing = !!banner;
  const [title, setTitle] = useState(banner?.title ?? "");
  const [subtitle, setSubtitle] = useState(banner?.subtitle ?? "");
  const [advertiser, setAdvertiser] = useState(banner?.advertiser_label ?? "");
  const [location, setLocation] = useState(banner?.location_label ?? "");
  const [price, setPrice] = useState(banner?.price_label ?? "");
  const [cta, setCta] = useState(banner?.cta_label ?? "");
  const [image, setImage] = useState(banner?.image_path ?? "");

  const previewSrc = image.startsWith("/") ? `${marketplaceUrl}${image}` : image;

  const field =
    "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson";

  return (
    <form
      action={editing ? updateBanner : createBanner}
      className="rounded-xl border border-line p-5"
    >
      {editing && <input type="hidden" name="id" value={banner.id} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="block text-xs font-medium">
            {labels.slot}
            <select name="slot" defaultValue={banner?.slot ?? "home_top"} className={field}>
              <option value="home_top">{labels.slotTop}</option>
              <option value="home_middle">{labels.slotMiddle}</option>
            </select>
          </label>

          <label className="block text-xs font-medium">
            {labels.headline}
            <input
              name="title"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={field}
            />
          </label>

          <label className="block text-xs font-medium">
            {labels.subtitle}
            <input
              name="subtitle"
              maxLength={240}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className={field}
            />
          </label>

          <label className="block text-xs font-medium">
            {labels.advertiser}
            <input
              name="advertiserLabel"
              maxLength={120}
              value={advertiser}
              onChange={(e) => setAdvertiser(e.target.value)}
              className={field}
            />
            <span className="mt-1 block font-normal text-muted">{labels.advertiserHelp}</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium">
              {labels.location}
              <input
                name="locationLabel"
                maxLength={120}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={field}
              />
            </label>
            <label className="block text-xs font-medium">
              {labels.price}
              <input
                name="priceLabel"
                maxLength={80}
                placeholder="Mulai 800 juta-an"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={field}
              />
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block text-xs font-medium">
            {labels.image}
            <input
              name="imagePath"
              maxLength={500}
              placeholder="/banners/sample-green-valley.svg"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              className={field}
            />
            <span className="mt-1 block font-normal text-muted">{labels.imageHelp}</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium">
              {labels.link}
              <input name="linkUrl" maxLength={500} defaultValue={banner?.link_url ?? ""} className={field} />
            </label>
            <label className="block text-xs font-medium">
              {labels.cta}
              <input
                name="ctaLabel"
                maxLength={60}
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                className={field}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium">
              {labels.startsAt}
              <input
                type="datetime-local"
                name="startsAt"
                defaultValue={forInput(banner?.starts_at ?? null)}
                className={field}
              />
            </label>
            <label className="block text-xs font-medium">
              {labels.endsAt}
              <input
                type="datetime-local"
                name="endsAt"
                defaultValue={forInput(banner?.ends_at ?? null)}
                className={field}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium">
              {labels.position}
              <input
                type="number"
                name="position"
                min={0}
                max={999}
                defaultValue={banner?.position ?? 0}
                className={field}
              />
            </label>
            <label className="flex items-start gap-2 pt-6 text-xs font-medium">
              <input
                type="checkbox"
                name="isActive"
                value="true"
                defaultChecked={banner?.is_active ?? false}
                className="mt-0.5 h-4 w-4 accent-crimson"
              />
              <span>
                {labels.active}
                <span className="mt-0.5 block font-normal text-muted">{labels.activeHelp}</span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Preview ---------------------------------------------------------- */}
      <p className="mt-6 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {labels.preview}
      </p>
      <div className="relative mt-2 flex min-h-40 overflow-hidden rounded-xl p-5">
        {previewSrc ? (
          <span
            aria-hidden
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${previewSrc})` }}
          />
        ) : null}
        <span
          aria-hidden
          className={`absolute inset-0 ${
            previewSrc
              ? "bg-gradient-to-r from-black/75 via-black/45 to-transparent"
              : "bg-gradient-to-r from-crimson to-crimson-strong"
          }`}
        />
        <span className="relative flex flex-col items-start gap-1">
          {/* Shown here exactly as the public page shows it — an admin should
              never be surprised that their banner is labelled advertising. */}
          <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            {labels.adLabel}
          </span>
          <span className="mt-1 text-xl font-extrabold leading-tight text-white sm:text-2xl">
            {title || labels.titlePlaceholder}
          </span>
          {subtitle && <span className="max-w-xl text-sm text-white/85">{subtitle}</span>}
          <span className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-white/85">
            {location && <span>📍 {location}</span>}
            {price && <span className="font-semibold text-white">{price}</span>}
          </span>
          {cta && (
            <span className="mt-3 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-foreground">
              {cta}
            </span>
          )}
          {advertiser && <span className="mt-2 text-[11px] text-white/70">{advertiser}</span>}
        </span>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
        >
          {editing ? labels.save : labels.create}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-crimson hover:text-crimson"
          >
            {labels.cancel}
          </button>
        )}
      </div>
    </form>
  );
}
