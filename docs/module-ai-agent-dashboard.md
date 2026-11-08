# Module design — the AI-assisted agent dashboard

*Design v1, 4 Aug 2026. Expands the dashboard shipped in commit 1889e46.*

## 1. The premise

Kamal's agents are often busy, mobile-only, and not especially tech-literate.
The dashboard's job is therefore not to *display data* — it is to **answer one
question**:

> *Apa yang saya patut buat sekarang?*

Every AI capability below is judged against that. If it produces something
pretty that does not change what the agent does in the next ten minutes, it
does not belong on the dashboard.

## 2. Governance — the rules every capability obeys

Non-negotiable, from master prompt §12:

1. **AI ranks, drafts and warns. It never transacts.** No auto-sent message, no
   auto-published listing, no auto-rejected lead.
2. **No open chatbot.** Every capability has a defined input, output and
   purpose.
3. **Human confirmation for anything legal or financial.**
4. **Every job logged** to `ai_jobs`: user, feature, provider, model, prompt
   version, tokens, cost, latency, approval state.
5. **Quotas enforced before the call**, per plan — monthly, daily, per-feature.
   Exhaustion degrades gracefully to the non-AI path; it never 500s.
6. **A lead is never hidden or rejected by a score.** Scores sort; humans
   decide.
7. **PII redacted** before any provider call that does not require it.

## 3. Layer 1 — Brief Harian (the headline feature)

One AI-written paragraph plus a ranked action list, at the top of the
dashboard, regenerated each morning and after significant events.

Input is entirely data we already hold: overdue and unanswered leads, today's
viewings, listings expiring this week, listings rejected in moderation,
price-drop and unavailable alerts on co-marketed properties, new pool listings
matching this agent's buyers, MatchHub submissions awaiting their review,
follow-ups due.

Output, in the agent's language:

> *Selamat pagi Dewi. Tiga perkara penting hari ini: Siti Rahma sudah tunggu
> respons 6 jam — dia tanya harga nego untuk Apartemen Kemang. Ada 2 kunjungan
> petang ini. Listing Ruko Cilandak tamat dalam 3 hari — perpanjang sebelum
> hilang dari carian.*
>
> 1. Balas Siti Rahma — **lewat 6 jam** → [buka WhatsApp]
> 2. Sahkan kunjungan 14:00 dengan Budi → [sahkan]
> 3. Perpanjang LST-2026-000012 → [perpanjang]

**Why this first:** it collapses six screens into one, works on a phone, and is
the difference between an agent who knows what to do and one who opens the app
and closes it again. Everything else on this page is a supporting act.

Cost control: one generation per agent per day, cached, re-run only when the
underlying counts change materially. Falls back to a rules-only version (no
prose, just the ranked list) when quota is exhausted — which is still useful.

## 4. Layer 2 — capabilities on the working surfaces

### 4.1 Lead copilot (`/leads`)

- **Intent score** with the reason stated in words, never a bare number.
- **Next best action** per lead, with a **drafted WhatsApp message** the agent
  edits and sends. Draft-only by default; rule-approved auto-send is a later,
  separate decision.
- **Duplicate contact warning** — same phone across leads.
- **Silence radar** — flags leads going cold before they are lost.

### 4.2 Listing copilot (`/listings/new`)

- **Voice-to-listing.** The agent speaks the property in Bahasa Indonesia; we
  transcribe, extract structured fields, and show them for confirmation.
  Nothing publishes without review. For agents who struggle with long forms on
  a phone, this is the single biggest usability win available.
- **Description, title and selling points** in ID and EN.
- **Photo analysis** — blur, duplicates, missing rooms, suggested order, and a
  warning if a photo appears to contain personal information.
- **Quality score with specific fixes**, not a grade: *"add a kitchen photo"*,
  *"describe the surroundings"*, *"price is 12% above similar units in
  Kebayoran Baru"*.

### 4.3 Price advisor

Comparables from our own catalogue plus transacted evidence when we have it,
expressed as a range with confidence and a plain-language reason. Both
benchmarked Malaysian platforms surface transaction data (Brickz, Done Deals);
Indonesia has no equivalent, so building this from our own closed deals is a
genuine differentiator — but only once we have volume. Ship the comparables
version first, honestly labelled as comparables.

