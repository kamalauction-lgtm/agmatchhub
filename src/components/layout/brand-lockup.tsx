import Image from "next/image";
import { brand } from "@/config/brand";

/**
 * IQI + AG Team dual-logo lock-up (spec §70). The AG mark swaps between the
 * light-bg and dark-bg variants with the colour scheme; the IQI slot shows a
 * labelled placeholder until the official IQI file is supplied.
 */
export function BrandLockup({ size = 36 }: { size?: number }) {
  const w = Math.round(size * 1.44); // AG mark aspect ratio 720x500
  return (
    <span className="inline-flex items-center gap-3">
      <Image
        src={brand.logos.iqi.src}
        alt={brand.logos.iqi.alt}
        width={size}
        height={size}
        className="h-auto"
        priority
      />
      <span aria-hidden className="h-6 w-px bg-line" />
      <Image
        src={brand.logos.agTeamLight.src}
        alt={brand.logos.agTeam.alt}
        width={w}
        height={size}
        className="h-auto dark:hidden"
        priority
      />
      <Image
        src={brand.logos.agTeam.src}
        alt={brand.logos.agTeam.alt}
        width={w}
        height={size}
        className="hidden h-auto dark:block"
        priority
      />
    </span>
  );
}

/** Wordmark image (crisp SVG text), theme-aware. */
export function BrandWordmark({ height = 28 }: { height?: number }) {
  const w = Math.round(height * (620 / 84));
  return (
    <>
      <Image
        src={brand.logos.wordmarkLight.src}
        alt={brand.logos.wordmarkLight.alt}
        width={w}
        height={height}
        className="h-auto dark:hidden"
        unoptimized
        priority
      />
      <Image
        src={brand.logos.wordmarkDark.src}
        alt={brand.logos.wordmarkDark.alt}
        width={w}
        height={height}
        className="hidden h-auto dark:block"
        unoptimized
        priority
      />
    </>
  );
}
