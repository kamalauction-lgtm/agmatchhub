"use client";

import { useState } from "react";

/**
 * Repeatable location rows (state / area) — §13 multiple acceptable areas.
 * Serialises to a comma-separated hidden input for the server action.
 */
export function LocationList({
  name,
  initial,
  placeholder,
  addLabel,
  removeLabel,
}: {
  name: string;
  initial: string[];
  placeholder: string;
  addLabel: string;
  removeLabel: string;
}) {
  const [rows, setRows] = useState<string[]>(initial.length ? initial : [""]);

  const set = (i: number, v: string) =>
    setRows((r) => r.map((x, j) => (j === i ? v : x)));
  const remove = (i: number) => setRows((r) => r.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={rows.map((r) => r.trim()).filter(Boolean).join(", ")} />
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={row}
            onChange={(e) => set(i, e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson"
          />
          {rows.length > 1 && (
            <button type="button" onClick={() => remove(i)} aria-label={removeLabel}
              className="rounded-lg border border-line px-3 text-danger hover:border-danger">
              ✕
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => setRows((r) => [...r, ""])}
        className="rounded-lg border border-dashed border-line px-4 py-2 text-sm font-medium text-muted hover:border-crimson hover:text-crimson">
        + {addLabel}
      </button>
    </div>
  );
}
