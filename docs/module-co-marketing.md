# Module design — Co-Marketing (Pemasaran Bersama)

*Design v1, 4 Aug 2026. Not built. Written from Kamal's product brief plus the
PropMall benchmark ([benchmark](benchmark-agent-dashboards.md) §2.5).*

## 1. The idea, in Kamal's words

An agent who holds a listing — **with valid documents and a clear commission**
— grants permission for other agents to market that property on their own
landing page. The contact details shown to the public swap to the **marketing
agent**. In the dashboard, everyone still knows who the real listing agent is
and who is dealing. A newer agent can therefore assemble a large inventory on
their own page and have real stock to work, choosing by **area, property type
and so on**.

This is the feature Kamal likes most in PropMall. Our job is not to copy it but
to build the version that platform cannot: **co-marketing with enforceable,
versioned commission terms and a document gate.**

## 2. Why we can beat the benchmark here

PropMall ships the mechanic — a `Co-Marketing` action on each listing card, and
two notification types. What it does not appear to have, and we already own:

| We already have | Built in |
|---|---|
| Versioned, dual-accepted commission agreements with server-side split validation | 00015, `propose_commission_version` / `accept_commission_version` |
| Owner-authorisation status on the property | 00030 `property_private.owner_authorisation_status` |
| Append-only audit on every privileged action | 00001 `log_audit()` |
| Legal disclosure + acknowledgement machinery | 00018 |
| Projection layer that decides exactly what each audience sees | `lib/projections/` |
| Location hierarchy for area filtering | 00029, 7,215 kecamatan |

So the differentiator is one sentence: **on PropMall you pick up a listing; here
you pick up a listing under a commission agreement that both sides have
accepted and neither can silently change.**

## 3. Roles

- **Listing Agent (LA)** — holds the property and the owner mandate. Publishes
  co-marketing terms.
- **Marketing Agent (MA)** — picks the listing up and markets it as their own
  inventory, with their contact details public.
- **Buyer** — sees only the MA. Never learns the LA exists.
- **Admin** — sees everything; resolves conflicts and disputes.

## 4. Hard invariants

1. **A listing may only enter the pool if owner authorisation is `obtained`.**
   This is the "dokumen sah" requirement, enforced in the database, not
   trusted. No authorisation, no pool — no exceptions, no admin override
   without an audited reason.
2. **Commission terms are accepted as an immutable snapshot.** An MA accepts
   the exact terms in force at pickup. If the LA later changes terms, existing
   engagements keep the version they accepted (the §76 amendment pattern we
   already use).
3. **The public never sees the LA.** Buyer-facing surfaces show the MA only.
   Both agents see each other in the dashboard.
4. **Leads belong to the MA who generated them**, but the LA is always notified
   that activity happened on their property.
5. **Marketplace surfaces show the original lister only.** Borrowed copies
   exist solely under `/agent/*` or the agent's own domain. See §7.
6. **Every pickup, withdrawal, term change and deal outcome is audited.**

## 5. Data model (migrations 00040+)

```
comarketing_offers            LA opts a listing into the pool
  listing_id -> listings      (unique active offer per listing)
  listing_agent_id -> profiles
  status                      draft | active | paused | withdrawn | closed
  scope                       open_pool | invite_only | agency_only
  commission_basis            total_pct | fixed_amount
  total_commission_pct        numeric(7,4)
  marketing_agent_share_pct   numeric(7,4)   -- of the total, e.g. 50.0000
  payer                       owner | buyer | developer
  min_marketing_price         numeric(14,2)  -- MA may not advertise below this
  allow_price_display         boolean
  materials_note              text
  max_marketing_agents        int            -- null = unlimited
  requires_la_approval        boolean        -- auto-accept vs LA approves each MA
  expires_at                  timestamptz
  terms_version               int            -- bumped on any term change

comarketing_offer_versions    immutable snapshot per terms_version

comarketing_engagements       one MA picking up one offer
  offer_id, marketing_agent_id
  accepted_terms_version, accepted_at
  status                      pending | active | paused | ended | revoked
  end_reason
  public_slug                 the MA's own URL for this property

comarketing_engagement_events append-only: picked_up, approved, price_changed,
                              unavailable, withdrawn, lead_generated, deal_closed

comarketing_leads             attribution bridge: lead_id, engagement_id,
                              marketing_agent_id, listing_agent_id
```

RLS notes, all of them lessons already paid for:

- No policy may subquery its own table — helper functions
  `is_offer_owner()`, `is_engaged_agent()` as `SECURITY DEFINER`.
- Confidential terms (min price, internal notes) go in a `*_private`
  companion, never on the main row.
- `listing_agent_id` is the single embeddable `profiles` FK on offers; every
  audit/actor column points at `auth.users`.
