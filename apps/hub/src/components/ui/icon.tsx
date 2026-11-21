/**
 * One small outline icon set for the shells and empty states (24×24 grid,
 * 2px round strokes, `currentColor`). Replaces the emoji and glyph characters
 * the rails used: emoji render differently on every device and cannot take a
 * colour, so an active or muted item could not look active or muted.
 *
 * Icons are addressed by name so a server component can pass one to a client
 * component as a plain string. Shapes follow the Lucide conventions (ISC).
 */

const P: Record<string, string[]> = {
  home: ["M3 10.5 12 3l9 7.5", "M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"],
  inbox: ["M22 12h-6l-2 3h-4l-2-3H2", "M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"],
  "check-square": ["m9 11 3 3 8-8", "M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
  building: ["M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16", "M16 9h2a2 2 0 0 1 2 2v10", "M2 21h20", "M8 7h4M8 11h4M8 15h4"],
  package: ["m3 7 9-4 9 4v10l-9 4-9-4z", "m3 7 9 4 9-4", "M12 11v10"],
  "trending-up": ["m3 17 6-6 4 4 8-8", "M15 7h6v6"],
  sparkles: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z", "M19 15v4M17 17h4M5 3v3M3.5 4.5h3"],
  bot: ["M12 8V4", "M8 4h8", "M5 8h14a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1z", "M9 13v2M15 13v2"],
  "graduation-cap": ["m2 9 10-5 10 5-10 5z", "M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5", "M22 9v6"],
  repeat: ["m17 2 4 4-4 4", "M3 11V9a3 3 0 0 1 3-3h15", "m7 22-4-4 4-4", "M21 13v2a3 3 0 0 1-3 3H3"],
  clipboard: ["M9 3h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1z", "M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2", "M8 12h8M8 16h5"],
  send: ["M22 2 11 13", "M22 2 15 22l-4-9-9-4z"],
  megaphone: ["M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z", "M16.5 8.5a5 5 0 0 1 0 7", "M19.5 6a9 9 0 0 1 0 12"],
  bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8", "M10 20a2 2 0 0 0 4 0"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"],
  receipt: ["M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z", "M9 8h6M9 12h6"],
  "id-card": ["M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M8 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M5 16a3 3 0 0 1 6 0", "M14 9h5M14 13h4"],
  help: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5", "M12 17.5h.01"],
  grid: ["M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"],
  "shield-check": ["M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z", "m9 12 2 2 4-4"],
  workflow: ["M3 3h6v6H3zM15 15h6v6h-6z", "M6 9v3a3 3 0 0 0 3 3h6"],
  "user-plus": ["M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M2 21a8 8 0 0 1 13.3-6", "M19 14v6M16 17h6"],
  mail: ["M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "m2 7 10 6 10-6"],
  upload: ["M12 15V3", "m7 8 5-5 5 5", "M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"],
  image: ["M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M9 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z", "m21 15-5-5L5 21"],
  shuffle: ["M16 3h5v5", "M4 20 21 3", "M21 16v5h-5", "m15 15 6 6", "M4 4l5 5"],
  list: ["M8 6h13M8 12h13M8 18h13", "M3.5 6h.01M3.5 12h.01M3.5 18h.01"],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 6v6l4 2"],
  flag: ["M4 22V4", "M4 4h13l-2 4 2 4H4"],
  layout: ["M3 4h18v6H3z", "M3 14h8v6H3zM15 14h6v6h-6z"],
  wallet: ["M4 6h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11", "M16 13h.01", "M20 10h-4a3 3 0 0 0 0 6h4"],
  hexagon: ["m12 2 8.5 5v10L12 22l-8.5-5V7z"],
  "credit-card": ["M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M2 10h20", "M6 15h4"],
  "message-circle": ["M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"],
  globe: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M2 12h20", "M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z"],
  fingerprint: ["M6 11a6 6 0 0 1 12 0c0 3-.5 6-1.5 8", "M9.5 11a2.5 2.5 0 0 1 5 0c0 4-1 7-2.5 9", "M12 11c0 3-.8 5.5-2.5 7.5", "M4 14c0 1 0 2-.5 3"],
  scale: ["M12 3v18", "M7 21h10", "M5 7h14", "m5 7-3 7a3 3 0 0 0 6 0z", "m19 7-3 7a3 3 0 0 0 6 0z"],
  users: ["M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M2 21a7 7 0 0 1 14 0", "M16 3.5a4 4 0 0 1 0 7.5", "M18 14a7 7 0 0 1 4 7"],
  settings: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"],
  history: ["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5", "M12 7v5l3 2"],
  handshake: ["m11 17 2 2a1.4 1.4 0 0 0 2-2", "m14 16 2.5 2.5a1.4 1.4 0 0 0 2-2L15 13", "M3 8l4-3 5 3 3-2 6 4v6l-3 1", "M3 8v7l3 2 4-4"],
  calendar: ["M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M3 10h18", "M8 3v4M16 3v4"],
  link: ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.700-5.700l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"],
  plus: ["M12 5v14M5 12h14"],
  "arrow-right": ["M5 12h14", "m13 6 6 6-6 6"],
  menu: ["M4 6h16M4 12h16M4 18h16"],
  x: ["M6 6l12 12M18 6 6 18"],
  "panel-left": ["M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "M9 4v16"],
  "log-out": ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "m16 17 5-5-5-5", "M21 12H9"],
  "chevron-down": ["m6 9 6 6 6-6"],
  check: ["M20 6 9 17l-5-5"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "m21 21-4.300-4.300"],
  plane: ["M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"],
  "map-pin": ["M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z", "M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  star: ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"],
  bed: ["M2 4v16", "M2 8h18a2 2 0 0 1 2 2v10", "M2 17h20", "M6 8v9"],
  maximize: ["M8 3H5a2 2 0 0 0-2 2v3", "M21 8V5a2 2 0 0 0-2-2h-3", "M3 16v3a2 2 0 0 0 2 2h3", "M16 21h3a2 2 0 0 0 2-2v-3"],
  "alert-triangle": ["M21.7 18l-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z", "M12 9v4", "M12 17h.01"],
  "external-link": ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],
};

export type IconName = keyof typeof P;
export const ICON_NAMES = Object.keys(P) as IconName[];

export function Icon({ name, size = 20, className = "" }: { name: string; size?: number; className?: string }) {
  const paths = P[name] ?? P.grid;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
