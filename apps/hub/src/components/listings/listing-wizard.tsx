"use client";

import { useState, useTransition } from "react";
import { draftListingCopy, reviewListingCopy } from "@/app/(agent)/listings/ai-actions";

/**
 * Multi-step listing wizard.
 *
 * The old form was one long page — the single worst shape for the agents this
 * platform serves, who fill it in on a phone between viewings. A wizard keeps
 * each screen to a few decisions, shows progress, and never loses work.
 *
 * Structure follows the pattern the benchmark converged on: a progress list, a
 * short step body, and Back/Next pinned at the bottom. Choices that matter are
 * cards, not dropdowns; counts are steppers, not text inputs.
 *
 * Everything is client state until the final submit, which posts one FormData
 * to the existing server action — so validation, quota and the storage upload
 * stay exactly where they were.
 */

type Loc = { id: string; name: string; level: string; path_names: string[] };

export type WizardLabels = Record<string, string>;

const STEPS = ["type", "location", "unit", "price", "description", "photos", "review"] as const;
type Step = (typeof STEPS)[number];

/**
 * Property types offered per category. An agent choosing "Residensial" must
 * not be shown Gudang or Pabrik — the old list showed all fifteen regardless,
 * which let a warehouse be filed as a home.
 *
 * Land appears under both because a plot is sold as residential or commercial
 * depending on its zoning, and the agent is the one who knows which.
 */
const TYPES_BY_CATEGORY: Record<string, readonly string[]> = {
  residential: ["rumah", "apartemen", "kondominium", "villa", "kost", "tanah", "kavling", "lainnya"],
  commercial: ["ruko", "rukan", "kantor", "toko", "hotel", "gudang", "pabrik", "tanah", "kavling", "lainnya"],
};

/**
 * The stored category is derived from the chosen TYPE, not from the card.
 * Two cards keep the choice simple for the agent while the database still
 * gets precise values, which is what marketplace filters read.
 */
function categoryForType(type: string, picked: string): string {
  if (["gudang", "pabrik"].includes(type)) return "industrial";
  if (["tanah", "kavling"].includes(type)) return "land";
  if (["rumah", "apartemen", "kondominium", "villa", "kost"].includes(type)) return "residential";
  if (["ruko", "rukan", "kantor", "toko", "hotel"].includes(type)) return "commercial";
  return picked === "commercial" ? "commercial" : "other";
}

const OWNERSHIP = ["shm", "hgb", "hgu", "hp", "hbg", "girik", "strata", "ppjb", "adat", "lainnya"] as const;

