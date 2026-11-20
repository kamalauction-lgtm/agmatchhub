"use client";

import { useErrorCopy, useReloadOnce } from "@/components/error-fallback";

/**
 * Failures in the root layout itself. This replaces the whole document, so it
 * carries its own minimal styles and follows the device's colour scheme.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string }; retry: () => void }) {
  useReloadOnce(error);
  const t = useErrorCopy();
  return (
    <html>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", colorScheme: "light dark" }}>
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }} data-error-fallback="global">
          <h1 style={{ fontSize: 20, margin: 0 }}>{t.title}</h1>
          <p style={{ maxWidth: 420, fontSize: 14, lineHeight: 1.5, opacity: 0.8 }}>{t.body}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, minHeight: 44, padding: "0 20px", borderRadius: 8, border: 0, cursor: "pointer", fontSize: 14, fontWeight: 600 }}
           
          >
            {t.reload}
          </button>
        </main>
      </body>
    </html>
  );
}
