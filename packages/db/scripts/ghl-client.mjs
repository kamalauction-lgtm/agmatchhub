/**
 * GoHighLevel v2 (LeadConnector) client — the TypeScript-era port of the
 * proven marketing4u PHP GHLClient and the superapp worker's writeback code.
 *
 * Carries over the pattern that made those testable before credentials
 * existed: when live=false, every method logs its intent and returns a
 * synthetic success (ids prefixed "dryrun:"), so the entire drain pipeline
 * runs end to end with no GHL account at all.
 *
 * Auth: Private Integration bearer token + Version header. The platform
 * database remains the source of truth for everything (§13); GHL only ever
 * receives copies.
 */

const DEFAULT_BASE = "https://services.leadconnectorhq.com";
const DEFAULT_VERSION = "2021-07-28";

export class GhlClient {
  /** @param {{live:boolean, token?:string, locationId?:string, base?:string, version?:string, pipelineId?:string, log?:(m:string)=>void}} opts */
  constructor(opts) {
    this.live = !!opts.live;
    this.token = opts.token ?? "";
    this.locationId = opts.locationId ?? "";
    this.base = (opts.base ?? DEFAULT_BASE).replace(/\/+$/, "");
    this.version = opts.version ?? DEFAULT_VERSION;
    this.pipelineId = opts.pipelineId ?? "";
    this.log = opts.log ?? ((m) => console.log(m));
    this.stageCache = null;

    if (this.live && (!this.token || !this.locationId)) {
      throw new Error("GHL live mode requires GHL_TOKEN and GHL_LOCATION_ID");
    }
  }

  /** @param {string} method @param {string} path @param {object} [body] */
  async request(method, path, body) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Version: this.version,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      // Never echo the payload — it carries buyer PII.
      throw new Error(`GHL ${method} ${path} -> HTTP ${res.status}${json?.message ? `: ${json.message}` : ""}`);
    }
    return json;
  }

  /**
   * Upsert a contact. GHL's own upsert endpoint dedupes on phone/email within
   * the location, which matches our contacts-unique-by-phone model.
   * @returns {Promise<{contactId: string}>}
   */
  async upsertContact({ name, phone, email, source, tags }) {
    if (!this.live) {
      this.log(`  [dry-run] upsert contact ${phone} (${name})`);
      return { contactId: `dryrun:contact:${phone.replace(/^\+/, "")}` };
    }
    const json = await this.request("POST", "/contacts/upsert", {
      locationId: this.locationId,
      name,
      phone,
      email: email || undefined,
      source,
      tags,
    });
    const contactId = json?.contact?.id ?? json?.id;
    if (!contactId) throw new Error("GHL upsert returned no contact id");
    return { contactId };
  }

  /**
   * Pipeline stages, cached per process — the superapp pattern. Stage ids are
   * never hard-coded (§13): looked up by name at runtime.
   */
  async getStageId(stageName) {
    if (!this.live) return `dryrun:stage:${stageName}`;
    if (!this.stageCache) {
      const json = await this.request(
        "GET",
        `/opportunities/pipelines?locationId=${this.locationId}`
      );
      this.stageCache = {};
      for (const p of json?.pipelines ?? []) {
        if (this.pipelineId && p.id !== this.pipelineId) continue;
        for (const s of p.stages ?? []) {
          this.stageCache[s.name.toLowerCase()] = { stageId: s.id, pipelineId: p.id };
        }
      }
    }
    const hit = this.stageCache[stageName.toLowerCase()];
    if (!hit) throw new Error(`GHL pipeline has no stage named "${stageName}"`);
    return hit;
  }

  /**
   * Create an opportunity for a contact.
   * @returns {Promise<{opportunityId: string}>}
   */
  async createOpportunity({ contactId, name, stageName, monetaryValue }) {
    if (!this.live) {
      this.log(`  [dry-run] create opportunity "${name}" @ ${stageName}`);
      return { opportunityId: `dryrun:opp:${contactId}:${Date.now()}` };
    }
    const stage = await this.getStageId(stageName);
    const json = await this.request("POST", "/opportunities/", {
      locationId: this.locationId,
      pipelineId: stage.pipelineId ?? this.pipelineId,
      pipelineStageId: stage.stageId,
      contactId,
      name,
      status: "open",
      monetaryValue: monetaryValue ?? undefined,
    });
    const opportunityId = json?.opportunity?.id ?? json?.id;
    if (!opportunityId) throw new Error("GHL opportunity create returned no id");
    return { opportunityId };
  }
}
