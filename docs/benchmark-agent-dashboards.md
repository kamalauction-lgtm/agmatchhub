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

### 1.5 Still to capture

Dashboard home, Listings index, Leads index, Market Watch, Brickz, credits and
paid products.

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

### 2.4 Still to capture

Listings management, leads/enquiries, the `+` create menu contents, the
hamburger overflow (likely where the real module list lives), co-broke or
agent-to-agent features, and any credits/subscription surface.

---

## 3. Rumah123 (Indonesia — PropertyGuru Group)

*No agent account available. Will be assessed from public surfaces and their
published agent marketing only.*

---

## 4. Gap analysis vs what we have

| Concept | Us today | Verdict |
|---|---|---|
| Listings module | Built — `/listings`, create + moderation | Parity |
| Leads module | Built — `/leads`, SLA badges, WhatsApp | Parity, and our response-SLA framing is sharper |
| Notifications | Built — in-app + push + email | Parity |
| Profile & verification | Built — `/profile`, `/verification` | Parity in surface, weaker in flow (see below) |
| Co-broke collaboration | Built — MatchHub | **We are ahead**; no equivalent seen |
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

### Actions this suggests (not yet scheduled)

1. **Split verification into eKYC → professional credential**, each with its own
   status and SLA. Indonesia has no REN/REA/PEA equivalent — the second stage
   should verify IQI membership and/or AREBI certification, which also feeds the
   complimentary-Premium entitlement (§8).
2. **Surface plan and expiry on the dashboard** when the entitlements engine
   lands, alongside the existing quota meter.
3. **Agent-controlled lead spam filter**, built on `lib/contact-detection.ts`.
4. Keep **market intelligence** scoped as a future dashboard card, not a report.
