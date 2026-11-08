import { describe, it, expect } from "vitest";
import { hasEnv, raClient } from "./setup";

/**
 * 00093 — the Malaysian location matcher and the two-country front door.
 * Same contract as match_regency: exactly one place or nothing.
 */
describe.skipIf(!hasEnv)("ingest location matching (00093)", () => {
  const my = async (text: string) => {
    const ra = await raClient();
    const { data, error } = await ra.rpc("match_location_my", { p_text: text });
    expect(error, error?.message).toBeNull();
    return (data ?? [])[0] as { township: string | null; district: string; state: string; level: string } | undefined;
  };

  it("resolves a township with its district and state", async () => {
    expect(await my("Mont Kiara, Kuala Lumpur")).toMatchObject({ township: "Mont Kiara", district: "Kuala Lumpur", state: "Kuala Lumpur", level: "township" });
    expect(await my("Double storey terrace at Petaling Jaya, Selangor")).toMatchObject({ township: "Petaling Jaya", district: "Petaling", state: "Selangor" });
  });

  it("falls back to the district when no township is named, and prefers the longer name", async () => {
    expect(await my("Johor Bahru")).toMatchObject({ township: null, district: "Johor Bahru", state: "Johor", level: "district" });
    expect(await my("Seremban 2, Negeri Sembilan")).toMatchObject({ township: "Seremban 2", district: "Seremban" });
  });

  it("returns nothing for a state alone, a foreign place, or an empty text", async () => {
    expect(await my("Selangor")).toBeUndefined();
    expect(await my("Jakarta Selatan")).toBeUndefined();
    expect(await my("")).toBeUndefined();
    expect(await my("Kiara")).toBeUndefined(); // partial word never matches
  });

  it("match_location routes by country and answers in the properties shape", async () => {
    const ra = await raClient();
    const { data: id } = await ra.rpc("match_location", { p_country: "ID", p_text: "Jakarta Selatan" });
    expect(id?.[0]).toMatchObject({ province_name: "DKI Jakarta", regency_name: "Jakarta Selatan", level: "regency" });
    const { data: myRow } = await ra.rpc("match_location", { p_country: "MY", p_text: "Shah Alam, Selangor" });
    expect(myRow?.[0]).toMatchObject({ province_name: "Selangor", regency_name: "Petaling", place_name: "Shah Alam", level: "township" });
    // The Indonesian matcher never answers a Malaysian text and vice versa.
    const { data: cross } = await ra.rpc("match_location", { p_country: "ID", p_text: "Shah Alam, Selangor" });
    expect(cross ?? []).toHaveLength(0);
  });
});
