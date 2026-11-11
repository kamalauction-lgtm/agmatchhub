# Admin Platform 2.0: staging acceptance checklist

**Staging Hub:** https://hub-staging.propertiguru.id (version `562c2512`, schema `00127`, nothing pending).
**Code:** `main` at `3d6c67a` (#10–#36 merged: all 14 screens and the Import Assistant contract).

**Who to sign in as:** the standing staging accounts in `packages/db/.env.staging`:
- `TEST_ADMIN`: global super admin;
- `TEST_CA`: Malaysia-only country admin;
- `TEST_MA`: agent.

Use test data only. Each step says what you should see. Tick a box when it does.

| # | Screen | Link | Steps (and expected result) | Automated evidence |
|---|---|---|---|---|
| 1 | Command Centre | [/admin](https://hub-staging.propertiguru.id/admin) | 1. As TEST_ADMIN: the **Action queue** is at the top with count tiles; the most urgent and oldest items come first. 2. The nav shows the nine workspaces, and search is in the top bar. 3. As TEST_CA: only Malaysian items appear. 4. As TEST_MA: you are sent to the dashboard. | 8/8 (order equals an independent ranking) |
| 2 | Acquisition pipeline | [/admin/agents/pipeline](https://hub-staging.propertiguru.id/admin/agents/pipeline) | 1. As TEST_CA, with no retention set for MY: the page says it is locked (decision 5). 2. As TEST_ADMIN on [/admin/countries](https://hub-staging.propertiguru.id/admin/countries), set MY's prospect retention to 90 and save. 3. As TEST_CA: add a prospect; its card says "Deleted on …" 90 days ahead. 4. Move it to Contacted, then delete it. 5. Clear MY's retention again afterwards. | RLS 5/5; end to end 17/17 (with #8 and #14) |
| 3 | Invitations | [/admin/agents/invitations](https://hub-staging.propertiguru.id/admin/agents/invitations) | 1. As TEST_CA: create an invitation for a MY test address and see it listed as pending. 2. Revoke it. **Do not** complete the activation: its declarations wait on counsel (D-1). | P0-b tests |
| 4 | Agent 360 | [/admin/agents](https://hub-staging.propertiguru.id/admin/agents?status=all) | 1. Search a test agent by name and filter MY. 2. Open them: the portfolio, consent and account panels appear. 3. Suspend with a reason: their live listings pause. 4. As that agent, they see the suspension notice with the reason. 5. Restore: the listings come back. | 16/16; RLS 5/5 |
| 5 | Import Workbench | [/admin/imports](https://hub-staging.propertiguru.id/admin/imports) | 1. As TEST_CA: prepare a small spreadsheet batch for a MY test agent and hand it over. 2. As the agent, the batch is waiting at /listings/import. **The admin committing on the agent's behalf** waits on counsel (D-2). | 20/20 |
| 6 | Batch Review | the batch page from step 5 | 1. Tick two items and set type "terrace" and "rent". 2. You see "2 items updated", and the changes show as the team's edits. | 13/13 |
| 7 | Photo Quality Centre | [/admin/media](https://hub-staging.propertiguru.id/admin/media) | 1. The queue loads with the $0 meter. 2. Open a photo needing attention: keep it out, or retry it. AI review states that it is not running (D-4). | multiple, all green |
| 8 | Sources and mapping | [/admin/sources](https://hub-staging.propertiguru.id/admin/sources) | 1. As TEST_ADMIN: "rumah123" is listed as seen in imports. Register it. 2. Save a mapping such as `{"luas_tanah":"landSize"}`. 3. Set the terms review to "Agent-supplied only". 4. The re-sync notice explains it is unavailable (D-7). 5. As TEST_CA: there are no controls. | RLS 3/3; 17/17 |
| 9 | Moderation | [/admin/listings](https://hub-staging.propertiguru.id/admin/listings), [reports](https://hub-staging.propertiguru.id/admin/listings/reports) | 1. Approve one listing and reject one with a reason code. 2. On the marketplace staging dev server, report a listing. "Reported (n)" goes up. 3. Mark the report actioned. | 35/35; 17/17 |
| 10 | Leads and requests | [/admin/leads](https://hub-staging.propertiguru.id/admin/leads), [/admin/requests](https://hub-staging.propertiguru.id/admin/requests) | 1. The 30-day lead figures appear, with the per-agent table. 2. As TEST_CA: only Malaysian figures. 3. No buyer phone or email appears anywhere. | 9/9; 8/8 (synthetic MY and ID leads) |
| 11 | Commercial and growth | [/admin/organisations](https://hub-staging.propertiguru.id/admin/organisations) | 1. Create a test organisation in MY and edit its registration number. 2. Its detail page shows prices in its market currency. 3. A MY-only commercial admin cannot choose another country. | 9/9; RLS 3/3 |
| 12 | AI Workforce | [/admin/ai](https://hub-staging.propertiguru.id/admin/ai), [Office](https://hub-staging.propertiguru.id/admin/ai/office) | 1. Costs read **"Not yet available"**. 2. The Office view shows the platform's AI roles. Refresh keeps platform data. 3. As TEST_MA, /ai/office still shows only their own work. 4. As TEST_CA, the admin Office is refused. | 8/8; Import Assistant fixtures 11/11 |
| 13 | Countries and permissions | [/admin/audit](https://hub-staging.propertiguru.id/admin/audit), [/admin/countries](https://hub-staging.propertiguru.id/admin/countries) | 1. Filter the audit trail by role and dates, then export the CSV. The export itself appears in the trail. 2. Edit an inactive country's timezone and terms, then put them back. 3. As TEST_CA: no audit link, and the audit page is refused. 4. Searching for an Indonesian agent as TEST_CA finds nothing. | 9/9; RLS 5/5 |
| 14 | Handover and reporting | [/admin/handover](https://hub-staging.propertiguru.id/admin/handover), [report](https://hub-staging.propertiguru.id/admin/handover/report) | 1. Ask a test agent for a change and see it on Handover. 2. Once the agent handles every item of a batch, the batch shows "Agent in control", and the team can no longer edit those listings. 3. The report shows batch times, 14-day activation and weekly trends; the admin-effort section appears for audit.view holders only. | 20/20; 11/11; 17/17 |

**Every screen, every role:** the read-only route sweep found no error page for the global admin, MY admin or agent. Every refusal matches a missing capability.

## DEMO data on staging

`packages/db/scripts/seed-staging-admin-demo.mjs` (staging only) lays down records labelled **[DEMO]** for Malaysia and Indonesia:
- 4 agents (`@demo.propertiguru.test`, no phone);
- 12 prospects across all six stages (fictional `+60 12-000…` / `+62 812-0000…` numbers, `@example.test` emails);
- 5 sources: allowed, agent-supplied only, unreviewed, forbidden, and a global partner feed;
- 8 assisted batches over 8 weeks (complete, in review, preparing), with 24 items;
- change requests with answer times;
- 10 invitations (redeemed, pending, revoked).

Nothing is sent: rows are written directly, with no notifications, email or WhatsApp. MY and ID prospect retention is set to 90 days **on staging only**, and only where none was set.

```bash
node scripts/seed-staging-admin-demo.mjs --env=staging            # (re)create, safe to rerun
node scripts/seed-staging-admin-demo.mjs --env=staging --remove   # remove only these DEMO rows
```

Run these from `packages/db`. The marketplace demo listings from `seed-staging-demo.mjs`, also titled "[DEMO]", are not touched.

**Walkthrough (about 15 minutes):**
1. As TEST_ADMIN, open [Pipeline](https://hub-staging.propertiguru.id/admin/agents/pipeline). You should see 12 DEMO prospects, MY and ID, at every stage. Move "[DEMO] Farid Hakim" from New to Contacted.
2. Open [Sources](https://hub-staging.propertiguru.id/admin/sources). You should see the five DEMO sources with their terms badges. Open "[DEMO] Rumah123", which is unreviewed, and note that re-sync is unavailable (D-7).
3. Open the [Handover report](https://hub-staging.propertiguru.id/admin/handover/report). You should see 8 batches, median preparation and review times, 14-day activation, and weekly trends. The admin-effort section is visible.
4. Open [Handover](https://hub-staging.propertiguru.id/admin/handover) and [Invitations](https://hub-staging.propertiguru.id/admin/agents/invitations). Then search for "DEMO" in [Agent 360](https://hub-staging.propertiguru.id/admin/agents?status=all&q=DEMO).
5. Sign out, then sign in as TEST_CA (MY only) and repeat steps 1 to 4. You should see only the 6 MY prospects, the 4 MY batches, MY agents and MY invitations. The report shows MY figures without the admin-effort section. Sources are a global registry, so they are listed read-only, with no controls.
6. As TEST_MA (agent), every admin link above sends you back to the dashboard.

Automated read-only check of the above on version `562c2512`: **18/18**.

## Features that still need a decision

| Decision | Needed for |
|---|---|
| **D-1** Counsel: activation declaration wording, and the OTP and passkey steps | #3 activation |
| **D-2** Counsel: may the team commit imports on the agent's authority | #5 last step |
| **D-3** Photo rights: `import_photos` for real agents | imported photos for real agents |
| **D-4** AI provider: provider, model, verified rates, spending cap | #12 Import Assistant (live), real costs; #7 AI review |
| **D-5** Locations: Sabah and Sarawak lists, township level | #13 location items |
| **D-6** Prospect retention period per country | #2 storing prospects |
| **D-7** Legal review of portal terms, and access per source | #8 re-sync |
| **D-8** Images cap split (staging 500 / production 4,000) | photo processing headroom |
| **D-9** Malay phrase reviewer | #12 Malay copy |