- Guard trigger on `comarketing_engagements` so an MA cannot alter
  `accepted_terms_version`, `status` beyond ending their own engagement, or
  anything belonging to the LA — and the trigger is **SECURITY INVOKER**
  (00039's lesson).

## 6. Flows

### 6.1 Listing Agent publishes an offer

1. LA opens a published listing → *Offer for co-marketing*.
2. System checks: listing published and moderated, not expired, **owner
   authorisation obtained**, agent verified. Any failure explains exactly
   which gate blocked it.
3. LA sets terms: total commission, MA share, payer, minimum advertised price,
   scope, agent cap, expiry, whether each MA needs approval.
4. Server validates the split (reuse the §83 rules already in Postgres).
5. Offer goes live in the pool. Audited.

### 6.2 Marketing Agent picks up

1. MA browses **Pool Listings** filtered by area (province → kecamatan),
   property type, price band, commission share, LA rating, freshness.
2. Opens a pool listing: full property facts, photos, terms — **but not the
   owner's identity or exact address**.
3. Accepts terms → snapshot recorded, engagement created (`pending` if the LA
   requires approval, else `active`).
4. The listing now appears on the MA's microsite with the MA's contact.

### 6.3 A buyer enquires

1. Buyer sees the MA's microsite, contacts the MA.
2. Lead is created for the MA, linked to the engagement.
3. **LA is notified**: "activity on your property" — count and status only,
   never the buyer's identity.
4. Deal progresses in the MA's pipeline. Commission split is already agreed,
   so closing is a status change, not a negotiation.

### 6.4 The two notifications that matter

Straight from the benchmark — of every possible event, these are the two a
collaborating agent actually needs:

- **Price changed** → every active MA is told immediately. Quoting a stale
  price in front of a client is the fastest way to look unprofessional.
- **No longer available** → every active MA is told immediately, and the
  listing is pulled from their microsites automatically. Showing a client a
  dead property is worse than showing them nothing.

We already store both fields. Add `withdrawn` and `terms_changed` as a third
and fourth, and stop there — notification fatigue is real.

## 7. Two surfaces, one rule (Kamal, 4 Aug 2026)

Every agent gets their own landing page. Borrowed properties live **there**,
never on the main marketplace.

| Surface | Whose properties | Whose contact | Borrowed listings? |
|---|---|---|---|
| **Marketplace** `www.propertiguru.id` | The original listing agent's | **Original listing agent only** | **Never** |
| **Agent landing page** (their own domain) | Their own **plus borrowed** | The agent whose page it is | **Yes — this is the point** |

Stated as an invariant: *on the main domain and the main property page, only
the original lister is ever shown. Borrowing exists so an agent can build
inventory on their own page — nowhere else.*

This is cleaner than the benchmark and it removes the buyer-confusion problem
outright: search the marketplace and each property appears exactly once, with
the agent who actually holds the mandate.

### 7.1 Where the landing page lives — decided

**Kamal's call, 4 Aug 2026:** path-based on the main domain, with a custom
domain as the Premium upgrade. Same shape as PropMall's
`propmall.my/sitiaggroup`.

| Tier | Shape |
|---|---|
| **Default (all agents)** | `propertiguru.id/agent/namaagen` |
| Listing on that page | `propertiguru.id/agent/namaagen/list/judul-listing-1208` |
| **Premium** | `namaagen.com` — Cloudflare for SaaS custom hostnames, automatic per-agent SSL |

Because the landing page now sits on the main domain, invariant 5 must be
stated by *surface*, not by domain:

> **Marketplace surfaces** — home, `/cari`, `/properti/*` — show the original
> listing agent only, and never contain borrowed listings.
> **The `/agent/*` namespace** is the agent's own space, where borrowed
> listings are the whole point.

The namespaces never mix. A borrowed listing has exactly one URL, under the
borrowing agent, and it is not reachable from marketplace search.

### 7.2 What the page looks like (from the benchmark)

Captured from `propmall.my/sitiaggroup/list/...`, 4 Aug 2026:

- **The agent card sits at the top of the right column, above the price** —
  photo, name with licence number (`Siti Hajar (E 2820)`), agency with its own
  registration (`IQI REALTY SDN BHD (E (1) 1584/24)`), phone, and a green
  **WhatsApp button as the primary call to action**.
- Large gallery (20 photos) with a thumbnail strip.
- Price, title, location, then attributes as plain rows: tenure, lot type,
  corner, built-up, land area, rooms, bathrooms.
- **Published date shown** — freshness as a trust signal.
- Nothing on the page indicates whether the listing is the agent's own or
  borrowed. To the public it is simply hers. That is the model working
  correctly.

Two notes for our build. Malaysia requires the agent's REN/E number and the
agency registration to be displayed publicly — **Indonesia has no direct
equivalent**, so our agent card shows IQI membership and verification status
instead, which is the trust signal that actually means something here. And
WhatsApp is the primary action, not a secondary one, consistent with our
standing rule.

### 7.2 The SEO conflict — and the honest resolution

There is a real tension here that a naive design hides:

- If a borrowed page **canonicalises to the marketplace listing**, search
  engines pass all authority to the main page, which shows the *original*
  agent. The borrowing agent's page never ranks and never earns the lead —
  the whole feature is pointless for them.
- If it **does not canonicalise**, twenty near-identical pages compete, which
  degrades everyone and can get microsites classed as thin content.

Resolution, and this is a product decision as much as a technical one:

1. **Borrowed listings on a landing page are a *sharing* surface, not a search
   surface.** They are `noindex`. The agent shares the link on WhatsApp, in a
   Facebook group, to their own network — which is how agents in this market
   actually distribute anyway.
2. **The agent's *own* listings on their landing page are indexed**, with the
   agent as canonical. Their SEO equity comes from their own mandates, which
   is the correct incentive: it rewards winning listings, not collecting them.
3. **Each borrowed copy still gets unique AI-written copy** (§8.2) so it reads
   as the agent's own work when shared, and so a page can later be promoted to
   indexed if the agent's version becomes genuinely distinct.

This keeps the marketplace clean, gives borrowing agents a real distribution
tool, and refuses to build a search-spam machine — which would be punished by
Google eventually and would poison the main domain's reputation along with it.

## 8. The AI layer

Kamal's brief: *baiki, upgrade, add AI*. Each of these is scoped so it fails
safe — AI ranks, drafts and warns; it never transacts.

### 8.1 "Listings you're most likely to close" (highest value)

Rank the pool for **this** agent using signals we already hold: their area and
specialisation, past closed deals, their MatchHub buyer requirements, their
microsite's traffic profile, and the offer's commission share. Deterministic
filters and geospatial distance first, vector similarity second, human-tunable
weights — the same hybrid the master prompt requires for buyer matching (§12).

### 8.2 Per-agent listing copy

One property, twenty agents, twenty genuinely different descriptions in the
agent's own voice and language (ID/EN, formal or conversational). Solves the
duplicate-content problem *and* the "my page looks like everyone else's"
problem in one move. Agent edits before publishing; never auto-published.

### 8.3 Instant buyer match on pickup

The moment an MA picks up a listing, check their existing leads and MatchHub
requirements: *"3 of your buyers match this property."* This converts a pickup
into work in the same minute — the single strongest retention mechanic in the
whole design.

### 8.4 Commission fairness warning

Flag terms far outside the market band for that area and property type. A new
agent offered a 10/90 split should be told that is unusual **before**
accepting, not after. Advisory only, never blocking.

### 8.5 Pool quality gate

Score listings before they enter the pool (we already have
`listing_quality_scores`). Poor photos and thin descriptions pollute every
microsite that picks them up, so the pool has a higher bar than the
marketplace.

### 8.6 Exclusivity conflict detection

The same property offered by two different "listing agents" means someone is
misrepresenting a mandate. Detect by address, coordinates and photo hash;
route to admin. **Never auto-ban** — human review, per §12.

## 9. Build phases

| Phase | Scope |
|---|---|
| **A** | Schema + RLS + offer creation with the document gate + pool browsing with area/type filters + pickup with terms snapshot |
| **B** | Agent landing page on `namaagen.propertiguru.id` with contact swap, borrowed-listing rules from §7, price/availability notifications |
| **C** | Lead attribution, LA activity notifications, deal outcome and commission recording |
| **D** | AI: pool ranking, per-agent copy, instant buyer match |
| **E** | Fairness warnings, conflict detection, agency-scoped and invite-only pools |

Phase A is meaningful alone: agents can offer and pick up under agreed terms
even before microsites exist, because the picked-up listing can simply appear
in the MA's own listing list.

## 10. Open questions for Kamal

1. **Default split** — PropMall shows none publicly. Do we seed 50/50 as the
   platform default, or force the LA to choose every time?
2. **Approval mode** — should picking up be automatic, or should the LA approve
   each marketing agent by default? Automatic grows inventory faster; approval
   protects relationships.
3. **IQI-only pool first?** — restricting the initial pool to verified IQI
   Indonesia agents makes the trust and document gates far easier to enforce,
   and gives IQI membership real commercial value (§8 entitlement).
4. **Does a co-marketed deal need the owner's knowledge?** Malaysia and
   Indonesia practice differ; this is a legal question, not a product one, and
   belongs with the §68 legal review.
5. **Custom domains** — is `namaagen.com` a Premium-plan feature, a paid
   add-on, or an IQI-verified benefit? It carries a real per-hostname cost.
6. **Should borrowed listings ever be indexable?** §7.2 says no by default. If
   Kamal wants them indexed, that is a deliberate SEO risk to accept in
   writing, not a default to drift into.
