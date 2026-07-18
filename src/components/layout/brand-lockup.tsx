import Image from "next/image";
import { brand } from "@/config/brand";

/**
 * IQI + AG Team dual-logo lock-up (spec §70): organised side-by-side with a
 * divider, correct aspect ratios, labelled placeholders until official assets
 * are uploaded via Super Admin brand management.
 */
export function BrandLockup({ size = 36 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-3">
      <Image
        src={brand.logos.iqi.src}
        alt={brand.logos.iqi.alt}
        width={size * 2.5}
        height={size}
        className="h-auto"
        priority
      />
      <span aria-hidden className="h-6 w-px bg-line" />
      <Image
        src={brand.logos.agTeam.src}
        alt={brand.logos.agTeam.alt}
        width={size * 2.5}
        height={size}
        className="h-auto"
        priority
      />
    </span>
  );
}
