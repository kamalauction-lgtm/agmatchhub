import Image from "next/image";

/**
 * One AI colleague, at the agent's side on the screen where that role works
 * (owner, 8 Nov 2026: "they are always beside you while you do the work").
 *
 * Pure and hook-free so it renders inside server and client components alike.
 * The data comes from `lib/ai/cast.ts` (ai_role_personas, 00097); this file
 * only draws it: avatar, "✦ Name", role title.
 */
export type Companion = {
  key: string;
  name: string;
  avatar: string | null;
  role: string;
};

export function CompanionBadge({
  c,
  size = "sm",
  line,
  className = "",
}: {
  c: Companion | null | undefined;
  size?: "xs" | "sm" | "md";
  /** An optional sentence under the name — what this colleague just did. */
  line?: string;
  className?: string;
}) {
  if (!c) return <span className="text-xs font-semibold text-indigo">✦</span>;
  const px = size === "md" ? 40 : size === "sm" ? 28 : 22;
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`} title={`${c.name} · ${c.role}`}>
      {c.avatar ? (
        <Image src={c.avatar} alt="" width={px} height={px} unoptimized
               className="shrink-0 rounded-full border border-card object-cover shadow-card" style={{ width: px, height: px }} />
      ) : (
        <span className="grid shrink-0 place-items-center rounded-full bg-indigo-soft text-indigo" style={{ width: px, height: px }}>✦</span>
      )}
      <span className="min-w-0 leading-tight">
        <span className={`block truncate font-semibold text-indigo ${size === "md" ? "text-sm" : "text-xs"}`}>✦ {c.name}</span>
        <span className="block truncate text-[11px] text-muted">{line ?? c.role}</span>
      </span>
    </span>
  );
}
