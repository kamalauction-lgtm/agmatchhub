# Benchmark — agent dashboards

Competitive product benchmark for the PropertiGuru Next **agent OS** dashboard.

**Scope rule (master prompt §4):** these platforms are *product benchmarks only*.
We extract **concepts, module boundaries and KPIs** — never layout, copy, visual
identity or code. Given risk R1 (our working name resembles PropertyGuru Group,
owner of Rumah123), this line is stricter here than on a normal project, not
looser.

**Product frame (Kamal, 4 Aug 2026):** the hub is the agent operating system.
AG MatchHub is one module inside it. Everything below is assessed as "does this
deserve a card on the agent dashboard grid?"

Sources: screenshots supplied by Kamal from his own accounts. Both
`agentnet.propertyguru.com.my` and `propmall.co` are blocked for direct reading
by the browsing policy, so capture is manual.

---

## 1. PropertyGuru Malaysia — AgentNet

*Captured 4 Aug 2026. Screens seen so far: Account (`/v2/account`).*

### 1.1 Module rail (left navigation) — the most valuable signal

| Module | Notes |
|---|---|
| Notifications | Top-level, not buried in a bell menu |
| **Listings** | Core |
| **Leads** | Badged `99+` — lead volume is the daily driver |
| **Market Watch** | Carries a "new activity" dot — market intelligence is its own module |
| **Brickz** | Separate transacted-price/data product surfaced inside the agent tool |
| More | Overflow |
| Profile | Bottom of rail, avatar |

**Read:** six top-level destinations, no deep nesting. Market data gets *two*
rail slots (Market Watch + Brickz) — for a mature portal, comparables and
transaction data are treated as first-class agent tooling, not a report buried
in analytics.

### 1.2 Account & subscription

- Tier named plainly ("Pro Account") with **expiry date shown on the account
  page** and a persistent `Upgrade` call to action.
- Explicit policy line: *do not share your account with others* — seat-sharing
  is a real commercial leak on agent platforms.

### 1.3 Agent verification — a two-stage gated flow (labelled "New")

This is the strongest single idea captured so far.

1. **eKYC verification** — identity first. Status chip (`In Progress`), stated
   SLA of up to 3 business days after document submission.
2. **Verify credentials** — **gated behind eKYC**: the button is disabled until
   eKYC is approved. Requires a professional licence (REN/REA/PEA — the
   Malaysian real-estate licence classes).

**Read:** identity and professional standing are separate proofs, verified in
sequence, each with its own state. Our §15 model has both pieces but treats
them as one document-upload step.

### 1.4 Security surface

- Password change with a 90-day rotation nudge.
- **Spam filter toggle** — "automatically filter out suspicious inbox messages
  to avoid scammers", agent-controlled, default off.

**Read:** scam/spam pressure on agent inboxes is significant enough to warrant a
user-facing control, not just backend filtering.

### 1.5 Packages and the credit economy

*From PropertyGuru Group Malaysia's public agent-offerings site, 4 Aug 2026.*

Four tiers, priced per month and billed annually — and note the level: these
are **RM 4,300 to RM 21,500 a year**, a different universe from Rumah123's
Indonesian pricing and from our Rp49k–249k ladder.

| Tier | Monthly | Annual | Concurrent listings | Universal credits |
|---|---|---|---|---|
| Bronze | RM 359.82 | RM 4,317.84 | 50 | 1,200 |
| Silver | RM 561.42 | RM 6,737.04 | 150 | 2,400 |
| Gold | RM 1,002.42 | RM 12,029.04 | 350 | 4,800 |
| Elite | RM 1,789.92 | RM 21,479.04 | 500 | 15,000 |

Higher tiers add non-feature benefits that are pure status and access:
pre-qualification for **PG Agent Awards**, **co-marketing options**, premium
support, and **round-table access** at Elite.

**Three separate credit currencies** — Universal/Ad Credits (365-day expiry,
volume discounts), **Prime Credits** (Featured Agent only), and iProperty
Featured Credits for dual-platform agents.

Ranking add-ons stack in a strict ladder:

`Featured Agent` › `Turbo Pro` (guaranteed top-10) › `Turbo` › `Boost` › regular

### 1.6 Featured Agent — the most interesting mechanic in the whole benchmark

- **Exactly 7 slots per area, district or project**, split by category (condo,
  residential, commercial). Artificial scarcity, sold.
- Bookable for **30 / 90 / 180 days**, extendable, with future availability
  reservable.
