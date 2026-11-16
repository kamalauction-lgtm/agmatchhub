/**
 * Licence types are country configuration (00128): countries.terminology
 * .licence_fields, e.g. MY → REN, REA, PEA; ID → AGEN_PROPERTI, BROKER.
 * A country with none configured offers only OTHER, so a new market works
 * before anyone has filled its list in. Nothing here names a country.
 */
export const LICENCE_TYPE_RE = /^[A-Z][A-Z_]{1,29}$/;

export function licenceTypesFor(terminology: unknown): string[] {
  const raw = (terminology as { licence_fields?: unknown } | null)?.licence_fields;
  const list = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string" && LICENCE_TYPE_RE.test(v))
    : [];
  return list.length ? list : ["OTHER"];
}
