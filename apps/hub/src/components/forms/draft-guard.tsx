"use client";

import { useEffect, useRef } from "react";

/**
 * Never lose typed form data again: mirrors every field into localStorage on
 * input and restores it after any failed submit / crash / accidental reload.
 * Mount inside the <form>. On the success page, mount with `clear` to wipe.
 */
export function FormDraftGuard({
  storageKey,
  notice,
}: {
  storageKey: string;
  notice?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;

    // Restore only into fields the server rendered empty, so edit pages keep
    // their database values but a failed submit gets everything back.
    let restored = false;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as
        | Record<string, string | boolean>
        | null;
      if (saved) {
        for (const el of Array.from(form.elements)) {
          const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          if (!input.name || !(input.name in saved)) continue;
          const type = (input as HTMLInputElement).type;
          if (["file", "hidden", "password", "submit", "button"].includes(type)) continue;
          if (type === "checkbox") {
            (input as HTMLInputElement).checked = saved[input.name] === true;
            restored = true;
          } else if (input.value === "" && saved[input.name] !== "") {
            input.value = String(saved[input.name]);
            restored = true;
          }
        }
      }
    } catch {
      // corrupt draft — ignore
    }
    if (restored && ref.current && notice) {
      ref.current.hidden = false;
    }

    const save = () => {
      const data: Record<string, string | boolean> = {};
      for (const el of Array.from(form.elements)) {
        const input = el as HTMLInputElement;
        if (!input.name) continue;
        if (["file", "hidden", "password", "submit", "button"].includes(input.type)) continue;
        data[input.name] = input.type === "checkbox" ? input.checked : input.value;
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch {
        // storage full — nothing we can do
      }
    };
    form.addEventListener("input", save);
    form.addEventListener("change", save);
    return () => {
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
    };
  }, [storageKey, notice]);

  return (
    <div ref={ref} hidden className="rounded-lg bg-success/10 px-4 py-2.5 text-sm text-success">
      {notice}
    </div>
  );
}

/** Mount on the page shown after a successful save to clear the local draft. */
export function ClearFormDraft({ storageKeys }: { storageKeys: string[] }) {
  useEffect(() => {
    for (const k of storageKeys) localStorage.removeItem(k);
  }, [storageKeys]);
  return null;
}
