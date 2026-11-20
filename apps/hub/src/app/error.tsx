"use client";

import { useErrorCopy, useReloadOnce } from "@/components/error-fallback";

/** Page-level failures: the root layout, fonts and styles are still in place. */
export default function Error({ error }: { error: Error & { digest?: string }; retry: () => void }) {
  useReloadOnce(error);
  const t = useErrorCopy();
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-6 text-center" data-error-fallback="1">
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <p className="mt-2 text-sm text-muted-strong">{t.body}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 min-h-11 cursor-pointer rounded-lg bg-crimson-btn px-5 text-sm font-semibold text-white transition-colors hover:bg-crimson-btn-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
       
      >
        {t.reload}
      </button>
      {error.digest && <p className="mt-4 font-mono text-[11px] text-muted">{error.digest}</p>}
    </main>
  );
}
