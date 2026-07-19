/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyLinkSession, linkCookieName } from "@/lib/request-links";
import { getClientSafeProperties } from "@/lib/projections/client-safe";

/** §23 comparison — client-safe fields only, 2–5 properties. */
export default async function ComparePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("clientView");
  const tc = await getTranslations("clientView.compare");

  const service = createServiceClient();
  const { data: p } = await service
    .from("client_presentations")
    .select("id, title, active, expires_at, allow_comparison")
    .eq("token", token)
    .maybeSingle();
  if (!p || !p.active || !p.allow_comparison || new Date(p.expires_at) < new Date()) {
    redirect(`/p/${token}`);
  }
  const cookieVal = (await cookies()).get(linkCookieName(p.id))?.value;
  if (!verifyLinkSession(cookieVal, p.id)) redirect(`/p/${token}`);

  const properties = (await getClientSafeProperties(p.id)).slice(0, 5);
  if (properties.length < 2) redirect(`/p/${token}`);

  const money = (cur: string, n: number | null) =>
    n == null ? "—" : `${cur} ${n.toLocaleString()}`;
  const psf = (prop: (typeof properties)[number]) =>
    prop.price != null && prop.builtUp
      ? `${prop.currency} ${(prop.price / prop.builtUp).toFixed(0)}/${prop.measurementUnit}`
      : "—";

  const rows: [string, (prop: (typeof properties)[number]) => string][] = [
    [tc("price"), (pr) => money(pr.currency, pr.price)],
    [tc("monthlyRent"), (pr) => money(pr.currency, pr.monthlyRental)],
    [tc("location"), (pr) => pr.generalLocation],
    [tc("type"), (pr) => pr.propertyType ?? "—"],
    [tc("builtUp"), (pr) => (pr.builtUp != null ? `${pr.builtUp.toLocaleString()} ${pr.measurementUnit}` : "—")],
    [tc("pricePerArea"), psf],
    [tc("bedrooms"), (pr) => pr.bedrooms?.toString() ?? "—"],
    [tc("bathrooms"), (pr) => pr.bathrooms?.toString() ?? "—"],
    [tc("carParks"), (pr) => pr.carParks?.toString() ?? "—"],
    [tc("furnishing"), (pr) => (pr.furnishing ? t(`furnishing.${pr.furnishing}`) : "—")],
    [tc("condition"), (pr) => pr.condition ?? "—"],
    [tc("floor"), (pr) => pr.floorLevel ?? "—"],
    [tc("facilities"), (pr) => (pr.facilities.length ? pr.facilities.join(", ") : "—")],
    [tc("negotiable"), (pr) => tc(`negotiableValues.${pr.negotiable}`)],
    [tc("agentNotes"), (pr) => pr.agentNote ?? "—"],
  ];

  return (
    <div className="min-h-screen bg-surface px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <Link href={`/p/${token}`} className="text-sm text-muted hover:text-foreground">
          ← {p.title}
        </Link>
        <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{tc("title")}</h1>
          <a
            href={`/p/${token}/compare/export`}
            download
            className="rounded-lg border border-crimson px-4 py-2 text-sm font-semibold text-crimson hover:bg-crimson-soft"
          >
            ⬇ {tc("downloadExcel")}
          </a>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-line bg-background">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="w-40 px-4 py-3" />
                {properties.map((pr, i) => (
                  <th key={pr.ppid} className="min-w-48 px-4 py-3 align-top">
                    {pr.images[0] && (
                      <img src={pr.images[0].url} alt={pr.title}
                        className="mb-2 h-24 w-full rounded-lg object-cover" />
                    )}
                    <span className="text-sm font-semibold">{i + 1}. {pr.title}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, fn]) => (
                <tr key={label} className="border-t border-line">
                  <td className="px-4 py-2.5 text-xs font-medium text-muted uppercase">{label}</td>
                  {properties.map((pr) => (
                    <td key={pr.ppid} className="px-4 py-2.5">{fn(pr)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted">{tc("missingNote")}</p>
      </div>
    </div>
  );
}
