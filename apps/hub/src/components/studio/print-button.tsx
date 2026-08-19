"use client";

/** The browser's print dialog IS the PDF exporter — every platform ships one. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
    >
      {label}
    </button>
  );
}
