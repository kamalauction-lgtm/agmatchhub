import "server-only";
import { z } from "zod";
import type { StudioInput } from "./listing-writer";
import { runAi, type DeniedReason } from "./engine";

/**
 * The Video Script Writer: a 30-second vertical walkthrough of one listing,
 * scene by scene, with the shot list to film. The deterministic version
 * builds scenes from the rooms the listing actually has; the model writes
 * the spoken lines when it can.
 */
export type VideoScene = { seconds: number; shot: string; voice: string; onScreen: string };
export type VideoScript = {
  title: string; hook: string; scenes: VideoScene[]; cta: string; shotList: string[];
  source: "ai" | "rules"; reason?: DeniedReason | "failed"; model?: string;
};

const schema = z.object({
  title: z.string().min(3).max(80),
  hook: z.string().min(5).max(200),
  scenes: z.array(z.object({ seconds: z.number().int().min(2).max(15), shot: z.string().min(3).max(140), voice: z.string().min(3).max(220), on_screen: z.string().max(60).default("") })).min(3).max(8),
  cta: z.string().min(3).max(200),
  shot_list: z.array(z.string().max(120)).max(8).default([]),
});

function ruleScript(i: StudioInput, locale: "id" | "en" | "ms"): Omit<VideoScript, "source"> {
  const place = [i.area, i.regency].filter(Boolean).join(", ");
  const en = locale === "en", ms = locale === "ms";
  const scenes: VideoScene[] = [
    { seconds: 3, shot: en ? "Exterior / façade, slow walk-in" : ms ? "Luaran / fasad, berjalan masuk perlahan" : "Tampak depan, berjalan masuk perlahan",
      voice: en ? `${i.propertyTypeLabel} ${i.listingType === "rent" ? "for rent" : "for sale"} in ${place || "a great location"}.` : ms ? `${i.propertyTypeLabel} ${i.listingType === "rent" ? "untuk disewa" : "untuk dijual"} di ${place || "lokasi strategik"}.` : `${i.propertyTypeLabel} ${i.listingType === "rent" ? "disewakan" : "dijual"} di ${place || "lokasi strategis"}.`,
      onScreen: place || i.propertyTypeLabel },
    { seconds: 6, shot: en ? "Living area, pan left to right" : ms ? "Ruang tamu, pan kiri ke kanan" : "Ruang tamu, pan kiri ke kanan",
      voice: en ? `${i.buildingSize ? `${i.buildingSize} m² of living space` : "An open living space"}${i.furnishing ? `, ${i.furnishing}` : ""}.` : ms ? `${i.buildingSize ? `Ruang ${i.buildingSize} m²` : "Ruang tamu terbuka"}${i.furnishing ? `, ${i.furnishing}` : ""}.` : `${i.buildingSize ? `Luas bangunan ${i.buildingSize} m²` : "Ruang tamu lega"}${i.furnishing ? `, ${i.furnishing}` : ""}.`,
      onScreen: i.buildingSize ? `${i.buildingSize} m²` : "" },
  ];
  if (i.bedrooms) scenes.push({ seconds: 6, shot: en ? "Main bedroom, then a second bedroom" : ms ? "Bilik utama, kemudian bilik kedua" : "Kamar utama, lalu kamar kedua",
    voice: en ? `${i.bedrooms} bedrooms${i.bathrooms ? `, ${i.bathrooms} bathrooms` : ""}.` : ms ? `${i.bedrooms} bilik tidur${i.bathrooms ? `, ${i.bathrooms} bilik air` : ""}.` : `${i.bedrooms} kamar tidur${i.bathrooms ? `, ${i.bathrooms} kamar mandi` : ""}.`,
    onScreen: `${i.bedrooms} BR${i.bathrooms ? ` · ${i.bathrooms} BA` : ""}` });
  scenes.push({ seconds: 5, shot: en ? "Kitchen, detail of the counter" : ms ? "Dapur, butiran kaunter" : "Dapur, detail meja dapur",
    voice: en ? "The kitchen." : ms ? "Dapur." : "Area dapur.", onScreen: "" });
  if (i.facilities?.length) scenes.push({ seconds: 5, shot: en ? "Facilities (pool / gym / garden)" : ms ? "Kemudahan (kolam / gim / taman)" : "Fasilitas (kolam / gym / taman)",
    voice: (en ? "Facilities: " : ms ? "Kemudahan: " : "Fasilitas: ") + i.facilities.slice(0, 3).join(", ") + ".", onScreen: i.facilities.slice(0, 2).join(" · ") });
  scenes.push({ seconds: 5, shot: en ? "Agent to camera, or price card over the best shot" : ms ? "Ejen ke kamera, atau kad harga atas syot terbaik" : "Agen ke kamera, atau kartu harga di atas shot terbaik",
    voice: en ? "Message me for a viewing — link in bio." : ms ? "Mesej saya untuk lawatan — pautan di bio." : "Chat saya untuk jadwal lihat — link di bio.",
    onScreen: i.price ? `${i.price.toLocaleString()}` : "" });
  return {
    title: i.title.slice(0, 80),
    hook: scenes[0].voice,
    scenes,
    cta: scenes[scenes.length - 1].voice,
    shotList: scenes.map((s) => s.shot),
  };
}

export async function writeVideoScript(input: StudioInput & { listingId: string; currency: string }, ctx: { userId: string; locale: "id" | "en" | "ms" }): Promise<VideoScript> {
  const floor = ruleScript(input, ctx.locale);
  const res = await runAi(
    "video_script",
    {
      listing: {
        title: input.title, listing_type: input.listingType, property_type: input.propertyTypeLabel, province: input.province, regency: input.regency, area: input.area, building: input.buildingName,
        bedrooms: input.bedrooms, bathrooms: input.bathrooms, parking: input.parking, floors: input.floors, land_size_sqm: input.landSize, building_size_sqm: input.buildingSize,
        year_built: input.yearBuilt, furnishing: input.furnishing, condition: input.condition, facilities: input.facilities ?? [], price: input.price, currency: input.currency, rent_period: input.rentPeriod,
      },
      deterministic_scenes: floor.scenes,
    },
    schema,
    { userId: ctx.userId, locale: ctx.locale, refType: "listing", refId: input.listingId, redactInput: false },
  );
  if (res.ok) {
    const o = res.output;
    return { title: o.title, hook: o.hook, scenes: o.scenes.map((s) => ({ seconds: s.seconds, shot: s.shot, voice: s.voice, onScreen: s.on_screen })), cta: o.cta, shotList: o.shot_list.length ? o.shot_list : o.scenes.map((s) => s.shot), source: "ai", model: `${res.provider}/${res.model}` };
  }
  return { ...floor, source: "rules", reason: res.kind === "denied" ? res.reason : "failed" };
}
