import "server-only";
import { createClient } from "@/lib/supabase/server";

export type DeclarationKey =
  | "supply_agent_submission"
  | "requesting_agent_presentation"
  | "client_disclaimer";

export type ActiveDeclaration = {
  declarationId: string;
  versionId: string;
  versionNumber: number;
  locale: string;
  body: string;
};

/**
 * Active declaration text for a locale, falling back to English (§34).
 * Returns null only if the declaration has no active version at all.
 */
export async function getActiveDeclaration(
  key: DeclarationKey,
  locale: string,
): Promise<ActiveDeclaration | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("declaration_versions")
    .select("id, version_number, locale, body, declarations!inner(id, key)")
    .eq("declarations.key", key)
    .eq("active", true)
    .in("locale", locale === "en" ? ["en"] : [locale, "en"])
    .order("version_number", { ascending: false });
  if (!data?.length) return null;
  const best = data.find((v) => v.locale === locale) ?? data.find((v) => v.locale === "en");
  if (!best) return null;
  const decl = Array.isArray(best.declarations) ? best.declarations[0] : best.declarations;
  return {
    declarationId: decl.id,
    versionId: best.id,
    versionNumber: best.version_number,
    locale: best.locale,
    body: best.body,
  };
}

/**
 * Records an active acceptance (§31). Call only after the user actively
 * ticked/clicked — never pre-select. Stores the exact accepted wording.
 */
export async function recordConsent(opts: {
  declaration: ActiveDeclaration;
  requestRef?: string;
  submissionRef?: string;
  presentationRef?: string;
  countryCode?: string;
}): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase.from("consent_records").insert({
    user_id: user.id,
    declaration_id: opts.declaration.declarationId,
    declaration_version_id: opts.declaration.versionId,
    accepted_text: opts.declaration.body,
    language: opts.declaration.locale,
    request_ref: opts.requestRef ?? null,
    submission_ref: opts.submissionRef ?? null,
    presentation_ref: opts.presentationRef ?? null,
    country_code: opts.countryCode ?? null,
  });
  if (error) console.error("[consent] insert failed:", error.message);
  return !error;
}