- **Dynamic pricing**: the Prime Credit cost moves with competition and
  listing supply for that property type, location and project.
- Buys: pinned above Turbo and Spotlight, extra-large images in the carousel,
  placement on project pages, a **Featured Agent badge**, and dedicated
  WhatsApp + Message buttons.

**Read:** this is not "pay for a better listing" — it is **selling territory**.
An agent buys visibility over an *area*, not over one property, and scarcity
plus dynamic pricing turns local competition into revenue. It also creates a
genuine credibility signal, because only seven agents can hold a district.

For us that is worth understanding rather than copying wholesale: it is the
strongest monetisation idea seen anywhere in this study, and it maps naturally
onto Indonesia's kecamatan hierarchy, which we already seeded. But it sits in
direct tension with our §14 rule that paid promotion must not outrank on
payment alone.

### 1.7 Tools, grouped the way they market them

They organise the agent value proposition into three promises:

| Promise | Tools |
|---|---|
| **Win with reach** | Ranking tools |
| **Win with speed** | MarketWatch · Lead Management · Listing Management · Listing Performance Insights |
| **Win with credibility** | Verified Badge · Brickz · **Everyone Welcome Badge** |

Also named: **AI writing and video generation** for listing descriptions and
visuals, and cross-listing that duplicates a listing onto iProperty PRO in one
step. Headline claim: 92 million platform visits and 7 million unique seekers
a year across both platforms.

Two things worth taking from the framing itself:

1. **Reach / speed / credibility** is a better way to explain an agent
   platform than a feature list. Agents buy outcomes, not modules.
2. The **Everyone Welcome Badge** is an inclusivity signal as a product
   feature — a reminder that trust markers need not all be about competence.

### 1.8 Still to capture

Dashboard home, Listings index, Leads index, MarketWatch and Brickz screens.

---

## 2. PropMall

*Captured 4 Aug 2026. Screens seen so far: `/feeds` (agent landing).*

Positioning is stated in the logo lockup itself: **"Built By Agents, For
Agents"** — an agent-first co-operative posture rather than a portal that
sells leads to agents. Worth noting because it is the closest posture to ours.

### 2.1 The agent landing page is a *feed*, not a KPI dashboard

`/feeds` is where a logged-in agent lands. The content is platform
announcements as dated cards (an infrastructure-upgrade notice with a
"read more"), not the agent's own numbers.

**Read:** a deliberate different answer to "what does an agent see first" —
platform communication over personal performance. Our dashboard chose the
opposite (needs-attention-today numbers first). I still think ours is right
for a daily working tool, but this argues for **an announcements channel
somewhere in the OS** — IQI Indonesia has a real need to push project
launches, policy changes and training to agents, and today we have no surface
for it beyond per-user notifications.

### 2.2 Top navigation

Compact icon rail, right-aligned: a directory/listing icon, a home icon, a
**`+` create menu with a dropdown** (multiple create actions, not a single
"add listing"), a notifications bell with an unread badge, avatar, and a
hamburger overflow menu.

A **floating WhatsApp button** sits bottom-right on the page — support and
contact run through WhatsApp as a first-class channel, consistent with the
Malaysian/Indonesian market reality behind our own WhatsApp-only rule.

### 2.3 Agent-branded microsite (MyHartanah.co)

The announcement artwork advertises a companion product: **an agent's own
branded property website**. Visible in the promotional image — so treat as
marketing material, not a confirmed feature inventory:

- Agent identity block: photo, name, **REN licence number**, agency, phone
  with a *Show Number* reveal.
- Its own search over the agent's inventory ("Discover 5,013 dream properties
  at MyHartanah.co") with state / category / tenure / price / bedroom filters.
- Featured listings grid, and a mobile listing detail with **Whatsapp / Call /
  Details** as the three primary actions.
- A **"Below Market Value"** badge on a listing card — a value-signal tag, not
  just a status.
- Site navigation includes **"Done Deals"**, plus task-oriented menus labelled
  **"I Want To"** and **"Tools"**.

**Read, three things worth stealing conceptually:**

1. **Agent microsite** is already in our §10 Module 2 / Phase 2 — this
   confirms it is table stakes in this market, not a luxury.
2. **"Done Deals"** — transacted-deal display again (cf. Brickz). Two of two
   benchmarked platforms surface transaction evidence to agents.
3. **"I Want To" task menus** — organising navigation by intent rather than by
   object. A genuinely good pattern for the non-tech-literate agents Kamal
   describes, and cheap for us to adopt on the dashboard.