export function ListingWizard({
  action,
  locations,
  t,
  typeLabels,
  ownershipLabels,
}: {
  action: (fd: FormData) => void;
  locations: Loc[];
  t: WizardLabels;
  typeLabels: Record<string, string>;
  ownershipLabels: Record<string, string>;
}) {
  const [step, setStep] = useState<Step>("type");
  const [pending, startTransition] = useTransition();
  const [aiBusy, setAiBusy] = useState(false);
  const [descMode, setDescMode] = useState<"choose" | "self" | "ai">("choose");
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [advice, setAdvice] = useState<{ key: string; severity: string }[]>([]);

  const [f, setF] = useState({
    listingType: "sale" as "sale" | "rent",
    rentPeriod: "monthly" as "monthly" | "yearly",
    propertyCategory: "residential",
    propertyType: "rumah",
    ownershipType: "",
    locationId: "",
    generalAddress: "",
    buildingName: "",
    postalCode: "",
    bedrooms: 0,
    bathrooms: 0,
    parkingSpaces: 0,
    floors: 0,
    landSize: "",
    buildingSize: "",
    yearBuilt: "",
    furnishing: "",
    condition: "",
    facilities: "",
    price: "",
    title: "",
    description: "",
  });

  const [photos, setPhotos] = useState<FileList | null>(null);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const idx = STEPS.indexOf(step);
  const location = locations.find((l) => l.id === f.locationId);

  function writerInput() {
    return {
      listingType: f.listingType,
      propertyTypeLabel: typeLabels[f.propertyType] ?? f.propertyType,
      province: location?.path_names?.[0] ?? null,
      regency: location?.path_names?.[1] ?? null,
      area: f.generalAddress || null,
      buildingName: f.buildingName || null,
      bedrooms: f.bedrooms || null,
      bathrooms: f.bathrooms || null,
      parking: f.parkingSpaces || null,
      floors: f.floors || null,
      landSize: f.landSize ? Number(f.landSize) : null,
      buildingSize: f.buildingSize ? Number(f.buildingSize) : null,
      yearBuilt: f.yearBuilt ? Number(f.yearBuilt) : null,
      furnishing: f.furnishing || null,
      condition: f.condition || null,
      ownership: f.ownershipType || null,
      facilities: f.facilities ? f.facilities.split(",").map((s) => s.trim()).filter(Boolean) : [],
      price: f.price ? Number(f.price) : null,
      rentPeriod: f.listingType === "rent" ? f.rentPeriod : null,
    };
  }

  async function askAi() {
    setAiBusy(true);
    try {
      const r = await draftListingCopy(writerInput());
      setTitleOptions(r.titles);
      setF((prev) => ({
        ...prev,
        title: prev.title || r.titles[0] || "",
        description: r.description,
      }));
      setAdvice(r.advice);
      setDescMode("ai");
    } finally {
      setAiBusy(false);
    }
  }

  async function review() {
    setAiBusy(true);
    try {
      setAdvice(
        await reviewListingCopy({
          title: f.title,
          description: f.description,
          bedrooms: f.bedrooms || null,
          regency: location?.path_names?.[1] ?? null,
          area: f.generalAddress || null,
          listingType: f.listingType,
        })
      );
    } finally {
      setAiBusy(false);
    }
  }

  function submit() {
    const fd = new FormData();
    fd.set("listingType", f.listingType);
    if (f.listingType === "rent") fd.set("rentPeriod", f.rentPeriod);
    fd.set("propertyCategory", categoryForType(f.propertyType, f.propertyCategory));
    fd.set("propertyType", f.propertyType);
    fd.set("ownershipType", f.ownershipType);
    fd.set("locationId", f.locationId);
    fd.set("generalAddress", f.generalAddress);
    fd.set("buildingName", f.buildingName);
    fd.set("postalCode", f.postalCode);
    fd.set("bedrooms", f.bedrooms ? String(f.bedrooms) : "");
    fd.set("bathrooms", f.bathrooms ? String(f.bathrooms) : "");
    fd.set("parkingSpaces", f.parkingSpaces ? String(f.parkingSpaces) : "");
    fd.set("floors", f.floors ? String(f.floors) : "");
    fd.set("landSize", f.landSize);
    fd.set("buildingSize", f.buildingSize);
    fd.set("yearBuilt", f.yearBuilt);
    fd.set("furnishing", f.furnishing);
    fd.set("condition", f.condition);
    fd.set("facilities", f.facilities);
    fd.set("price", f.price);
    fd.set("title", f.title);
    fd.set("description", f.description);
    if (photos) Array.from(photos).forEach((p) => fd.append("photos", p));
    startTransition(() => action(fd));
  }

  // Enough to move on — deliberately lenient except where the server insists.
  const canAdvance: Record<Step, boolean> = {
    type: true,
    location: true,
    unit: true,
    price: Number(f.price) > 0,
    description: f.title.trim().length >= 10,
    photos: true,
    review: true,
  };

  const input =
    "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm";
  const label = "text-xs font-semibold uppercase tracking-wide text-muted";

  return (
    <div className="sm:flex sm:gap-8">
      {/* Progress ------------------------------------------------------- */}
      <aside className="mb-6 shrink-0 sm:mb-0 sm:w-48">
        <p className="mb-3 text-sm font-semibold">{t.progress}</p>
        <ol className="flex gap-2 overflow-x-auto sm:block sm:space-y-1">
          {STEPS.map((s, i) => {
            const done = i < idx;
            const current = s === step;
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => i <= idx && setStep(s)}
                  disabled={i > idx}
                  className={`flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${
                    current
                      ? "bg-crimson-soft font-semibold text-crimson"
                      : done
                        ? "text-foreground hover:bg-surface"
                        : "text-muted"
                  }`}
                >
                  <span aria-hidden className="text-xs">
                    {done ? "✓" : i + 1}
                  </span>
                  {t[`step_${s}`]}
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* Body ----------------------------------------------------------- */}
      <div className="min-w-0 flex-1">
        {step === "type" && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold">{t.step_type}</h2>

            <div>
              <p className={label}>{t.categoryQ}</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {[
                  ["residential", t.catResidential, t.catResidentialHint, "🏠"],
                  ["commercial", t.catCommercial, t.catCommercialHint, "🏢"],
                ].map(([v, title, hint, icon]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      const list = TYPES_BY_CATEGORY[v] ?? [];
                      setF((prev) => ({
                        ...prev,
                        propertyCategory: v,
                        // Reset the type when it does not exist in the new
                        // category, so the pair is always valid.
                        propertyType: list.includes(prev.propertyType) ? prev.propertyType : list[0],
                      }));
                    }}
                    className={`rounded-xl border p-4 text-left ${
                      f.propertyCategory === v
                        ? "border-crimson bg-crimson-soft"
                        : "border-line hover:border-crimson/40"
                    }`}
                  >
                    <span aria-hidden className="text-xl">{icon}</span>
                    <p className="mt-1 font-semibold">{title}</p>
                    <p className="text-xs text-muted">{hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className={label}>{t.forQ}</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {[
                  ["sale", t.forSale, "🏷️"],
                  ["rent", t.forRent, "🔑"],
                ].map(([v, title, icon]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set("listingType", v as "sale" | "rent")}
                    className={`rounded-xl border p-4 text-left ${
                      f.listingType === v
                        ? "border-crimson bg-crimson-soft"
                        : "border-line hover:border-crimson/40"
                    }`}
                  >
                    <span aria-hidden className="text-xl">{icon}</span>
                    <p className="mt-1 font-semibold">{title}</p>
                  </button>
                ))}
              </div>
            </div>

            {f.listingType === "rent" && (
              <div>
                <label className={label} htmlFor="rp">{t.rentPeriod}</label>
                <select id="rp" value={f.rentPeriod} className={`mt-1 ${input}`}
                  onChange={(e) => set("rentPeriod", e.target.value as "monthly" | "yearly")}>
                  <option value="monthly">{t.monthly}</option>
                  <option value="yearly">{t.yearly}</option>
                </select>
              </div>
            )}

            <div>
              <label className={label} htmlFor="pt">{t.propertyType}</label>
              <select id="pt" value={f.propertyType} className={`mt-1 ${input}`}
                onChange={(e) => set("propertyType", e.target.value)}>
                {(TYPES_BY_CATEGORY[f.propertyCategory] ?? []).map((p) => (
                  <option key={p} value={p}>{typeLabels[p] ?? p}</option>
                ))}
              </select>
            </div>
          </section>
        )}

        {step === "location" && (
          <section className="space-y-5">
            <h2 className="text-lg font-semibold">{t.step_location}</h2>
            <div>
              <label className={label} htmlFor="loc">{t.area}</label>
              <select id="loc" value={f.locationId} className={`mt-1 ${input}`}
                onChange={(e) => set("locationId", e.target.value)}>
                <option value="">—</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {(l.path_names ?? []).join(" › ") || l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="ga">{t.generalAddress}</label>
              <input id="ga" value={f.generalAddress} maxLength={200} className={`mt-1 ${input}`}
                placeholder={t.generalAddressPlaceholder}
                onChange={(e) => set("generalAddress", e.target.value)} />
              <p className="mt-1 text-xs text-muted">{t.generalAddressHelp}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="bn">{t.buildingName}</label>
                <input id="bn" value={f.buildingName} maxLength={120} className={`mt-1 ${input}`}
                  onChange={(e) => set("buildingName", e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="pc">{t.postalCode}</label>
                <input id="pc" value={f.postalCode} maxLength={10} inputMode="numeric"
                  className={`mt-1 ${input}`} onChange={(e) => set("postalCode", e.target.value)} />
              </div>
            </div>
          </section>
        )}

        {step === "unit" && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold">{t.step_unit}</h2>

            <div className="space-y-1">
              {([
                ["bedrooms", t.bedrooms],
                ["bathrooms", t.bathrooms],
                ["parkingSpaces", t.parking],
                ["floors", t.floors],
              ] as const).map(([k, lab]) => (
                <div key={k} className="flex items-center justify-between border-b border-line py-3">
                  <span className="text-sm font-medium">{lab}</span>
                  <Stepper
                    value={f[k] as number}
                    onChange={(v) => set(k, v as never)}
                    decreaseLabel={t.decrease}
                    increaseLabel={t.increase}
                    emptyLabel={t.select}
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="ls">{t.landSize}</label>
                <input id="ls" type="number" min={0} value={f.landSize} className={`mt-1 ${input}`}
                  onChange={(e) => set("landSize", e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="bs">{t.buildingSize}</label>
                <input id="bs" type="number" min={0} value={f.buildingSize} className={`mt-1 ${input}`}
                  onChange={(e) => set("buildingSize", e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="yb">{t.yearBuilt}</label>
                <input id="yb" type="number" min={1900} max={2100} value={f.yearBuilt}
                  className={`mt-1 ${input}`} onChange={(e) => set("yearBuilt", e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="ow">{t.certificate}</label>
                <select id="ow" value={f.ownershipType} className={`mt-1 ${input}`}
                  onChange={(e) => set("ownershipType", e.target.value)}>
                  <option value="">—</option>
                  {OWNERSHIP.map((o) => (
                    <option key={o} value={o}>{ownershipLabels[o] ?? o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="fu">{t.furnishing}</label>
                <select id="fu" value={f.furnishing} className={`mt-1 ${input}`}
                  onChange={(e) => set("furnishing", e.target.value)}>
                  <option value="">—</option>
                  <option value="unfurnished">{t.unfurnished}</option>
                  <option value="partially">{t.partially}</option>
                  <option value="fully">{t.fully}</option>
                </select>
              </div>
              <div>
                <label className={label} htmlFor="co">{t.condition}</label>
                <select id="co" value={f.condition} className={`mt-1 ${input}`}
                  onChange={(e) => set("condition", e.target.value)}>
                  <option value="">—</option>
                  <option value="new">{t.condNew}</option>
                  <option value="excellent">{t.condExcellent}</option>
                  <option value="good">{t.condGood}</option>
                  <option value="needs_renovation">{t.condRenovation}</option>
                  <option value="under_construction">{t.condConstruction}</option>
                </select>
              </div>
            </div>

            <div>
              <label className={label} htmlFor="fa">{t.facilities}</label>
              <input id="fa" value={f.facilities} maxLength={500} className={`mt-1 ${input}`}
                placeholder={t.facilitiesPlaceholder}
                onChange={(e) => set("facilities", e.target.value)} />
            </div>
          </section>
        )}

        {step === "price" && (
          <section className="space-y-5">
            <h2 className="text-lg font-semibold">{t.step_price}</h2>
            <div>
              <label className={label} htmlFor="pr">{t.price} *</label>
              <input id="pr" type="number" min={1} value={f.price} inputMode="numeric"
                placeholder="2150000000" className={`mt-1 ${input} text-lg font-semibold`}
                onChange={(e) => set("price", e.target.value)} />
              <p className="mt-1 text-xs text-muted">{t.priceHelp}</p>
              {Number(f.price) > 0 && (
                <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm font-semibold">
                  IDR {Number(f.price).toLocaleString("id-ID")}
                  {f.listingType === "rent" && (f.rentPeriod === "monthly" ? " /bln" : " /thn")}
                </p>
              )}
            </div>
          </section>
        )}

        {step === "description" && (
          <section className="space-y-5">
            <h2 className="text-lg font-semibold">{t.step_description}</h2>

            {descMode === "choose" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setDescMode("self")}
                  className="rounded-xl border border-line p-5 text-left hover:border-crimson/40">
                  <span aria-hidden className="text-2xl">✍️</span>
                  <p className="mt-2 font-semibold">{t.writeSelf}</p>
                  <p className="mt-1 text-sm text-muted">{t.writeSelfHint}</p>
                </button>
                <button type="button" onClick={askAi} disabled={aiBusy}
                  className="rounded-xl border border-crimson bg-crimson-soft p-5 text-left hover:opacity-90 disabled:opacity-60">
                  <span aria-hidden className="text-2xl">✨</span>
                  <p className="mt-2 font-semibold text-crimson">
                    {aiBusy ? t.aiWorking : t.writeAi}
                  </p>
                  <p className="mt-1 text-sm text-muted">{t.writeAiHint}</p>
                </button>
              </div>
            ) : (
              <>
                {titleOptions.length > 0 && (
                  <div>
                    <p className={label}>{t.titleSuggestions}</p>
                    <div className="mt-2 space-y-2">
                      {titleOptions.map((opt) => (
                        <button key={opt} type="button" onClick={() => set("title", opt)}
                          className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${
                            f.title === opt ? "border-crimson bg-crimson-soft" : "border-line hover:bg-surface"
                          }`}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className={label} htmlFor="ti">{t.adTitle} *</label>
                  <input id="ti" value={f.title} minLength={10} maxLength={150}
                    placeholder={t.adTitlePlaceholder} className={`mt-1 ${input}`}
                    onChange={(e) => set("title", e.target.value)} />
                  <p className="mt-1 text-xs text-muted">{f.title.length}/150</p>
                </div>

                <div>
                  <label className={label} htmlFor="de">{t.description}</label>
                  <textarea id="de" rows={10} maxLength={5000} value={f.description}
                    className={`mt-1 ${input}`} onChange={(e) => set("description", e.target.value)} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={review} disabled={aiBusy}
                    className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-surface disabled:opacity-60">
                    {aiBusy ? t.aiWorking : t.checkCopy}
                  </button>
                  {descMode === "self" && (
                    <button type="button" onClick={askAi} disabled={aiBusy}
                      className="rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-60">
                      {t.writeAi}
                    </button>
                  )}
                </div>

                {advice.length > 0 && (
                  <ul className="space-y-2">
                    {advice.map((a) => (
                      <li key={a.key}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          a.severity === "fix"
                            ? "bg-danger/5 text-danger"
                            : a.severity === "good"
                              ? "bg-success/10 text-success"
                              : "bg-warning/5 text-warning"
                        }`}>
                        {t[`advice_${a.key}`] ?? a.key}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )}

        {step === "photos" && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{t.step_photos}</h2>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple
              onChange={(e) => setPhotos(e.target.files)}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-4 file:py-2.5 file:text-sm file:font-semibold" />
            <p className="text-xs text-muted">{t.photosHelp}</p>
            {photos && photos.length > 0 && (
              <p className="text-sm font-medium text-success">
                {t.photosChosen.replace("{n}", String(photos.length))}
              </p>
            )}
          </section>
        )}

        {step === "review" && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{t.step_review}</h2>
            <dl className="rounded-xl border border-line divide-y divide-line text-sm">
              {[
                [t.propertyType, typeLabels[f.propertyType] ?? f.propertyType],
                [t.forQ, f.listingType === "sale" ? t.forSale : t.forRent],
                [t.area, location ? (location.path_names ?? []).join(" › ") : "—"],
                [t.price, f.price ? `IDR ${Number(f.price).toLocaleString("id-ID")}` : "—"],
                [t.adTitle, f.title || "—"],
                [t.step_photos, photos ? String(photos.length) : "0"],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-muted">{t.submitHelp}</p>
          </section>
        )}

        {/* Footer -------------------------------------------------------- */}
        <div className="sticky bottom-16 z-10 mt-8 -mx-4 flex items-center gap-3 border-t border-line bg-background/95 px-4 py-3 backdrop-blur sm:bottom-0">
          {idx > 0 && (
            <button type="button" onClick={() => setStep(STEPS[idx - 1])}
              className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:bg-surface">
              {t.back}
            </button>
          )}
          <div className="flex-1" />
          {step !== "review" ? (
            <button type="button" disabled={!canAdvance[step]}
              onClick={() => setStep(STEPS[idx + 1])}
              className="rounded-lg bg-crimson px-6 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-40">
              {t.next}
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={pending}
              className="rounded-lg bg-crimson px-6 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong disabled:opacity-60">
              {pending ? t.submitting : t.submit}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** −/+ counter. Typing a number on a phone keyboard is slower than tapping. */
function Stepper({
  value,
  onChange,
  decreaseLabel,
  increaseLabel,
  emptyLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
  emptyLabel: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label={decreaseLabel} disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="grid h-9 w-9 place-items-center rounded-full border border-line text-lg disabled:opacity-30">
        −
      </button>
      <span className="w-12 text-center text-sm font-semibold">
        {value > 0 ? value : <span className="text-muted">{emptyLabel}</span>}
      </span>
      <button type="button" aria-label={increaseLabel}
        onClick={() => onChange(value + 1)}
        className="grid h-9 w-9 place-items-center rounded-full border border-line text-lg">
        +
      </button>
    </div>
  );
}
