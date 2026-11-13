"use client";

import { useState } from "react";

/**
 * Country and licence type together: the licence list follows the country,
 * so a negotiator in Indonesia is never offered a Malaysian REN. When the
 * country is already fixed on the profile it is shown, not editable.
 */
export function CountryLicenceFields({
  countries,
  fixedCountry,
  defaultCountry,
  defaultLicence,
  labels,
  className,
}: {
  countries: { code: string; name: string; licences: { value: string; label: string }[] }[];
  fixedCountry: string | null;
  defaultCountry: string;
  defaultLicence: string | null;
  labels: { country: string; licenceType: string; fixedHint: string };
  className: string;
}) {
  const [country, setCountry] = useState(fixedCountry ?? defaultCountry);
  const licences = countries.find((c) => c.code === country)?.licences ?? [];
  const initial = licences.some((l) => l.value === defaultLicence) ? defaultLicence! : licences[0]?.value ?? "";

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.country}</span>
        {fixedCountry ? (
          <>
            <input type="hidden" name="countryCode" value={fixedCountry} />
            <input
              readOnly
              value={countries.find((c) => c.code === fixedCountry)?.name ?? fixedCountry}
              className={`${className} bg-surface text-muted`}
            />
            <span className="mt-1 block text-xs text-muted">{labels.fixedHint}</span>
          </>
        ) : (
          <select name="countryCode" required value={country} onChange={(e) => setCountry(e.target.value)} className={className}>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        )}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.licenceType}</span>
        <select key={country} name="licenceType" required defaultValue={initial} className={className}>
          {licences.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </label>
    </>
  );
}