### 2.4 The real module list (hamburger overflow)

Captured 4 Aug 2026. This is PropMall's actual agent module inventory:

| Item | Note |
|---|---|
| My Profile | |
| **My Website** | Opens externally — the agent microsite (MyHartanah) |
| **My Digital Card** | Opens externally — digital name card as its own product |
| **My Referral** | Agent referral programme |
| Profile Setting | Separate from "My Profile" |
| **Leads Hub** | Leads are a "hub", the working centre |
| **Tutorial & Knowledge Base** | Training and education inside the product |
| **Torinrin (PropMall Support)** | WhatsApp icon — support is *a named human*, not a ticket queue |
| Exit PropMall | |
| **Subscribe PropMall Premium** | Green, visually loudest item in the menu |

Feed cards below the fold include a **"July 2026 Training Schedule"** post —
training is pushed through the same announcements feed.

**Read — four things this changes for us:**

1. **Digital name card is a shipped product, not a field.** We already store
   `name_card_front_path` / `name_card_back_path` on `agent_profiles` (§71
   trust profile, migration 00019) — we have the data and no product on top of
   it. Cheapest high-visibility win available to us.
2. **Referral programme as a first-class module.** We have nothing, and this is
   directly adjacent to Kamal's existing IQI recruitment funnel work — agent
   referral and agent recruitment are the same motion in this market.
3. **Training / knowledge base inside the agent tool.** Combined with the
   training-schedule feed post, education is not a separate portal. IQI already
   runs heavy agent training; today it lives entirely outside any product.
4. **Support is a named person on WhatsApp.** Not a helpdesk. This matches the
   market reality behind our WhatsApp-only rule and is trivially cheap to add.

Also note the monetisation posture: the subscribe call-to-action is the most
visually prominent element in the entire menu.

### 2.5 Co-Marketing — correction to an earlier claim

Captured live from `propmall.co/notification`, 4 Aug 2026.

**I was wrong earlier.** I recorded that no benchmarked platform had a MatchHub
equivalent. PropMall has **Co-Marketing**, and it is clearly central: the
agent's entire notification stream is co-marketing events, going back months.

Only two event types appear, repeatedly:

| Event | Icon | Meaning |
|---|---|---|
| **Co-Marketing Listing Price Goes Down** | green tick + `$` | The listing agent dropped the price on a property you are co-marketing |
| **Co-Marketing Listing Not Available** | red `✕` | A co-marketed property has been withdrawn or sold |

Real examples in the stream: *Endlot Terrace Two & Half Storey Presint 8
Putrajaya*, *3.03 Acre Land Beside Main Road Batu Kikir at Tampin*, *3 Storey
Shoplot Bangi Gateway*, *Land Beside Housing Area Sendayan 4.887 acre*.
Timestamps run from May to today, so this fires continuously.

**Read — this is the sharpest single lesson in the whole benchmark.** Of every
possible co-broke notification, a mature agent-to-agent platform ships exactly
two, and both answer the only questions a collaborating agent actually has:

1. *Did the price move?* — because it changes what I can sell, and I look
   foolish quoting a stale price to my buyer.
2. *Is it still available?* — because showing a client a dead property is the
   single most damaging thing that can happen to an agent's credibility.

**Our gap:** MatchHub notifies on messages, offers, viewings, contact release
and submission events. It does **not** notify when a supply agent changes the
asking price, or flips `availability_status` to unavailable. Those are the two
events PropMall considers worth interrupting an agent for — and we already
store both fields (`property_submissions.asking_price`,
`monthly_rental`, `availability_status`). This is cheap, high-value, and
directly protects the requesting agent in front of their client.

### 2.6 The co-marketing mechanic, on the listing card

Captured from `propmall.co/listing`, 4 Aug 2026. Every listing card carries two
actions side by side: **👁 View Listing** and **♡ Co-Marketing**. The card shown
belongs to another agent (Rizal R R) — so picking up someone else's listing is
a single click from the browse list, not a negotiation.

The card also shows a `Published` badge with photo count, and a two-state row:
**LF Updated** (active) / **Repost Today** — a bump action, the same habitual
mechanic as Rumah123's *Sundul*.

Listing facts on the card: price with period (RM 1,800 monthly), full title,
location, property type and storey class, built-up with price-per-sqft, rooms,
bathrooms, and a listing reference (LR2607000446).

