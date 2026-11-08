/**
 * Icons for the digital name card.
 *
 * These replace an emoji map (📘 📸 💼 🎵 ▶️ 💬 ✈️ 🌐 🏢 🔗 📍 🏘️). Emoji render
 * in a different typeface on every platform, cannot take the brand colour, and
 * on a card that is somebody's professional identity they read as unfinished.
 *
 * DELIBERATELY NOT BRAND LOGOS. Drawing an approximate Instagram or LinkedIn
 * mark from memory produces something subtly wrong, and these are trademarks on
 * a page that represents a real person. Each platform gets an honest category
 * glyph and keeps its NAME as the visible label, which is what the reader
 * actually navigates by. Same reasoning as the rule about never substituting a
 * lookalike official logo.
 *
 * 24×24 grid, `currentColor`, `aria-hidden` — every one sits next to text.
 */

type IconProps = { className?: string };

const base = (className?: string) => ({
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className: className ?? "h-5 w-5",
});

export function GlobeIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18-2.5-3-2.5-15.5 0-18Z" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M21 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-5A8 8 0 1 1 21 11.5Z" />
    </svg>
  );
}

export function SendIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3l-6.5 18-4-8-8-4L21 3Z" />
    </svg>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="2.5" y="5" width="19" height="14" rx="4" />
      <path d="m10.5 9.5 5 2.5-5 2.5v-5Z" />
    </svg>
  );
}

export function CameraIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BriefcaseIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M3 12h18" />
    </svg>
  );
}

export function NoteIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="8" cy="17" r="3" />
      <path d="M11 17V5l6 2" />
    </svg>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M10 13a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 4.3l-1.5 1.5" />
      <path d="M14 11a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 19.7l1.5-1.5" />
    </svg>
  );
}

export function BuildingIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 21V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15" />
      <path d="M12 21V11a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v10" />
      <path d="M2 21h20M7 9h2M7 13h2M15 14h2M15 17h2" />
    </svg>
  );
}

export function HomesIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 10.5 9 6l6 4.5" />
      <path d="M5 9.8V20h8V9.8" />
      <path d="M15 20h6v-8l-3-2.2L15 12" />
    </svg>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function CheckBadgeIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m12 2 2.4 1.8 3 .3 1 2.8 2.2 2-1 2.9 1 2.9-2.2 2-1 2.8-3 .3L12 22l-2.4-1.8-3-.3-1-2.8-2.2-2 1-2.9-1-2.9 2.2-2 1-2.8 3-.3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Platform → glyph. Anything unknown falls back to a plain link. */
export const PLATFORM_ICONS: Record<string, (p: IconProps) => React.ReactElement> = {
  facebook: GlobeIcon,
  instagram: CameraIcon,
  linkedin: BriefcaseIcon,
  tiktok: NoteIcon,
  youtube: PlayIcon,
  whatsapp: ChatIcon,
  telegram: SendIcon,
  website: GlobeIcon,
  agency_profile: BuildingIcon,
  other: LinkIcon,
};
