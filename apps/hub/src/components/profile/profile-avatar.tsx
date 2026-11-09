"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * A profile photo that never shows a broken image. The server resolves the
 * storage path to a public URL (lib/card/data.ts `profilePhotoUrl`) and passes
 * it in; if the file is missing or fails to load, the initial of the display
 * name takes its place. No external image hosts: the URL is the project's own
 * public bucket or an absolute URL already stored on the profile.
 */
export function ProfileAvatar({
  src,
  name,
  size = 64,
  className = "",
}: {
  src: string | null;
  name: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";

  if (!src || failed) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
        className={`grid place-items-center rounded-full bg-crimson font-bold text-white ${className}`}
      >
        {initial}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      unoptimized
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`rounded-full object-cover object-top ${className}`}
    />
  );
}