**This mechanic is now our own module design** — see
[Co-Marketing module design](module-co-marketing.md). Kamal's brief goes
further than PropMall: the listing agent must hold **valid documents and a
clear commission** before the property can be shared, contact details swap to
the marketing agent on their own landing page, and the dashboard still shows
who the true listing agent is. That combination — a document gate plus
versioned dual-accepted commission terms — is exactly what our existing
MatchHub engine already does and PropMall appears not to.

### 2.7 Still to capture

Leads Hub contents, listings management, the `+` create menu, and the
Premium subscription page (tiers, prices, what is gated).

---

## 3. Rumah123 (Indonesia — 99 Group / PropertyGuru Group)

*No agent account. Assembled 4 Aug 2026 from Rumah123's own public agent guides
and marketing pages — sources at the foot of this section. This is the direct
incumbent competitor in our actual market, so it carries the most weight.*

### 3.1 Dashboard structure

Four top-level menus: **Dashboard**, **Iklan Saya**, **Daftar Pembelian**
(purchase history), **Informasi**.

Profile block top-left shows photo, name, **membership start date**,
**membership validity period**, and office name — or explicitly *"Independent
Property Agent"* when unaffiliated.

Headline metrics: **iklan tertunda** (pending), **iklan tayang** (live),
**iklan terjual** (sold), and remaining **kuota iklan** for the membership
tier.

### 3.2 Commercial model — the part that matters most

Membership tiers: **Silver+ / Gold / Platinum**, each setting ad quota and
features. On top of that sits a paid booster economy, priced separately:

| Product | Claim |
|---|---|
| **Premier Listing** | Top tier, ranks above Featured and Standard |
| **Featured Listing** | Above standard ads, "up to 8× more views" |
| **Top Properti** | Top position 24 hours–7 days, "up to 60–120× views" |
| **Booster Mingguan** | 7-day weekly package |
| **Sundul** | One-click bump to the top — the cheap, habitual action |
| **K123dit (Kredit)** | Credit wallet that pays for all of the above |

**Read:** revenue is *not* mainly the subscription — it is a credit wallet
feeding per-listing promotion, with a one-click bump ("Sundul") designed to be
habitual. This is the model our §7 plans and §14 ranking weights have to
survive competitively. Note the tension with our own §14 rule that paid
promotion must never outrank on payment alone: their headline claims are
explicitly about buying position.

### 3.3 Agent tooling

- **Lead Management Platform (LMP)** — manage, monitor and follow up leads. A
  named product, not a screen.
- **Listing Quality Score (LQS)** — agents score their own listing quality.
  **We already designed exactly this** (`listing_quality_scores`, migration
  00030) and have not surfaced it yet.
- **Halaman Personal Agen** — agent profile/microsite. Third of three
  benchmarks with one.
- **Brosur Instan** — generate a promotional brochure from a listing ID for
  social media. Instant marketing collateral from inventory.
- **Rumah123 Pro** — a separate agent mobile app.
- **Principal Dashboard** — office principals monitor team performance. Maps
  to our team-leader / branch-manager roles (§6), which we have modelled but
  not built.
- **Agent Academy** — training programme.
- **Agen Spesialis / Area Spesialis / Kantor Agen Pilihan** — specialisation
  and area-expertise badges, and an office ranking.

### 3.4 Read for us

1. **Listing Quality Score is validated by the market leader.** Ours exists in
   schema. Surfacing it — with the actionable recommendations we already
   specified — is a high-value, already-half-built move.
2. **Area/specialisation badges** are a credibility mechanic we lack entirely,
   and they cost nothing but a verification step. Fits our trust-profile work.
3. **Brosur Instan** is the concrete, unglamorous version of our AI Marketing
   Content Studio (§12). Generating a shareable brochure from a listing is the
   feature agents here actually use daily.
4. **Principal Dashboard** confirms team/branch oversight is expected in this
   market, not enterprise-only.
5. Their commercial engine is **credits + promotion**, not subscription. Our
   Rp49k/129k/249k plan ladder (§7) is a different bet; it should probably be
   *complemented* by promotion credits rather than competing purely on
   subscription price.

