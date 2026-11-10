"use server";

import { loadOffice } from "@/lib/ai/office";
import type { OfficeData } from "@/lib/ai/office-state";

/**
 * Near-realtime refresh for the Live Office. The client calls this every
 * 30 seconds while the tab is visible (and on demand). Seven bounded,
 * RLS-scoped reads per call; no realtime publication exists on ai_jobs yet,
 * and adding one is a database change that needs its own approval.
 */
export async function refreshOffice(): Promise<OfficeData | null> {
  return loadOffice();
}
