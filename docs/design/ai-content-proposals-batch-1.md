# AI Workforce 2.0 — content proposals, batch 1 (six roles)

Status: **proposal for owner approval. Nothing here is in the database or on any page.**
Every statement below was checked against the code on branch `ui/futuristic-pilot`
at commit `a755b8b`, the migrations in `packages/db/supabase/migrations`, and the
tests in `packages/db/tests`. Where a claim could not be verified it says so.

## 0. Facts that apply to all six

**One engine.** Every model call goes through `runAi()` in `apps/hub/src/lib/ai/engine.ts`.
It checks, in order: the `ai_features` flag for the agent → the agent is verified →
platform enabled, circuit breaker, platform cap, per-agent daily cap, monthly quota →
a provider route exists for the feature. Any failure returns a **denied** result with a
reason, one ledger row is written to `ai_jobs`, and the role answers from its
**deterministic rules floor**. The agent is told which one they got.

**Staging today.** `/admin/ai` on `hub-staging.propertiguru.id` shows
`GEMINI_API_KEY · missing` and `ANTHROPIC_API_KEY · missing` (checked 9 Nov 2026).
So on staging **every role below runs rules-only.** No model output has been observed
on staging in this review. "Model-powered" below therefore means *routed and coded*,
not *verified working*.

**Status vocabulary used here**
- **Rule-based · tested** — deterministic code with unit or RLS tests that pass.
- **Model-powered · routed, unverified** — a provider row exists in `ai_models` and
  the code calls `runAi`; no provider key on staging, so no run has been observed.
- **Unverified** — exists in code or data but has no test and was not exercised.

**Nothing is sent or written without the agent.** Replies are drafted, not sent.
Tasks are proposed, not saved. Listing copy is drafted into the form, not saved.
The agent presses the button that sends, saves or books.

**Data boundaries.** Every read is under RLS as the signed-in agent. Lead reads are
scoped to the assigned agent; `lead_intel_upsert`, `lead_matches` and
`ai_clear_brief` are SECURITY DEFINER functions with an explicit owner check
(`l.agent_id = auth.uid()` or `ai.manage`). RLS tests prove another agent gets nothing.

---

## 1. Astra — AI Manager (`ai_manager`)

| | |
|---|---|
| Route | `/dashboard` (00081). Shown in the Astra brief panel. |
| Feature | `brief` → Gemini `gemini-3.8-flash`, fallback Anthropic `claude-haiku-5-5`, 700 tokens, standard tier. |
| Status | Rules floor: **rule-based · tested** (`tests/rls/ai-manager.test.ts`, 3 cases; dashboard brief ranking in `lib/dashboard/brief.ts`). Model paragraph: **model-powered · routed, unverified**. |

**Verified capabilities**
- Ranks up to 8 actions from live counts: overdue leads, overdue tasks, new leads,
  expiring listings, rejected listings, draft listings, listings in review, tasks due
  today. Each links to `/leads`, `/tasks` or `/listings`.
- When the engine allows, writes one paragraph (20–700 chars) over that list, cached per
  agent per day in `ai_briefs`, regenerated only when the counts change or the agent
  presses "Write it again" (one AI task).
- Greeting by time of day; "all clear" when nothing is waiting.

**Inputs** — the agent's own counts (leads, tasks, listings), locale, first name.
**Outputs** — ranked action list with counts; optional paragraph; source label
(`AI model · name` or `Rule-based`); reason when rules-only (quota, feature off, no
provider, unverified…).
**Data access** — own rows only. `ai_briefs` is self-read/self-write; `ai_clear_brief`
is self-only. Admin can see the brief audience. Test: another agent reads nothing.
**Example (rules floor, from the ranking code)** — an agent with 2 overdue leads and 1
draft listing sees: "1. Reply to 2 leads past the response deadline → /leads",
"2. Finish 1 draft listing → /listings". With no activity: the all-clear message.
**Limitations / approval** — the paragraph is prose over the list and never adds an
action. Regeneration spends one task and is a deliberate button. No notification is
sent. The model path is unverified on staging.

