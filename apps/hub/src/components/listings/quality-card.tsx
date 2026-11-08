import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

/**
 * The listing's quality score with the specific fixes, not a grade.
 *
 * Reads `listing_quality_scores`, which the database recomputes whenever the
 * listing, its property or its photos change (00083). The recommendation keys
 * are data; the words are translations, so the same row reads correctly in
 * every language.
 */

type Rec = { key: string; n?: number; min?: number; place?: string; pct?: number; field?: string };

export async function QualityCard({ listingId }: { listingId: string }) {
  const supabase = await createClient();
  const t = await getTranslations("listings.quality");
  const { data: q } = await supabase
    .from("listing_quality_scores")
    .select("total_score, completeness, photo_quality, title_quality, description_quality, price_competitiveness, location_accuracy, recommendations, computed_at")
    .eq("listing_id", listingId)
    .maybeSingle();
  if (!q) return null;

  const recs = (q.recommendations ?? []) as Rec[];
  // Recommendation keys are data from the database, so the typed `t` cannot
  // know them; this is the one place a dynamic key is resolved.
  const tr = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const tone = q.total_score >= 75 ? "text-success" : q.total_score >= 50 ? "text-warning" : "text-danger";
  const bars: [string, number][] = [
    [t("sub.completeness"), q.completeness],
    [t("sub.photos"), q.photo_quality],
    [t("sub.title"), q.title_quality],
    [t("sub.description"), q.description_quality],
    [t("sub.price"), q.price_competitiveness],
    [t("sub.location"), q.location_accuracy],
  ];

  return (
    <section className="mb-6 rounded-xl border border-line bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{t("title")}</h2>
          <p className="mt-0.5 text-xs text-muted">{t("hint")}</p>
        </div>
        <p className={`text-3xl font-bold tabular-nums ${tone}`}>
          {q.total_score}<span className="text-sm font-medium text-muted">/100</span>
        </p>
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        {bars.map(([label, v]) => (
          <div key={label} className="flex items-center gap-3 text-xs">
            <dt className="w-28 shrink-0 text-muted">{label}</dt>
            <dd className="flex-1">
              <div className="h-1.5 w-full rounded-full bg-surface">
                <div className={`h-1.5 rounded-full ${v >= 75 ? "bg-success" : v >= 50 ? "bg-warning" : "bg-danger"}`} style={{ width: `${v}%` }} />
              </div>
            </dd>
            <span className="w-8 text-right tabular-nums">{v}</span>
          </div>
        ))}
      </dl>

      {recs.length > 0 && (
        <ol className="mt-4 space-y-1.5 text-sm">
          {recs.map((r, i) => (
            <li key={`${r.key}-${i}`} className="flex gap-2">
              <span className="text-crimson">→</span>
              <span>
                {r.key === "add_field"
                  ? tr("rec.add_field", { field: tr(`field.${r.field ?? "other"}`) })
                  : tr(`rec.${r.key}`, { n: r.n ?? 0, min: r.min ?? 0, place: r.place ?? "", pct: r.pct ?? 0 })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
