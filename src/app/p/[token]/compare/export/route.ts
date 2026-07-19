import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyLinkSession, linkCookieName } from "@/lib/request-links";
import { getClientSafeProperties } from "@/lib/projections/client-safe";

/**
 * Excel-compatible comparison export (§23 + §11 download permission).
 * Same client-safe projection as the page — nothing extra can leak.
 * CSV with UTF-8 BOM: opens directly in Excel with proper columns.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const service = createServiceClient();
  const { data: p } = await service
    .from("client_presentations")
    .select("id, title, active, expires_at, allow_comparison")
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
  const properties = (await getClientSafeProperties(p.id)).slice(0, 5);

  const money = (cur: string, n: number | null) =>
    n == null ? "" : `${cur} ${n.toLocaleString("en-US")}`;

  const header = [
    "#", tc("propertyName"), tc("price"), tc("monthlyRent"), tc("location"),
    tc("type"), tc("builtUp"), tc("pricePerArea"), tc("bedrooms"), tc("bathrooms"),
    tc("carParks"), tc("furnishing"), tc("condition"), tc("floor"),
    tc("facilities"), tc("negotiable"), tc("agentNotes"),
  ];

  const dataRows = properties.map((pr, i) => [
    String(i + 1),
    pr.title,
    money(pr.currency, pr.price),
    money(pr.currency, pr.monthlyRental),
    pr.generalLocation,
    pr.propertyType ?? "",
    pr.builtUp != null ? `${pr.builtUp} ${pr.measurementUnit}` : "",
    pr.price != null && pr.builtUp
      ? `${pr.currency} ${(pr.price / pr.builtUp).toFixed(0)}/${pr.measurementUnit}`
      : "",
    pr.bedrooms?.toString() ?? "",
    pr.bathrooms?.toString() ?? "",
    pr.carParks?.toString() ?? "",
    pr.furnishing ? t(`furnishing.${pr.furnishing}`) : "",
    pr.condition ?? "",
    pr.floorLevel ?? "",
    pr.facilities.join("; "),
    tc(`negotiableValues.${pr.negotiable}`),
    pr.agentNote ?? "",
  ]);

  const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const lines = [
    [p.title],
    [],
    header,
    ...dataRows,
    [],
    [tc("missingNote")],
    [t("disclaimerShort")],
  ].map((row) => row.map((c) => esc(String(c ?? ""))).join(","));

  const csv = "﻿" + lines.join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="matchhub-comparison.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