**Proposed detail copy**
- EN — *What Astra does:* "Reads your live numbers each morning and ranks what to do first. When AI is on, adds one short paragraph; otherwise the ranked list stands on its own." *Needs:* "Your leads, tasks and listings." *Gives:* "A ranked to-do list with links, and a one-line source label." *Limits:* "Never sends anything. Rewriting the brief uses one AI task."
- BM (draft) — *Apa yang Astra buat:* "Membaca angka semasa anda setiap pagi dan menyusun apa yang perlu dibuat dahulu. Apabila AI dihidupkan, menambah satu perenggan ringkas; jika tidak, senarai keutamaan berdiri sendiri." *Perlu:* "Prospek, tugas dan penyenaraian anda." *Beri:* "Senarai tugasan berkeutamaan dengan pautan, dan label sumber satu baris." *Had:* "Tidak pernah menghantar apa-apa. Menulis semula taklimat menggunakan satu tugas AI."
- ID (draft) — *Apa yang Astra lakukan:* "Membaca angka terkini Anda setiap pagi dan mengurutkan apa yang harus dikerjakan lebih dulu. Saat AI aktif, menambahkan satu paragraf singkat; jika tidak, daftar prioritas berdiri sendiri." *Butuh:* "Prospek, tugas, dan listing Anda." *Memberi:* "Daftar tugas berperingkat dengan tautan, dan label sumber satu baris." *Batas:* "Tidak pernah mengirim apa pun. Menulis ulang brief memakai satu tugas AI."

---

## 2. Zayn — Lead Qualifier (`lead_qualifier`)

| | |
|---|---|
| Route | `/leads` (00086). Shown in the Intel panel on each lead. |
| Feature | `lead_qualify` → Gemini `gemini-3.8-flash`, fallback `claude-haiku-5-5`, 400 tokens. |
| Status | Rules floor: **rule-based · tested** (`unit/qualifier-rules.test.ts`, 3 cases; `rls/lead-intelligence.test.ts`). Model score: **model-powered · routed, unverified**. |

**Verified capabilities**
- Intent score 1–5 from enquiry type and keywords (viewing, money, timing,
  availability) in EN, ID and MS, with a written reason, up to 4 signals and a
  suggested next action. Base by type: viewing request 4, financing/price/availability 3,
  general 2.
- Stored per lead in `lead_intelligence` via `lead_intel_upsert`, with its source and
  model. The page shows the rules estimate on load, labelled "Estimated from the enquiry
  type and wording, without AI"; "Re-qualify" asks the model (one task) when allowed.
- A score sorts the list (`/leads?sort=intent`); it never hides a lead.

**Inputs** — the lead's message, enquiry type, locale, the enquired listing's title,
type, area, bedrooms and price text, and history (event count, responded or not).
**Outputs** — intent 1–5, reason, signals, suggested action, source, model.
**Data access** — the assigned agent's leads only; `lead_intel_upsert` refuses other
agents (tested: "another agent can do neither").
**Example (from the unit tests)** — a viewing request mentioning price and "this
weekend" scores 5: "Enquiry asks to view, talks about price or payment, mentions a
timeframe." Action: "Offer two viewing slots today." A bare general question scores 2;
a terse one lower.
**Limitations / approval** — a sort key, not a verdict. Re-qualify spends one task.
No contact is made. Model path unverified on staging.

**Proposed detail copy**
- EN — *What Zayn does:* "Scores each enquiry 1–5 from what the enquirer wrote and asked, with the reason in plain words, so you reply to the hottest first." *Needs:* "The enquiry message and the listing it is about." *Gives:* "A score, the reason, the signals and a suggested next step." *Limits:* "Sorts, never hides. Re-scoring with AI uses one task."
- BM (draft) — *Apa yang Zayn buat:* "Menilai setiap pertanyaan 1–5 berdasarkan apa yang ditulis dan ditanya, dengan sebab yang jelas, supaya anda membalas yang paling berpotensi dahulu." *Perlu:* "Mesej pertanyaan dan penyenaraian berkaitan." *Beri:* "Skor, sebab, isyarat dan cadangan langkah seterusnya." *Had:* "Menyusun, tidak menyembunyikan. Menilai semula dengan AI menggunakan satu tugas."
- ID (draft) — *Apa yang Zayn lakukan:* "Menilai setiap pertanyaan 1–5 dari apa yang ditulis dan ditanyakan, dengan alasan yang jelas, agar Anda membalas yang paling potensial lebih dulu." *Butuh:* "Pesan pertanyaan dan listing terkait." *Memberi:* "Skor, alasan, sinyal, dan saran langkah berikutnya." *Batas:* "Mengurutkan, tidak menyembunyikan. Menilai ulang dengan AI memakai satu tugas."

---

## 3. Vega — Property Matcher (`property_matcher`)

| | |
|---|---|
| Route | `/leads` (00086). "Find alternatives" in the Intel panel. |
| Feature | None in the call path. `match_rationale` is seeded in `ai_models` but **no code calls it**. Embedding similarity uses feature `embedding` (needs a Gemini key). |
| Status | **Rule-based · tested** (SQL scoring in `lead_matches`; `rls/lead-intelligence.test.ts`: pool, same country, excludes the enquired listing, refuses other agents). Embedding boost: **unverified** (no key on staging). |

