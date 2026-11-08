import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { ImportReview } from "@/components/import/import-review";

/**
 * Review before anything becomes a listing.
 *
 * Nothing on this page has touched `listings` yet. Items sit in their own table
 * with their own status until the agent presses import, which is what makes a
 * bad parse recoverable — they fix it here rather than editing a published
 * listing afterwards.
 */

export const dynamic = "force-dynamic";

const REVIEW_LABEL_KEYS = [
  "reviewTitle", "reviewSubtitle", "process", "processAll", "processing",
  "selectAll", "importReady", "importedNotice", "openExisting", "importAnyway",
  "skip", "unskip", "save", "edit", "cancel", "sourceLink", "noItems", "refetch",
  "authorityHeading", "authorityConfirm", "fieldTitle", "fieldPrice",
  "fieldPropertyType", "fieldListingType", "fieldBedrooms", "fieldBathrooms",
  "fieldBuildingSize", "fieldDescription", "imported", "missing",
  "duplicateWarning", "photosNote", "forSale", "forRent",
] as const;

/** Every code `processItem` can store on a row. */
const ITEM_ERROR_CODES = [
  "invalid_url", "unsupported_scheme", "blocked_host", "private_address",
  "too_many_redirects", "too_large", "timeout", "unsupported_content",
  "blocked_by_site", "not_found", "no_listing_data", "unavailable",
  "fetch_failed", "import_failed",
] as const;

export default async function BatchReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { batchId } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("listingImport");
  const locale = await getLocale();
  const supabase = await createClient();

  const { data: batch } = await supabase
    .from("import_batches")
    .select("id, source_portal, source_kind, source_label, status, found_count, imported_count, failed_count, error")
    .eq("id", batchId)
    .eq("agent_id", user.id)
    .maybeSingle();
  if (!batch) notFound();

  const { data: items } = await supabase
    .from("import_items")
    .select("id, source_url, status, extracted, overrides, warnings, error, listing_id, duplicate_of_listing_id")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });

  // The declaration the agent must accept — current active version in their
  // language, falling back to Indonesian, which is this workflow's primary.
  const { data: versions } = await supabase
    .from("declaration_versions")
    .select("id, body, locale, declarations!inner(key)")
    .eq("declarations.key", "listing_import_authority")
    .eq("active", true);

  const pick =
    versions?.find((v) => v.locale === locale) ??
    versions?.find((v) => v.locale === "id") ??
    versions?.[0];

  const rows = items ?? [];
  const counts = {
    found: rows.filter((r) => r.status === "found").length,
    ready: rows.filter((r) => r.status === "ready").length,
    needsReview: rows.filter((r) => r.status === "needs_review").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    imported: rows.filter((r) => r.status === "imported").length,
    failed: rows.filter((r) => r.status === "failed").length,
  };

  const labels = Object.fromEntries(REVIEW_LABEL_KEYS.map((k) => [k, t(k)]));

  /* A per-item failure is shown as its own sentence, not as a code. "Just a
     moment..." got imported once because a blocked fetch looked like a normal
     result; when it is blocked now, the row has to SAY it is blocked and what
     to do instead. */
  const errorLabels = Object.fromEntries(
    ITEM_ERROR_CODES.filter((c) => t.has(`errors.${c}`)).map((c) => [c, t(`errors.${c}`)]),
  );

  return (
    <AgentShell wide>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("reviewTitle")}</h1>
        <Link
          href="/listings/import"
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-crimson hover:text-crimson"
        >
          {t("backToImport")}
        </Link>
      </div>
      <p className="mb-6 text-sm text-muted">
        {batch.source_portal} · {batch.source_label}
      </p>

      {(error || batch.error) && (
        <p className="mb-6 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {/* `batch.error` can carry detail a key cannot — "columns_missing:
              Judul, Alamat, Bank" is far more use than "columns missing". Only
              translate what is actually a key; show the rest as written. */}
          {t.has(`errors.${error ?? batch.error}`)
            ? t(`errors.${error ?? batch.error}`)
            : batch.error}
        </p>
      )}
      {batch.error?.startsWith("columns_missing") && (
        <p className="-mt-4 mb-6 text-xs text-muted">
          {t("file.needs")}{" "}
          {/* A plain anchor: a Route Handler returning a CSV attachment, so a
              Link navigation would fetch it instead of downloading it. */}
          <a href="/listings/import/template" download className="font-semibold text-crimson hover:underline">
            {t("file.template")}
          </a>
        </p>
      )}

      {/* Batch summary — the shape the brief asked for */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
        {([
          ["found", counts.found], ["ready", counts.ready],
          ["needsReview", counts.needsReview], ["duplicate", counts.duplicate],
          ["imported", counts.imported], ["failed", counts.failed],
        ] as const).map(([key, n]) => (
          <div key={key} className="rounded-xl border border-line p-3">
            <p className="text-2xl font-bold">{n}</p>
            <p className="mt-0.5 text-xs text-muted">{t(`counts.${key}`)}</p>
          </div>
        ))}
      </section>

      {!rows.length ? (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
          {t("noItems")}
        </p>
      ) : (
        <ImportReview
          batchId={batch.id}
          items={rows.map((r) => ({
            id: r.id,
            sourceUrl: r.source_url,
            status: r.status,
            extracted: (r.extracted ?? {}) as Record<string, unknown>,
            overrides: (r.overrides ?? {}) as Record<string, unknown>,
            warnings: r.warnings ?? [],
            error: r.error,
            listingId: r.listing_id,
            duplicateOfListingId: r.duplicate_of_listing_id,
          }))}
          declaration={pick ? { id: pick.id, body: pick.body } : null}
          labels={labels}
          errorLabels={errorLabels}
        />
      )}
    </AgentShell>
  );
}
