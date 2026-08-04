"use client";

import { useEffect, useState } from "react";

function base64ToUint8(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** One-tap web-push opt-in (§40). Renders nothing where unsupported. */
export function PushSubscribe({
  vapidPublicKey,
  labels,
  saveAction,
}: {
  vapidPublicKey: string;
  labels: { enable: string; enabled: string; denied: string };
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const [state, setState] = useState<"unsupported" | "idle" | "subscribed" | "denied" | "busy">(
    "unsupported",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Defer a microtask so state updates never run synchronously inside
      // the effect body (react-hooks/set-state-in-effect).
      await Promise.resolve();
      if (cancelled) return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidPublicKey) return;
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!cancelled) setState(sub ? "subscribed" : "idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  if (state === "unsupported") return null;

  const subscribe = async () => {
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8(vapidPublicKey) as BufferSource,
      });
      const json = sub.toJSON();
      const fd = new FormData();
      fd.set("endpoint", sub.endpoint);
      fd.set("p256dh", json.keys?.p256dh ?? "");
      fd.set("auth", json.keys?.auth ?? "");
      await saveAction(fd);
      setState("subscribed");
    } catch {
      setState("idle");
    }
  };

  if (state === "subscribed") {
    return <p className="text-xs font-medium text-success">✓ {labels.enabled}</p>;
  }
  if (state === "denied") {
    return <p className="text-xs text-muted">{labels.denied}</p>;
  }
  return (
    <button
      onClick={subscribe}
      disabled={state === "busy"}
      className="rounded-lg border border-crimson px-4 py-2 text-sm font-semibold text-crimson hover:bg-crimson-soft disabled:opacity-50"
    >
      🔔 {labels.enable}
    </button>
  );
}
