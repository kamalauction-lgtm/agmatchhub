"use server";

import { requireCapability } from "@/lib/authz";
import { loadPlatformOffice } from "@/lib/ai/office";
import type { OfficeData } from "@/lib/ai/office-state";

/** Refresh for the admin platform Office view (screen 12). ai.manage only. */
export async function refreshPlatformOffice(): Promise<OfficeData | null> {
  await requireCapability("ai.manage");
  return loadPlatformOffice();
}