Sources: [Dashboard agen](https://www.rumah123.com/panduan-properti/dashboard-agen-rumah123/) ·
[Fitur agen](https://www.rumah123.com/explore/agent/) ·
[Fitur performa listing](https://www.rumah123.com/panduan-properti/fitur-untuk-meningkatkan-performa-listing/) ·
[Rumah123 Pro (Play Store)](https://play.google.com/store/apps/details?id=com.rumah123.android.agent2)

---

## 4. Gap analysis vs what we have

| Concept | Us today | Verdict |
|---|---|---|
| Listings module | Built — `/listings`, create + moderation | Parity |
| Leads module | Built — `/leads`, SLA badges, WhatsApp | Parity, and our response-SLA framing is sharper |
| Notifications | Built — in-app + push + email | Parity |
| Profile & verification | Built — `/profile`, `/verification` | Parity in surface, weaker in flow (see below) |
| Co-broke collaboration | Built — MatchHub | PropMall has Co-Marketing (earlier "no equivalent" claim was wrong). We remain far deeper: verified requirements, protected identities, versioned commission agreements |
| **Co-broke price-drop alert** | Not built | **Adopt** — PropMall interrupts agents for this; we store the field already |
| **Co-broke "no longer available" alert** | Not built | **Adopt** — protects the agent in front of their client |
| **Two-stage gated verification** | Single-stage document upload | **Adopt** — split identity from professional standing |
| **Plan tier + expiry visible** | Flat quota constant, no plan surface | **Adopt** with the entitlements engine (Epic 4) |
| **Lead spam filter (agent-controlled)** | Contact-detection exists in MatchHub only | **Adopt** — reuse the detection we already have |
| **Market intelligence as its own module** | Phase 5, unbuilt | Confirms it deserves a dashboard card, not a sub-tab |
| **Transacted-price data product** | None | Indonesia has no Brickz equivalent — potential differentiator, needs a data source |
| Account-sharing policy | Not addressed | Cheap to add to terms + a login-anomaly signal |
| Password rotation nudge | Not addressed | Low value; skip unless compliance asks |
| **Agent-branded microsite** | Phase 2, unbuilt | Table stakes here — both benchmarks have it |
| **Transacted deals / "Done Deals"** | None | 2 of 2 benchmarks surface transaction evidence |
| **Platform announcements channel** | Per-user notifications only | **Adopt** — IQI needs to push launches and training |
| **Intent-led navigation ("I Want To")** | Object-led (Listings, Leads…) | Cheap to add; suits non-tech-literate agents |
| WhatsApp as first-class support channel | Used for lead contact only | Matches our WhatsApp-only rule; extend to support |
| **Digital name card** | Files stored (00019), no product | **Cheapest win** — data already exists |
| **Agent referral programme** | None | Adjacent to Kamal's IQI recruitment funnel |
| **Training / knowledge base in-product** | None | IQI runs heavy training entirely outside any product |
| **Named human support (WhatsApp)** | None | Trivial to add, high trust value in this market |
| **Always-visible subscribe CTA** | None | Ties to entitlements engine (Epic 4) |
| **Listing Quality Score surfaced** | In schema (00030), not shown | **Highest-value half-built win** — market leader validates it |
| **Promotion credits economy** | None; subscription-only plan ladder | Rethink §7 — **both** incumbents run on credits + boosts, not subscription |
| **Area-exclusive visibility (Featured Agent)** | None | Strongest monetisation idea in the study; maps onto our kecamatan hierarchy; conflicts with §14 |
| **Dynamic pricing on promotion** | None | Scarcity + competition priced automatically |
| **Status benefits (awards, round-table)** | None | Higher tiers sell access and standing, not just features |
| **Verified / credibility badges** | Verification exists, no public badge | Cheap; both MY platforms monetise trust |
| **One-click bump ("Sundul")** | None | Cheap, habitual, monetisable |
| **Instant brochure from listing** | AI Content Studio (Phase 2) | The unglamorous daily-use version; ship this shape first |
| **Specialisation / area-expert badges** | None | Credibility mechanic, near-zero cost, fits trust profile |
| **Principal / team dashboard** | Roles modelled (§6), unbuilt | Expected in this market, not enterprise-only |
| **Separate agent mobile app** | PWA only | Deliberate: PWA-before-native is our §5 principle |

### Actions this suggests (not yet scheduled)

1. **Split verification into eKYC → professional credential**, each with its own
   status and SLA. Indonesia has no REN/REA/PEA equivalent — the second stage
   should verify IQI membership and/or AREBI certification, which also feeds the
   complimentary-Premium entitlement (§8).
2. **Surface plan and expiry on the dashboard** when the entitlements engine
   lands, alongside the existing quota meter.
3. **Agent-controlled lead spam filter**, built on `lib/contact-detection.ts`.
4. Keep **market intelligence** scoped as a future dashboard card, not a report.
