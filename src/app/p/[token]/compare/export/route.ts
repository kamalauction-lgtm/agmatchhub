import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyLinkSession, linkCookieName } from "@/lib/request-links";
import { getClientSafeProperties } from "@/lib/projections/client-safe";
import { buildComparisonXlsx } from "@/lib/xlsx-lite";

/**
 * Styled Excel comparison export (§23 + §11 download permission).
 * Same client-safe projection as the page — nothing extra can leak.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const idsParam = new URL(request.url).searchParams.get("ids");

  const service = createServiceClient();
  const { data: p } = await service
    .from("client_presentations")
    .select("id, title, active, expires_at, allow_comparison, profiles(display_name), property_requests(transaction_type)")
    .eq("token", token)
    .maybeSingle();
  if (!p || !p.active || !p.allow_comparison || new Date(p.expires_at) < new Date()) {
    return new Response("Not available", { status: 404 });
  }
  const cookieVal = (await cookies()).get(linkCookieName(p.id))?.value;
  if (!verifyLinkSession(cookieVal, p.id)) {
    return new Response("Locked", { status: 401 });
  }

  const t = await getTranslations("clientView");
  const tc = await getTranslations("clientView.compare");
  const wanted = idsParam ? new Set(idsParam.split(",").filter(Boolean)) : null;
  const allProps = await getClientSafeProperties(p.id);
  const properties = (wanted ? allProps.filter((pr) => wanted.has(pr.ppid)) : allProps).slice(0, 5);
  const ra = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
  const req = Array.isArray(p.property_requests) ? p.property_requests[0] : p.property_requests;
  const isRent = req?.transaction_type === "rent";

  const money = (cur: string, n: number | null) =>
    n == null ? "—" : `${cur} ${n.toLocaleString("en-US")}`;

  // The headline figure follows the deal type: rent for rentals, price for
  // sales. Emphasised (bold + crimson) and shown first.
  const priceRow = {
    label: tc("price"),
    values: properties.map((pr) => money(pr.currency, pr.price)),
    emphasis: !isRent,
  };
  const rentRow = {
    label: tc("rent"),
    values: properties.map((pr) => pr.monthlyRental == null ? "—"
      : `${money(pr.currency, pr.monthlyRental)} ${pr.rentPeriod === "yearly" ? t("perYear") : t("perMonth")}`),
    emphasis: isRent,
  };

  const rows = [
    ...(isRent ? [rentRow, priceRow] : [priceRow, rentRow]),
    { label: tc("location"), values: properties.map((pr) => pr.generalLocation) },
    { label: tc("type"), values: properties.map((pr) => pr.propertyType ?? "—") },
    {
      label: tc("builtUp"),
      values: properties.map((pr) =>
        pr.builtUp != null ? `${pr.builtUp.toLocaleString("en-US")} ${pr.measurementUnit}` : "—",
      ),
    },
    {
      label: tc("pricePerArea"),
      values: properties.map((pr) =>
        pr.price != null && pr.builtUp
          ? `${pr.currency} ${(pr.price / pr.builtUp).toFixed(0)}/${pr.measurementUnit}`
          : "—",
      ),
    },
    { label: tc("bedrooms"), values: properties.map((pr) => pr.bedrooms?.toString() ?? "—") },
    { label: tc("bathrooms"), values: properties.map((pr) => pr.bathrooms?.toString() ?? "—") },
    { label: tc("carParks"), values: properties.map((pr) => pr.carParks?.toString() ?? "—") },
    {
      label: tc("furnishing"),
      values: properties.map((pr) => (pr.furnishing ? t(`furnishing.${pr.furnishing}`) : "—")),
    },
    { label: tc("condition"), values: properties.map((pr) => pr.condition ?? "—") },
    { label: tc("floor"), values: properties.map((pr) => pr.floorLevel ?? "—") },
    {
      label: tc("facilities"),
      values: properties.map((pr) => (pr.facilities.length ? pr.facilities.join(", ") : "—")),
    },
    { label: tc("negotiable"), values: properties.map((pr) => tc(`negotiableValues.${pr.negotiable}`)) },
    { label: tc("agentNotes"), values: properties.map((pr) => pr.agentNote ?? "—") },
  ];

  const xlsx = buildComparisonXlsx({
    title: p.title,
    subtitle: `${tc("preparedBy")} ${ra?.display_name ?? ""} · IQI AG MatchHub`,
    properties: properties.map((pr, i) => `${i + 1}. ${pr.title}`),
    rows,
    footers: [tc("missingNote"), t("disclaimerShort")],
  });

  return new Response(new Uint8Array(xlsx), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="matchhub-comparison.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
