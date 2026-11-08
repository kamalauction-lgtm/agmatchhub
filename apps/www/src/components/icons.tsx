/**
 * The marketplace icon set.
 *
 * Drawn here rather than pulled from a package: eight icons do not justify a
 * dependency in a Worker bundle, and a consistent 24×24 grid with
 * `currentColor` means every one inherits the surrounding text colour and the
 * theme automatically.
 *
 * Decorative by default — `aria-hidden`, because each one sits beside a text
 * label. An icon that ever stands alone needs its own label at the call site.
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

export function BedIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M2 17v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5" />
      <path d="M2 17h20M4 17v3M20 17v3" />
      <path d="M6 10V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function BathIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 12h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3Z" />
      <path d="M6 12V6a2 2 0 0 1 2-2 2 2 0 0 1 2 2" />
      <path d="M7 19l-1 2M17 19l1 2" />
    </svg>
  );
}

export function AreaIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h4V3M21 15h-4v6" />
    </svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
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

export function CameraIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 8a2 2 0 0 1 2-2h2.2l1.3-2h6l1.3 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function ImageOffIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-4.5-4.5L9 18" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

export function ParkingIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M10 17V8h3.2a2.8 2.8 0 0 1 0 5.6H10" />
    </svg>
  );
}

/* Navigation and category icons ------------------------------------------- */

export function KeyIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 8-8" />
      <path d="m17 5 2.5 2.5M14.5 7.5 17 10" />
    </svg>
  );
}

export function TreeIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3 6.5 11h3L5 17h14l-4.5-6h3L12 3Z" />
      <path d="M12 17v4" />
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

export function SparkIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M12 8.5 13.4 11l2.6 1-2.6 1-1.4 2.5L10.6 13 8 12l2.6-1L12 8.5Z" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3l7 3v6c0 4.4-3 8.2-7 9-4-.8-7-4.6-7-9V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function BoltIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 6l12 12M18 6 6 18" />
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

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m14 6-6 6 6 6" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m10 6 6 6-6 6" />
    </svg>
  );
}
