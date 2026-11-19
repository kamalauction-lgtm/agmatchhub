"use client";

import { useCallback, useSyncExternalStore } from "react";

const CHANGED = "pg-stored-changed";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGED, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGED, cb);
  };
}

/**
 * A string kept in localStorage: a per-device convenience (a collapsed menu, a
 * folded group), never anything that must survive or be shared. The server
 * and the first client render both see `fallback`, so markup matches; private
 * windows that refuse storage simply do not remember.
 */
export function useStored(key: string, fallback = ""): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
  const set = useCallback(
    (next: string) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        /* not remembered */
      }
      window.dispatchEvent(new Event(CHANGED));
    },
    [key],
  );
  return [value, set];
}
