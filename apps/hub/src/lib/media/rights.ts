/**
 * The rights evidence behind one photo (P1-a), from its provenance row.
 *
 *   import_authority   an imported photo recorded with the agent's
 *                      listing-import authority consent (P0-e-1a)
 *   partner_agreement  a partner-feed photo recorded under the written partner
 *                      agreement (P0-e-3b, licence_note "partner_agreement:<ref>")
 *   agent_supplied     a photo the agent supplied privately on a moderator's
 *                      change request (P1-b-2, licence_note "agent_upload:request:<id>")
 *   agent_upload       a photo the agent uploaded through the wizard; there is
 *                      no provenance row by design
 *   missing            an imported or partner photo with no usable record —
 *                      it is never published (lib/media/publish.ts)
 *
 * Pure: no imports, used by the moderation and photo-review screens, by
 * publication and by unit tests.
 */

export type RightsBasis = "import_authority" | "partner_agreement" | "agent_supplied" | "agent_upload" | "missing";

export type ProvenanceFacts = { consent_record_id: string | null; licence_note: string | null } | null | undefined;

export function rightsBasis(storagePath: string, provenance: ProvenanceFacts): RightsBasis {
  if (!storagePath.startsWith("listing-media-intake/")) return "agent_upload";
  if (!provenance) return "missing";
  if (provenance.consent_record_id) return "import_authority";
  const note = provenance.licence_note ?? "";
  if (/^partner_agreement:\S/.test(note)) return "partner_agreement";
  if (/^agent_upload:request:[0-9a-f-]{36}$/.test(note)) return "agent_supplied";
  return "missing";
}

/** The agreement reference, for display, when the basis is a partner agreement. */
export function agreementRef(provenance: ProvenanceFacts): string | null {
  const m = (provenance?.licence_note ?? "").match(/^partner_agreement:(.+)$/);
  return m ? m[1] : null;
}
