"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Office3DProps } from "./office-3d-scene";

/**
 * Client-only loader for the 3D office. Three.js never renders on the
 * server; while the bundle loads a skeleton keeps the layout stable. If the
 * browser has no WebGL the parent is told so it can fall back to the 2D view.
 */
const Scene = dynamic(() => import("./office-3d-scene"), {
  ssr: false,
  loading: () => <div className="office3d-loading" aria-busy="true" />,
});

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function Office3D(props: Office3DProps & { onUnavailable: () => void; loadingLabel: string }) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    const supported = hasWebGL();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capability probe needs the DOM
    setOk(supported);
    if (!supported) props.onUnavailable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (ok === null) return <div className="office3d-loading" aria-busy="true"><span>{props.loadingLabel}</span></div>;
  if (!ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip loader-only props
  const { onUnavailable, loadingLabel, ...rest } = props;
  return <Scene {...rest} />;
}