**Verified capabilities**
- For one lead, returns up to 3 listings from the agent's own inventory plus
  **active open-pool co-marketing offers in the same country**, excluding the listing
  enquired about, scored on area, kind, price and size, plus embedding similarity when
  both listings have embeddings. Each match carries a score and reasons.
- Results are shown; nothing is sent to the enquirer.

**Inputs** — the lead id. The function reads the enquired listing's facts.
**Outputs** — up to 3 matches: listing id, title, price, area, bedrooms, size, type,
source (`own` or `pool`), score, reasons.
**Data access** — SECURITY DEFINER with owner check; pool listings come only from
`comarketing_offers` with `status='active'` and `scope='open_pool'`. Tested.
**Example (from the test)** — a lead on a 4-bed house in Jakarta Selatan returns other
open-pool or own houses in the same country, never the enquired listing itself, and
returns nothing for another agent.
**Limitations / approval** — no model-written rationale today (the seeded feature is
unused). Three results maximum. Confidential pool data (commission, owner) is not
returned by this function. Nothing is sent without the agent.

**Proposed detail copy**
- EN — *What Vega does:* "Finds up to three other properties for an enquiry, from your own listings and the open co-marketing pool in the same country, with the reasons they fit." *Needs:* "An enquiry on a listing." *Gives:* "Up to three matches with price, area and a reason each." *Limits:* "Suggests only. Sending them to the client is your call."
- BM (draft) — *Apa yang Vega buat:* "Mencari sehingga tiga hartanah lain untuk satu pertanyaan, daripada penyenaraian anda dan kolam pemasaran bersama terbuka di negara yang sama, dengan sebab ia sesuai." *Perlu:* "Satu pertanyaan tentang penyenaraian." *Beri:* "Sehingga tiga padanan dengan harga, kawasan dan sebab." *Had:* "Hanya mencadangkan. Menghantar kepada klien adalah keputusan anda."
- ID (draft) — *Apa yang Vega lakukan:* "Mencari hingga tiga properti lain untuk satu pertanyaan, dari listing Anda dan kolam pemasaran bersama terbuka di negara yang sama, dengan alasan kecocokannya." *Butuh:* "Satu pertanyaan tentang listing." *Memberi:* "Hingga tiga kecocokan dengan harga, area, dan alasan." *Batas:* "Hanya menyarankan. Mengirimnya ke klien adalah keputusan Anda."

---

## 4. Mira — Reply Drafter (`reply_drafter`)

| | |
|---|---|
| Route | `/leads` (00085). Reply panel on each lead. |
| Feature | `secretary_reply` → Gemini `gemini-3.8-flash`, fallback `claude-sonnet-5-5`, 600 tokens. |
| Status | Rules floor: **rule-based · tested** (`unit/secretary-rules.test.ts`, 5 cases). Model draft: **model-powered · routed, unverified**. |

**Verified capabilities**
- Drafts a WhatsApp or e-mail reply in the enquirer's language (ID default, EN, MS),
  greeting by first name, quoting the listing price only when one was given, in the
  agent's name. Model version returns a reply (40–1400 chars), a next step and up to 3
  questions to ask.
- WhatsApp: opens `wa.me` with the text; the agent presses send on their phone. A
  platform WhatsApp send exists (E12) but is **flag-gated and decided by the database**
  (`wa_send_check`); it is not part of this role's claim.
- E-mail: sent through the platform (Resend) only when the agent submits the form; it is
  recorded as the first response and audited (`lead.email_sent`, recipient domain only).
- The timeline records *that* a draft was made and its source, never the text.

**Inputs** — enquirer first name, agent display name, enquiry type, listing title,
type, price text, negotiable flag, area, bedrooms, sizes, the enquirer's message,
locale, channel.
**Outputs** — reply text, next step, questions to ask, source, model.
**Data access** — the assigned agent's lead and its listing; the agent's own display
name and private e-mail (as reply-to). RLS-scoped; no cross-agent read.
**Example (from the unit tests)** — a price question in Indonesian yields a greeting by
first name, the quoted price, and an invitation to view; with no name or price given,
neither is mentioned.
**Limitations / approval** — drafts only; every send is the agent's action. Price is
never invented. One AI task per model draft. Model path unverified on staging.

