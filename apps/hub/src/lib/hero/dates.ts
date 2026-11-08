/**
 * The launch-benefit dates are calendar days in the platform's business time
 * zone (Asia/Kuala_Lumpur, UTC+8, no daylight saving), not instants: "ends
 * 30 June 2027" means 23:59:59 that day in KL, whoever saves the form and
 * wherever the server runs. Rendering a timestamptz into a datetime-local
 * input and parsing it back in server-local time shifted the value by the
 * server's UTC offset on every save (seen on 7 Nov 2026), so the form carries
 * a date only and these two helpers own the conversion.
 */
export const BENEFIT_TZ = "Asia/Kuala_Lumpur";
const OFFSET = "+08:00";

/** ISO instant → "YYYY-MM-DD" in the benefit time zone, for a date input. */
export function benefitDateInput(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BENEFIT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** "YYYY-MM-DD" → the last second of that day in the benefit time zone. */
export function benefitExpiryIso(date: string): string {
  return new Date(`${date}T23:59:59${OFFSET}`).toISOString();
}

/** "YYYY-MM-DD" → 09:00 that day in the benefit time zone (reminder time). */
export function benefitReviewIso(date: string): string {
  return new Date(`${date}T09:00:00${OFFSET}`).toISOString();
}
