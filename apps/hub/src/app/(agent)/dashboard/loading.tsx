import { AgentShell } from "@/components/layout/agent-shell";

/**
 * Dashboard loading state (Dashboard 2.0). Shown while the server component
 * fetches counts and the brief. Shapes only, no text: there is nothing true to
 * say yet, and a skeleton needs no translation.
 */
export default function DashboardLoading() {
  return (
    <AgentShell wide>
      <div aria-busy="true" aria-live="polite" className="space-y-5 motion-safe:animate-pulse">
        <div className="command-band h-36 rounded-3xl opacity-80" />
        <div className="grid gap-0 overflow-hidden rounded-2xl border border-line bg-card sm:grid-cols-[9rem_1fr] lg:grid-cols-[11rem_1fr]">
          <div className="h-44 bg-blue-soft" />
          <div className="space-y-3 p-5">
            <div className="h-4 w-1/3 rounded bg-surface" />
            <div className="h-3 w-2/3 rounded bg-surface" />
            <div className="h-3 w-1/2 rounded bg-surface" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-2xl border border-line bg-card" />
          ))}
        </div>
      </div>
    </AgentShell>
  );
}
