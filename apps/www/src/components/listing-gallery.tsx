"use client";

import { useState } from "react";
import Image from "next/image";
import { CameraIcon, ImageOffIcon } from "./icons";

/**
 * The photo gallery.
 *
 * Two jobs, and the second is currently the important one:
 *
 * 1. With photos: a large frame plus a thumbnail strip, selection held here so
 *    switching costs no round trip.
 *
 * 2. WITHOUT photos: a designed panel rather than a collapsed empty div. Every
 *    listing on the site is in this state today — they were imported from a
 *    spreadsheet whose photos we declined to reuse — and a page that simply
 *    starts at the headline looks broken next to a portal that opens with a
 *    carousel. This says plainly that photos are coming and points at the
 *    enquiry form, which turns the gap into the one action worth taking.
 *
 * What it never does is fill the space with a stock photograph of some other
 * building. A decorative placeholder is honest; a photo of a property that is
 * not this one is not.
 */

export type GalleryImage = { id: string; src: string; thumb: string; alt: string };

export function ListingGallery({
  images,
  labels,
}: {
  images: GalleryImage[];
  labels: {
    noPhoto: string;
    noPhotoHelp: string;
    photoCount: string;
    openPhoto: string;
    askForPhotos: string;
  };
}) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="relative grid aspect-[16/10] place-items-center px-6 sm:aspect-[16/7]">
          {/* A quiet brand wash, so the block reads as designed rather than
              as a failed image load. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--brand-soft),transparent_70%)]"
          />
          <div className="relative flex flex-col items-center text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-background text-muted shadow-sm">
              <ImageOffIcon className="h-6 w-6" />
            </span>
            <p className="mt-3 font-semibold">{labels.noPhoto}</p>
            <p className="mt-1 max-w-sm text-sm text-muted">{labels.noPhotoHelp}</p>
            <a
              href="#enquiry"
              className="mt-4 cursor-pointer rounded-lg border border-brand/30 bg-background px-4 py-2 text-sm font-semibold text-brand transition-colors duration-200 hover:bg-brand hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {labels.askForPhotos}
            </a>
          </div>
        </div>
      </div>
    );
  }

  const current = images[Math.min(active, images.length - 1)];

  return (
    <div className="overflow-hidden rounded-card border border-line">
      <div className="relative aspect-[16/10] bg-surface sm:aspect-[16/8]">
        <Image
          src={current.src}
          alt={current.alt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1024px"
          className="object-cover"
        />
        {images.length > 1 && (
          <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-foreground/75 px-3 py-1.5 text-xs font-semibold text-background">
            <CameraIcon className="h-4 w-4" />
            {labels.photoCount.replace("{n}", String(images.length))}
          </span>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto bg-surface p-2">
          {images.slice(0, 12).map((m, i) => {
            const selected = i === active;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`${labels.openPhoto} ${i + 1}`}
                aria-current={selected}
                className={`relative h-20 w-28 shrink-0 cursor-pointer overflow-hidden rounded-lg bg-background transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  selected ? "ring-2 ring-brand" : "ring-1 ring-line hover:ring-brand/50"
                }`}
              >
                <Image src={m.thumb} alt="" fill sizes="112px" className="object-cover" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