### 4.4 Owner report generator

Weekly or monthly report for the property owner: views, saves, enquiries,
viewings, feedback, competing listings, recommended next step. Agents dislike
writing these and owners judge agents on them. One click, agent edits, sends.

### 4.5 Content studio

One listing → Facebook copy, Instagram caption, TikTok script, WhatsApp
broadcast, and a **shareable brochure image**. Rumah123's *Brosur Instan* is
the proof this is a daily-use tool, not a novelty. Ship the brochure first.

### 4.6 Co-marketing intelligence

Detailed in [the co-marketing design](module-co-marketing.md) §8 — pool
ranking, per-agent copy, **instant buyer match on pickup**, commission
fairness warnings.

## 5. Layer 3 — the coach

A weekly insight, comparative and specific:

> *Masa respons anda 4.2 jam minggu ini, naik dari 1.8 jam. Agen yang balas
> bawah 1 jam menutup 3× lebih banyak. Dua lead hilang minggu ini kerana
> lambat dibalas.*

Rules: compare an agent to their own past first and to anonymised peers second;
never publish a leaderboard by default — in this market that demotivates the
bottom half far more than it motivates the top. Team leaders see team views;
individual agents see themselves.

## 6. Layer 4 — Ask My Business (later)

Natural-language questions over the agent's **own** data only: *"berapa lead
saya bulan ini dari Jaksel?"*, *"listing mana paling banyak dilihat?"*

Strictly scoped: a query translator over a fixed schema with RLS applied, not
a general assistant. It answers with a number and a link to the underlying
rows, never with prose it cannot substantiate. Deliberately last — it is the
most impressive demo and the least valuable daily.

## 7. What this costs, and how it stays affordable

The master prompt is explicit that AI must be metered. Applied here:

| Feature | Frequency | Tier |
|---|---|---|
| Brief harian | 1×/agent/day, cached | Cheap model; rules-only fallback |
| Lead next-action | On demand | Cheap |
| Listing description | Per listing | Mid |
| Voice-to-listing | Per listing | Transcription + cheap extraction |
| Photo analysis | Per upload batch | Cheap vision |
| Owner report | Weekly | Mid, low volume |
| Content studio | On demand | Mid |
| Pool ranking | Nightly batch, cached | Embeddings, generated once |
| Coach | Weekly | Cheap |

Embeddings are generated once per listing version and cached — never per
search. Free-plan agents get the rules-only versions of everything, which are
genuinely useful and cost nothing; **AI becomes a real reason to upgrade**
rather than a feature we give away and then cannot afford.

## 8. Build order

| # | Item | Why here |
|---|---|---|
| 1 | **Listing Quality Score surfaced** | Already in schema (00030); zero AI cost for v1; fixes our worst problem, inventory quality |
| 2 | **Brief harian** (rules-only, then AI prose) | Highest daily value; rules version needs no AI at all |
| 3 | **Listing copilot: description + photo checks** | Directly improves what buyers see |
| 4 | **Lead next-action drafts** | Attacks response time, our sharpest metric |
| 5 | **Voice-to-listing** | The accessibility unlock for non-typing agents |
| 6 | **Content studio: brochure first** | Proven daily-use shape |
| 7 | **Owner report** | Retention and trust |
| 8 | **Co-marketing intelligence** | After the co-marketing module exists |
| 9 | **Coach**, then **Ask My Business** | Needs history to be meaningful |

Note that items 1 and 2 deliver most of the perceived value and need almost no
AI spend. That ordering is deliberate: prove the surface works, then add
generation where it earns its cost.

## 9. Dashboard layout, revised

```
Brief harian            AI paragraph + 3 ranked actions
Perlu perhatian         overdue · new leads · live · rejected     [shipped]
Modul anda              Leads · Listings · Co-Marketing · MatchHub · Profile
                        + coming-soon cards                        [shipped]
Wawasan mingguan        coach insight, one line
```

Co-Marketing joins the module grid as a peer card — one function inside the
agent OS, exactly as MatchHub is.