**Proposed detail copy**
- EN — *What Mira does:* "Drafts a friendly, professional reply to an enquiry in the enquirer's language, for WhatsApp or e-mail, ready for you to edit and send." *Needs:* "The enquiry and its listing." *Gives:* "A reply, a next step and questions worth asking." *Limits:* "Never sends on its own. Quotes only the price you listed. One AI task per AI draft."
- BM (draft) — *Apa yang Mira buat:* "Menggubal balasan mesra dan profesional untuk pertanyaan dalam bahasa penanya, untuk WhatsApp atau e-mel, sedia untuk anda sunting dan hantar." *Perlu:* "Pertanyaan dan penyenaraiannya." *Beri:* "Balasan, langkah seterusnya dan soalan yang patut ditanya." *Had:* "Tidak pernah menghantar sendiri. Hanya memetik harga yang anda senaraikan. Satu tugas AI bagi setiap draf AI."
- ID (draft) — *Apa yang Mira lakukan:* "Menyusun balasan ramah dan profesional untuk pertanyaan dalam bahasa penanya, untuk WhatsApp atau e-mail, siap Anda edit dan kirim." *Butuh:* "Pertanyaan dan listingnya." *Memberi:* "Balasan, langkah berikutnya, dan pertanyaan yang layak diajukan." *Batas:* "Tidak pernah mengirim sendiri. Hanya mengutip harga yang Anda cantumkan. Satu tugas AI per draf AI."

---

## 5. Luna — Listing Copywriter (`listing_copywriter`)

| | |
|---|---|
| Route | `/listings/new` (00083). "Draft with AI" in the listing wizard. |
| Feature | `listing_copy` → Gemini `gemini-3.8-flash`, fallback `claude-sonnet-5-5`, 1200 tokens. |
| Status | Rules floor: **rule-based · no unit test found** (`listing-writer.ts` and `listing-advisor.ts` have no test in `tests/unit`). Model draft: **model-powered · routed, unverified**. Mark as **unverified** until a test exists. |

**Verified capabilities (by code reading)**
- From the form fields already filled in (type, sale/rent, province, regency, area,
  building, bedrooms, bathrooms, parking, floors, sizes, year, furnishing, condition,
  ownership, facilities, price), writes titles and a description (deterministic
  writer), and runs the rules adviser on the result.
- Looks up **comparables** in the catalogue (`listing_comparables`: same country, kind,
  regency, bedrooms) and may quote their count and medians; it is told to say nothing
  about price otherwise.
- Model version returns 1–3 titles (10–90 chars), a description (80–2200 chars), up to
  6 selling points and up to 4 notes for the agent.
- Returns a draft into the form; **never writes to a listing.**

**Inputs** — the wizard fields above, locale, country.
**Outputs** — titles, description, selling points, notes, source, model, comparables.
**Data access** — the agent's own form input plus aggregate comparables (counts and
medians, no owner data). No cross-agent listing text is read.
**Example (by code path)** — a 3-bed house for sale in Jakarta Selatan with 2 bathrooms
and 150 m² yields a title and a description built from those facts and, if the catalogue
has comparables, a line such as "n listings of this kind in the regency, median IDR …".
*(Not observed on staging; stated from the writer and schema.)*
**Limitations / approval** — the agent edits and saves. Comparables are aggregates. No
test covers the deterministic writer; recommend adding one before calling it "tested".
Model path unverified on staging.

**Proposed detail copy**
- EN — *What Luna does:* "Turns the facts you have typed into a listing title and description, with selling points, for you to edit before you save." *Needs:* "The listing form: type, location, rooms, sizes, price." *Gives:* "Up to three titles, a description, selling points and notes." *Limits:* "Drafts into the form; you save. Quotes only comparables the catalogue has."
- BM (draft) — *Apa yang Luna buat:* "Menukar fakta yang anda taip kepada tajuk dan huraian penyenaraian, dengan ciri jualan, untuk anda sunting sebelum simpan." *Perlu:* "Borang penyenaraian: jenis, lokasi, bilik, saiz, harga." *Beri:* "Sehingga tiga tajuk, huraian, ciri jualan dan nota." *Had:* "Draf ke dalam borang; anda yang simpan. Hanya memetik pembanding yang ada dalam katalog."
- ID (draft) — *Apa yang Luna lakukan:* "Mengubah fakta yang Anda ketik menjadi judul dan deskripsi listing, dengan poin jual, untuk Anda edit sebelum disimpan." *Butuh:* "Formulir listing: tipe, lokasi, kamar, ukuran, harga." *Memberi:* "Hingga tiga judul, deskripsi, poin jual, dan catatan." *Batas:* "Draf ke dalam formulir; Anda yang menyimpan. Hanya mengutip pembanding yang ada di katalog."

---

## 6. Kael — Task Planner (`task_planner`)

