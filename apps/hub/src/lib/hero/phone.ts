/** +60 / +62 E.164-ish; Hero compares digits and accepts the local 0… form too. Pure, unit-tested. */
export function normalisePhone(v: string | null | undefined): string | null {
  if (!v) return null;
  const digits = v.replace(/[^\d+]/g, "");
  if (digits.length < 9) return null;
  return digits.startsWith("+") ? digits : digits.startsWith("0") ? digits : `+${digits}`;
}
