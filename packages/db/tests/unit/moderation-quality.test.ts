import { describe, it, expect } from "vitest";
import { rightsBasis, agreementRef } from "../../../../apps/hub/src/lib/media/rights";
import { photoStatus, summarisePhotos, REJECTION_CODES } from "../../../../apps/hub/src/lib/listings/moderation";
import { itemQuality, itemChanges } from "../../../../apps/hub/src/lib/import/quality";

/** P1-a: the pure rules behind the moderation, photo-review and batch-review screens. */

const intake = "listing-media-intake/a/l/src-0123456789abcdef.jpg";

describe("rights evidence", () => {
  it("names the basis, and anything without a record is missing", () => {
    expect(rightsBasis("listing-media-public/a/l/0.jpg", null)).toBe("agent_upload");
    expect(rightsBasis(intake, null)).toBe("missing");
    expect(rightsBasis(intake, { consent_record_id: "c", licence_note: null })).toBe("import_authority");
    expect(rightsBasis(intake, { consent_record_id: null, licence_note: "partner_agreement:HERO-2026-01" })).toBe("partner_agreement");
    expect(rightsBasis(intake, { consent_record_id: null, licence_note: "partner_agreement:" })).toBe("missing");
    expect(rightsBasis(intake, { consent_record_id: null, licence_note: "fixture" })).toBe("missing");
    // P1-b-2: a photo the agent supplied privately on a change request.
    expect(rightsBasis(intake, { consent_record_id: null, licence_note: "agent_upload:request:0b3f3c1e-9c1a-4c55-9a0b-4f0f2a1d2c3e" })).toBe("agent_supplied");
    expect(rightsBasis(intake, { consent_record_id: null, licence_note: "agent_upload:request:not-an-id" })).toBe("missing");
    expect(agreementRef({ consent_record_id: null, licence_note: "partner_agreement:HERO-2026-01" })).toBe("HERO-2026-01");
  });
});

describe("photo status", () => {
  it("tells paused (quota, cap) apart from simply queued", () => {
    expect(photoStatus({ processing_state: "pending", processing_error: null })).toBe("queued");
    expect(photoStatus({ processing_state: "pending", processing_error: "paused_quota" })).toBe("paused_quota");
    expect(photoStatus({ processing_state: "pending", processing_error: "paused_cap" })).toBe("paused_cap");
    expect(photoStatus({ processing_state: "quarantined", processing_error: null })).toBe("kept_out");
    expect(photoStatus({ processing_state: "processed", processing_error: null })).toBe("awaiting_approval");
  });

  it("counts what approval will publish: live, or processed WITH rights evidence", () => {
    const rows = [
      { id: "1", storage_path: "listing-media-public/a/l/0.jpg", processing_state: "ready", processing_error: null, processing_attempts: 0 },
      { id: "2", storage_path: intake, processing_state: "processed", processing_error: null, processing_attempts: 1 },
      { id: "3", storage_path: intake, processing_state: "processed", processing_error: null, processing_attempts: 1 },
      { id: "4", storage_path: intake, processing_state: "failed", processing_error: "x", processing_attempts: 3 },
      { id: "5", storage_path: intake, processing_state: "removed", processing_error: null, processing_attempts: 0 },
    ];
    const prov = new Map([["2", { consent_record_id: "c", licence_note: null }]]);
    const s = summarisePhotos(rows, prov);
    expect(s.total).toBe(4);                 // removed photos are not part of the listing
    expect(s.willPublish).toBe(2);           // the live one and the processed one with consent
    expect(s.rightsMissing).toBe(2);         // photo 3 and the failed photo 4 have no record
    expect(s.byStatus).toEqual({ live: 1, awaiting_approval: 2, failed: 1 });
  });

  it("rejection codes match the 00114 constraint", () => {
    expect([...REJECTION_CODES].sort()).toEqual([
      "duplicate", "incomplete_details", "other", "photos_quality", "photos_rights", "price_unrealistic", "prohibited_content", "wrong_location",
    ]);
  });
});

describe("batch review", () => {
  it("scores completeness from source plus edits, and names what is missing", () => {
    const q = itemQuality({ extracted: { title: "Terrace", price: 900000, listingType: "sale", propertyType: "terrace", city: "Petaling" }, overrides: { bedrooms: 3 } });
    expect(q.missing).toEqual(["size", "description", "photos"]);
    expect(q.score).toBe(67);
    expect(itemQuality({}).score).toBe(0);
  });

  it("lists exactly the fields edited away from the source", () => {
    const changes = itemChanges({ extracted: { title: "A", price: 100, bedrooms: 2 }, overrides: { title: "B", price: 100, bathrooms: 1 } });
    expect(changes).toEqual([{ field: "title", from: "A", to: "B" }, { field: "bathrooms", from: null, to: 1 }]);
  });
});

describe("money display", () => {
  it("keeps rupiah exactly as before and formats ringgit in its own convention", async () => {
    const { money } = await import("../../../../apps/hub/src/lib/listings/format");
    expect(money("IDR", 3200000000, null)).toBe("IDR 3.200.000.000");
    expect(money("IDR", 25000000, "monthly")).toBe("IDR 25.000.000/bln");
    // Intl separates the symbol with a non-breaking space, which keeps the price on one line.
    const sp = (x: string) => x.replace(/ /g, " ");
    expect(sp(money("MYR", 880000, null))).toBe("RM 880,000");
    expect(sp(money("MYR", 4500, "monthly"))).toBe("RM 4,500/mo");
  });
});
