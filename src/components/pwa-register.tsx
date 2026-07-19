"use client";

import { useEffect } from "react";

/** Registers the service worker (PWA install + push readiness). */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // registration failure is non-fatal
      });
    }
  }, []);
  return null;
}
