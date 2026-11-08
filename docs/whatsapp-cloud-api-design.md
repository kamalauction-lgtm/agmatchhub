# WhatsApp Cloud API — design and scaffold (E12)

*8 November 2026. Owner decision D8 (7 Nov 2026): WhatsApp through Meta's official Cloud API, directly. GoHighLevel is not cancelled and no active number is migrated until the replacement passes testing. No unsolicited or paid WhatsApp; outbound WhatsApp needs its own approval. Status board: [stage-b-build-log.md](stage-b-build-log.md).*

This document is both the design and the record of what was built as the scaffold (migrations 00095–00096, `apps/hub/src/lib/whatsapp/`, `/api/whatsapp/webhook`, `/admin/whatsapp`, the platform door on `/leads`). Everything below marked **built** exists on staging and is tested; everything marked **later** is designed, not built.

---

## 1. What problem this solves, and what it must not do

Today an agent answers a marketplace lead by opening `wa.me` with a drafted text and pressing send on their own phone. That is honest, free, and invisible to the platform: no record that the lead was answered, no delivery status, no inbox when the buyer writes back. The Secretary cannot follow up what it cannot see.

The Cloud API gives the platform its **own numbers** — one per country — through which a buyer's WhatsApp reply lands on the lead's timeline and the agent's reply goes out from the platform, recorded and status-tracked. Four things it must never do, because the owner said so and because Meta enforces most of them anyway:

| Must not | Where it is enforced |
|---|---|
| Message anyone who did not write first, except with a Meta-approved template | `wa_send_check()` — session text only inside the 24-hour window |
| Send marketing without consent | `wa_send_check()` — marketing templates need `contacts.marketing_consent` **and** the `whatsapp_marketing` switch |
| Message a number that said STOP | `wa_opt_outs` — global, permanent, no delete path |
| Run campaigns | there is no bulk function, table or scheduler; one message, one lead, one agent action |