| | |
|---|---|
| Route | `/tasks` (00087). "Suggest tasks from today's brief", and from a lead. |
| Feature | `task_extract` → Gemini `gemini-3.8-flash`, fallback `claude-haiku-5-5`, 500 tokens. |
| Status | Rules floor: **rule-based · tested** (`unit/task-rules.test.ts`, 3 cases; `rls/tasks.test.ts`, 2 cases). Model proposals: **model-powered · routed, unverified**. |

**Verified capabilities**
- From a lead: the obvious next moves for its enquiry type with due times (viewing
  request → propose two slots, confirm, follow up). From the brief: one task per ranked
  action, due 17:00 that day, capped at five.
- Proposals are shown with tick boxes; `createTasksBulk` saves only what the agent ticks.
  Task kinds: call, message, viewing, document, follow_up, other.

**Inputs** — a lead (message, enquiry type, contact first name, listing title) or
today's ranked brief; locale; today's date.
**Outputs** — proposed tasks (title, kind, due time), source, model.
**Data access** — the agent's own lead or own brief; `agent_tasks` are self-only (tested:
"another agent sees none of it").
**Example (from the unit tests)** — a viewing request from Siti yields "Propose two
viewing slots to Siti", "Confirm the viewing with Siti", "Follow up Siti if there is no
reply", with sensible due times, in EN, ID or MS.
**Limitations / approval** — proposes only; saving is the agent's tick. No reminder is
sent by this role (reminders are the existing cron). Model path unverified on staging.

**Proposed detail copy**
- EN — *What Kael does:* "Turns an enquiry or today's brief into a short task list with due times. You tick the ones you want and they are saved." *Needs:* "A lead, or today's brief." *Gives:* "Up to five proposed tasks with kind and due time." *Limits:* "Proposes only; nothing is saved until you tick it."
- BM (draft) — *Apa yang Kael buat:* "Menukar pertanyaan atau taklimat hari ini kepada senarai tugas ringkas dengan masa akhir. Anda tandakan yang anda mahu dan ia disimpan." *Perlu:* "Satu prospek, atau taklimat hari ini." *Beri:* "Sehingga lima tugas cadangan dengan jenis dan masa akhir." *Had:* "Hanya mencadangkan; tiada yang disimpan sehingga anda tandakan."
- ID (draft) — *Apa yang Kael lakukan:* "Mengubah pertanyaan atau brief hari ini menjadi daftar tugas singkat dengan tenggat. Anda centang yang diinginkan dan tugas tersimpan." *Butuh:* "Satu prospek, atau brief hari ini." *Memberi:* "Hingga lima usulan tugas dengan jenis dan tenggat." *Batas:* "Hanya mengusulkan; tidak ada yang tersimpan sampai Anda centang."

---

## 7. Owner-approval table

| # | Role | Rules floor | Model path | Proposed public label | Content to add | Approve? |
|---|---|---|---|---|---|---|
| 1 | Astra · AI Manager | tested (RLS) | routed, unverified on staging | **Available · rule-based** (AI paragraph when enabled) | detail copy EN/BM/ID above | ☐ |
| 2 | Zayn · Lead Qualifier | tested (unit + RLS) | routed, unverified | **Available · rule-based** (AI re-score when enabled) | detail copy | ☐ |
| 3 | Vega · Property Matcher | tested (RLS) | none in use | **Available · rule-based** | detail copy | ☐ |
| 4 | Mira · Reply Drafter | tested (unit) | routed, unverified | **Available · rule-based** (AI draft when enabled) | detail copy | ☐ |
| 5 | Luna · Listing Copywriter | **no unit test** | routed, unverified | **Available · unverified** until a writer test exists | detail copy + one unit test | ☐ |
| 6 | Kael · Task Planner | tested (unit + RLS) | routed, unverified | **Available · rule-based** (AI proposals when enabled) | detail copy | ☐ |

**Where the content should live — recommendation (needs your decision)**
- **Option A (recommended): translation files.** Add keys under `aiWorkforce.detail.<role_key>`
  in `messages/en.json`, `ms.json`, `id.json`. No database change, no migration, versioned
  in Git, and the i18n parity test enforces all three languages. The detail dialog reads
  them when present.
- **Option B: database.** New jsonb columns on `ai_role_personas` (inputs, outputs,
  limits, example). Requires a migration, staging first, then production, each with
  separate approval.

**Also needed before any role is called "tested with AI":** a provider key on staging
(Worker secret, set by the owner), one observed run per feature with its `ai_jobs` row,
and a screenshot of the model-sourced output. None of that exists today.

**Native review** of all BM and ID text above is still open.
