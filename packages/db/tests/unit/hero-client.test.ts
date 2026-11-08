import { describe, it, expect } from "vitest";
import { parseHeroStatus } from "../../../../apps/hub/src/lib/hero/client";
import { normalisePhone } from "../../../../apps/hub/src/lib/hero/phone";
import { benefitDateInput, benefitExpiryIso, benefitReviewIso } from "../../../../apps/hub/src/lib/hero/dates";

/** The partner-API response → our shape. Fields may be added by Hero; never assumed. */
describe("parseHeroStatus()", () => {
  it("reads the v1 contract and tolerates the Phase 2 fields when present", () => {
    const v1 = parseHeroStatus({ found: true, account_created_at: "2026-10-14T10:02:00+08:00", first_login_at: "2026-10-14T10:05:00+08:00", last_login_at: null });
    expect(v1).toMatchObject({ ok: true, found: true, firstLoginAt: "2026-10-14T10:05:00+08:00", lastLoginAt: null, country: null, membershipStatus: null });
    const v2 = parseHeroStatus({ found: true, first_login_at: "x", country: "MY", membership_status: "active" });
    expect(v2).toMatchObject({ found: true, country: "MY", membershipStatus: "active" });
  });
  it("maps found:false, and rejects anything else", () => {
    expect(parseHeroStatus({ found: false })).toEqual({ configured: true, ok: true, found: false });
    expect(parseHeroStatus({ ok: true })).toBeNull();
    expect(parseHeroStatus("nope")).toBeNull();
  });
});

describe("benefit dates round-trip in the platform time zone", () => {
  it("date input ↔ instant is stable across saves", () => {
    const stored = "2027-06-30T15:59:59.000Z"; // 23:59:59 KL, the migration default
    expect(benefitDateInput(stored)).toBe("2027-06-30");
    expect(benefitExpiryIso("2027-06-30")).toBe(stored);
    expect(benefitDateInput(benefitExpiryIso(benefitDateInput(stored)))).toBe("2027-06-30");
    expect(benefitReviewIso("2027-06-01")).toBe("2027-06-01T01:00:00.000Z");
  });
});

describe("normalisePhone()", () => {
  it("keeps + and local forms, strips formatting, rejects fragments", () => {
    expect(normalisePhone("+60 12-345 6789")).toBe("+60123456789");
    expect(normalisePhone("0812-3456-7890")).toBe("081234567890");
    expect(normalisePhone("62 812 3456 7890")).toBe("+6281234567890");
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone(null)).toBeNull();
  });
});