And one operational rule from D8: **GHL keeps its numbers.** The platform numbers are new (or Meta's test number during the pilot). The migration of 019-391 8000 or any other live GHL number to the Cloud API is a separate, later decision after this passes testing (§9).

---

## 2. Architecture

```
buyer's WhatsApp ──► Meta ──► POST /api/whatsapp/webhook ──► handleWebhook()
                                 X-Hub-Signature-256            │ verify (app secret)
                                                                │ record wa_webhook_events (hash-unique when verified)
                                                                ├─ messages  → wa_record_inbound()  → wa_messages, contacts.wa_last_inbound_at,
                                                                │                                      lead_events, notification, STOP → wa_opt_outs
                                                                └─ statuses  → wa_record_status()   → wa_messages.status (never regresses)

agent on /leads ──► sendOnLead() ──► wa_send_check() as the agent (RLS + auth.uid)
                                 ──► Graph API POST /{phone_number_id}/messages  (Bearer WHATSAPP_ACCESS_TOKEN)
                                 ──► wa_record_outbound() as the service → wa_messages, lead_events, first_responded_at
```

- **The rules live in Postgres** (`wa_send_check`), not in the UI and not in the adapter. The leads page asks the same function to decide which door to draw; the send action asks it again before sending. The two can never disagree.
- **Writes are service-only.** Agents hold no insert/update grant on any `wa_*` table. Inbound, outbound and status rows are written by SECURITY DEFINER functions that refuse a non-null `auth.uid()`.
- **One token, many numbers.** A Meta system-user token (Worker secret) serves every number in the WhatsApp Business Account; the `phone_number_id` per country is a row an admin edits.
- **Mode per number:** `off` (default) · `test` (Meta's developer test number; the row lists the only recipients it may reach, and SQL refuses anyone else before Meta is called) · `live` (typed confirmation).

### Files (built)
| Piece | Path |
|---|---|
| Schema, rules, recording functions | `packages/db/supabase/migrations/00095_whatsapp_cloud.sql`, `00096_whatsapp_inbound_fixes.sql` |
| Pure webhook module (signature, handshake, payload shape, template helpers) | `apps/hub/src/lib/whatsapp/webhook.ts` |
| Graph API client (two calls: session text, template) | `apps/hub/src/lib/whatsapp/client.ts` |
| Orchestration (`sendOnLead`, `handleWebhook`) | `apps/hub/src/lib/whatsapp/index.ts` |
| Webhook route (GET handshake, POST deliveries) | `apps/hub/src/app/api/whatsapp/webhook/route.ts` |
| Agent send actions | `apps/hub/src/app/(agent)/leads/whatsapp-actions.ts`; door in `components/leads/reply-panel.tsx` |
| Admin console | `apps/hub/src/app/(admin)/admin/whatsapp/` |
| Tests | `packages/db/tests/unit/whatsapp-webhook.test.ts` (7), `tests/rls/whatsapp.test.ts` (6) |

---

## 3. Data model (built)

| Table | Purpose | Who reads | Who writes |
|---|---|---|---|
| `wa_accounts` | one row per country: `display_phone`, `phone_number_id`, `waba_id`, `mode`, `test_recipients[]`, `quality_rating` | any signed-in user (no secrets in it) | `platform.configure` |
| `wa_templates` | registry mirroring what was submitted to Meta: name, language, `category` utility/marketing/authentication, `status` draft/pending/approved/rejected/paused, body with `{{n}}`, `variables` | agents see **approved** only; admins all | `platform.configure` |
| `wa_opt_outs` | phone (E.164) → `source` inbound_stop/agent/admin | admins | admins insert; `wa_record_inbound` on STOP; **no update/delete** |
| `wa_messages` | every message in/out: account, contact, lead, agent, direction, kind, template, body, `wa_message_id` (unique), from/to, status, error, Meta pricing category, conversation id | the lead's agent (through the lead) and admins | functions only |
| `wa_webhook_events` | every delivery: body hash (unique **when verified**), signature verdict, counts, payload, outcome | admins | service |
| `contacts.wa_last_inbound_at` | the fact the 24-hour window is computed from | as contacts | `wa_record_inbound` |

Buyer PII follows the existing rule (00033): an agent reaches a WhatsApp thread only through a lead assigned to them. A message from a number nobody knows is recorded with no lead and no contact — the admin inbox sees it, no agent does, and **nobody is messaged back** (no auto-reply in the scaffold; see §8).

---

## 4. The rules engine — `wa_send_check(lead, kind, template)` (built)

Returns `ok` or the reason, in this order:

1. `not_found` · `not_your_lead` (caller is not the lead's agent; the service passes)
2. `feature_off` — `is_feature_enabled('whatsapp_cloud', agent)`; the flag is targeted per person/country/agency, so the pilot cohort can be switched on without anyone else
3. `no_account` — no switched-on number for the agent's country
4. `no_phone` · `opted_out` (global list) · `not_test_recipient` (test mode)
5. `kind = session` → `window_closed` unless `contacts.wa_last_inbound_at` is within 24 h, else `ok`
6. `kind = template` → `template_unknown` (not this account's) · `template_not_approved` · for `marketing`: `marketing_not_approved` (switch) then `no_marketing_consent` · else `ok`

Why a function and not application code: the same verdict drives the UI (which door to draw), the action (whether to send) and the audit (why it was refused), and an agent cannot reach around it because the tables are not writable.

---

## 5. Flows

### 5.1 Buyer writes to the platform number (built)
Meta POSTs → signature verified with the app secret → delivery recorded (a verified body is unique; an unverified copy of the same body can never suppress the real one — found and fixed by the first proof, 00096) → for each message: `wa_record_inbound` deduplicates on `wamid`, finds the contact by phone, opens the window, attaches to the contact's **most recent open lead**, writes `lead_events.whatsapp.received`, notifies the agent (`whatsapp_received`), and on STOP / BERHENTI / HENTI / UNSUBSCRIBE writes the permanent opt-out instead of a notification. Media arrives as kind `media` with its caption as the body; the media itself is **not downloaded** in the scaffold (later: Graph `GET /{media_id}` → storage, same bytes-first verification Hero learned to need).

### 5.2 Agent replies from the platform number (built)
On `/leads`, with the flag on and a number on for the agent's country, the Secretary panel gains a second door next to *Open WhatsApp with this text*: **Send from the platform number** when the window is open; when it is closed, the panel says so and offers the **approved templates** for that number with their variables. The action calls `sendOnLead`: check → Graph API → `wa_record_outbound` (message row, `lead_events.whatsapp.sent`, and the lead's `first_responded_at` stamped exactly as an e-mail reply does; a refused send is recorded as `failed` with the reason and stamps nothing). `wa.me` stays available in every state.

### 5.3 Delivery status (built)
Meta's `statuses` → `wa_record_status`: sent → delivered → read, never backwards (a late `sent` after `read` keeps `read`); `failed` carries Meta's error code and title; the pricing category and conversation id are kept for the cost report (§7).

### 5.4 Lead from an unknown number (later)
A stranger's message is held for the admin inbox today. The designed next step, mirroring Hero's recruitment inbox (Sept 2026): classify by content (property enquiry with a listing reference → create a lead for that listing's agent through a definer function with the same validation as `submit_public_inquiry`; recruitment → hand to Hero; opt-out → list), **one greeting ever**, test numbers never reach the real CRM. Not built: needs the owner's wording for the greeting and the decision on who owns an unreferenced stranger.

---

## 6. Meta setup — what the owner does (none of it is done)

1. **Meta Business verification** for the legal entity that will own the WABA (IQI AG Group or PropertiGuru's entity — owner decision; this decides which display name buyers see).
2. In Meta for Developers: an **app** of type Business with the WhatsApp product. Note the **App Secret** → `WHATSAPP_APP_SECRET`.
3. A **WhatsApp Business Account**; a **system user** with `whatsapp_business_messaging` + `whatsapp_business_management`, a **permanent token** → `WHATSAPP_ACCESS_TOKEN`. Never a user token (they expire in 24 h / 60 days).
4. **Numbers.** For the 27–28 Nov pilot: the app's **test number** (free, reaches up to five verified recipients — the pilot's 2 MY + 2 ID + 1 fits exactly; put those five numbers on the row as `test_recipients`). For production: two **new** numbers (MY, ID) not registered to any other WhatsApp — not the GHL numbers (§9). Each number's `phone_number_id` and the `waba_id` go on `/admin/whatsapp`.
5. **Webhook.** In the app's WhatsApp → Configuration: callback URL `https://hub.propertiguru.id/api/whatsapp/webhook`, verify token of your choosing → `WHATSAPP_VERIFY_TOKEN`; subscribe to the **`messages`** field. The GET handshake is built; Meta accepts it the moment the three secrets are in the Worker (`wrangler secret put` in `apps/hub`) and the route is deployed.
6. **Templates.** Submit each template in Meta (name, language, category, body with `{{n}}`); register the same text on `/admin/whatsapp` and set its status as Meta decides. Rules Meta enforces and the admin form checks: body cannot start or end with a variable; variables are `{{1}}…{{n}}` in order; max 10. Suggested first set (utility): `viewing_confirmed`, `viewing_reminder`, `enquiry_followup`, each in id/ms/en.
7. **Staging first.** The same three values in `packages/db/.env.staging` make the staging dev server (`npm run dev:staging -w @pg/hub`) answer the handshake and take real deliveries through a tunnel; the account rows on staging point at the test number. Nothing goes to production before `APPROVE PRODUCTION`.

Secrets are never pasted in chat or committed; the admin page shows presence only.

---

## 7. Cost model and the paid line

Meta bills **per message by category** since 1 July 2025 (marketing, utility, authentication; utility inside an open customer-service window is free; service conversations — replies to a buyer who wrote first — are free). Prices are per country rate card; Indonesia and Malaysia differ. The scaffold stores Meta's `pricing.category` on every status update, so the cost report is a `group by pricing_category, account` over `wa_messages` — no estimate needed.

What D8 gates as **paid** is exactly the marketing category: it is behind its own switch (`whatsapp_marketing`, off), requires consent per contact, and has no bulk path. Utility templates (viewing confirmations, reminders) are the normal post-window case and are the ones to approve first.

---

## 8. Not built, on purpose

- **Auto-reply / greeting** to unknown numbers (needs the owner's wording and the stranger-ownership decision).
- **Media download** (caption only today).
- **Bulk sends, broadcasts, scheduled campaigns** (D8).
- **Template sync from Meta's management API** (the registry is maintained by hand; sync is a convenience, not a control).
- **Interactive buttons / lists / Flows.**
- **Migration of any GHL number** (§9).
- **A GHL client.** The `leads.ghl_*` columns from 00033 stay unused in this phase: the platform's leads do not sync to GHL, and GHL's conversations do not flow here. Hero remains GHL's consumer; PropertiGuru speaks to Meta directly.

---

## 9. GHL coexistence and the cut-over test

GHL keeps every number it has today. The platform numbers are additional. The replacement "passes testing" (D8's condition for ever migrating a number) when, on staging with the test number and then on production with a new number, all of the following hold for one full pilot week:

1. Every inbound to the platform number is on a lead's timeline within a minute, with no `bad_signature` events except deliberate tests.
2. Every outbound session text and utility template reaches `delivered`, and failures carry a Meta error code the admin can act on.
3. No message was sent to an opted-out number (query `wa_messages` joined to `wa_opt_outs`, must be empty).
4. No message was sent outside the window without an approved template (every `out` row is either within 24 h of the contact's last inbound at `sent_at` or has a `template_id`).
5. The agents in the pilot prefer the platform door to `wa.me` for at least half their replies (adoption, not just correctness).

Only after that is a GHL number's migration worth discussing — and it is its own decision, because a migrated number loses its GHL workflows (recruitment REC 01–04, Hero intake) unless those are rebuilt first.

---

## 10. Pilot plan (27–28 Nov) for this channel

- Flag `whatsapp_cloud` targeted to the five pilot agents only; `whatsapp_marketing` stays off.
- MY and ID rows in `test` mode on the Meta test number, the five agents' own numbers as `test_recipients` (they play the buyer with their own phones).
- Script: buyer writes → agent sees it on the lead → agent replies from the platform door → status reaches delivered → buyer writes STOP → platform refuses every further send → admin sees the opt-out.
- Exit: the five checks in §9 on the pilot's own traffic, then the readiness report.

---

## 11. Open decisions for the owner

1. Which legal entity owns the WABA and what display name buyers see (brand rule: the platform ships neutral; "IQI" visibility is a later switch).
2. Whether unknown senders ever get an automatic greeting, and its wording in id/ms/en.
3. The first template set to submit to Meta (suggested in §6.6).
4. Whether a buyer's reply should also re-open a closed lead (today: attaches to the most recent **open** lead; a closed lead's buyer lands in the admin inbox).
