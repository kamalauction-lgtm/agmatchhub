# P0-d assisted listing import: plan (read-only)

Prepared 10 Nov 2026 from the storyboard (screens 5, 6 and 14), the importer review and the current code.

**Status:** P0-d-1 is approved (with the moderation rule), built in [PR #14](https://github.com/kamalauction-lgtm/agmatchhub/pull/14) and **staging-validated** on 10 Nov 2026.
- At `97af7d2`, both GitHub jobs passed.
- Staging Hub version `5e040f5d…`: database tests 19/19, Hub checks 20/20.
- `00107` is on staging only.
- P0-d-2 and photos are not built.

**Holds that stay in place:**
- P0-c is on hold until counsel answers Q1–Q4 and approves the wording for Malaysia and Indonesia (`docs/legal/p0c-declaration-review-brief.md`, section 5).
- Photos stay in P0-e-1.

**Stack:** this plan builds on PR #13 (`c23e29f`), which sits on #12 and #10.

## Roles

`listing.import_assisted` will be granted to exactly the three roles that hold `agent.invite`:
- **`super_admin`** (all countries);
- **`admin`** (all countries, or the countries on the grant);
- **`country_admin`** (the countries on the grant).

`compliance_admin` does not get it. Role changes stay with `roles.manage`, which only `super_admin` holds.

## What the code does today

| Fact | Evidence | Consequence |
|---|---|---|
| The commit uses the caller as owner. Properties, listings and the authority consent are all written with `user.id`, and the caller is never checked against `batch.agent_id`. | `apps/hub/src/app/(agent)/listings/import/commit-actions.ts:44,77,143,155,175,186` | **D15, found in the code, not exercised:** an admin who can see an agent's batch and runs the agent commit on it would create listings owned by the admin, with the declaration recorded under the admin. |
| The admin table rules on `import_batches` and `import_items` check country only (`admin_sees_user` / `admin_sees_import_batch`, from 00105) | staging `pg_policies` | Any in-scope admin role can write batches and items, `compliance_admin` included. No permission is checked. |
| The agent's own-batch rules key on `agent_id = auth.uid()` | `00057` | A batch created **with `agent_id` set to the agent** shows up in that agent's import history without any change. |
| Only a verified agent may insert a property | the `properties agent insert` policy | An invited agent can review a prepared batch, but can commit only after verification. |
| Country, currency and language are hard-coded to ID, IDR and id | `commit-actions.ts:144,179–181` (D8) | MY imports are mis-tagged. |
| Photo URLs are extracted but never saved | D5 | Stays in **P0-e-1**. |

## The split: what can proceed now, and what waits on counsel

The listing import declaration (`listing_import_authority`) is the only point where counsel's answer matters. If **the agent accepts it personally and commits their own batch**, every answer counsel might give is satisfied. Only an **admin committing for the agent** needs Q1 and Q2.

| Work | Depends on counsel? |
|---|---|
| The `listing.import_assisted` permission; an admin prepares a batch **owned by the agent**; country and permission checks; audit | No |
| The agent reviews the prepared batch and **commits it personally**, accepting `listing_import_authority` in their own session (today's path) | No |
| Fix D15 (the commit must be run by the batch owner) and D8 (country from the agent) | No |
| **An admin commits a batch for the agent** (delegated acceptance) | **Yes, Q1 and Q2** |
| Photo rights and copying photos into the gallery | P0-c wording, then P0-e-1 |

## The smallest independently testable slice: P0-d-1, "admin prepares, agent commits"

**Database (`00107`, staging first):**
1. **The permission:** `listing.import_assisted`, granted to `super_admin`, `admin` and `country_admin`.
2. **A new column:** `import_batches.acting_admin_id` (FK to `auth.users`, rule 6). It is NULL for agent-made batches.
3. **Batch creation:** a definer function `admin_import_batch_create(p_agent, p_source_kind, p_portal, p_label)`.
   - It requires `has_capability_in('listing.import_assisted', <agent's country>)`.
   - It sets `agent_id` to the agent and `acting_admin_id` to `auth.uid()`; the caller can't supply either.
   - It audits `listing_import.assisted_batch_created`.
4. **Tighter admin rules on batches and items:** reads stay `admin_sees_*`; writes require `listing.import_assisted` for the agent's country, through a new definer helper `admin_can_import_for(agent)`.
5. **A database guard for D15:** a `BEFORE INSERT` trigger on `consent_records` refuses a row whose `import_batch_ref` points at a batch the caller doesn't own. This stops an admin-held authority consent being recorded for an agent's batch, whatever the Hub does.

**Hub:**
- **Admin pages:**
  - `/admin/imports` lists agents in scope and creates a batch for one of them.
  - `/admin/imports/[batchId]` runs the existing adapters and spreadsheet parser into that batch, and lets the admin review and edit items using the existing `import-review` component, with no commit button.
  - **Hand over** sends a `portfolio_ready` notification in English, Indonesian and Malay.
- **The commit action** (`commit-actions.ts`):
  - refuses unless `batch.agent_id === user.id` (D15);
  - takes country, currency and language from the agent's profile and `countries`, and matches locations with `match_location(country)` (D8).
- **The agent's import history:** a batch with `acting_admin_id` set is labelled "Prepared by the platform team".

**Audit: telling the admin apart from the agent**

| Event | Actor (`audit_logs.actor_id`) | Role (stamped by 00103) | Where the agent appears |
|---|---|---|---|
| `listing_import.assisted_batch_created` | the admin | the admin's role | `new_values.agent_id`, and `import_batches.agent_id` |
| `listing_import.assisted_items_added` and `…_item_edited` | the admin | the admin's role | through the batch |
| `listing_import.assisted_handed_over` | the admin | the admin's role | notification recipient |
| `listing_import.committed` (existing) | **the agent** | `agent` / `user` | the actor |
| The authority consent (`consent_records`) | **the agent** (`user_id`) | — | — |
| The listing and property rows | `agent_id` and `created_by` are **the agent** | — | the preparing admin is traceable through `import_items.listing_id → import_batches.acting_admin_id` |

**Acceptance tests** (database tests on staging, plus HTTP checks against the deployed staging Hub, as in P0-a and P0-b):
1. `listing.import_assisted` is held by exactly `super_admin`, `admin` and `country_admin`.
2. A MY `country_admin` creates a batch for a MY agent. Creating one for an ID agent is refused with `42501`. `compliance_admin`, a plain agent and anonymous users are refused.
3. `acting_admin_id` equals the caller and `agent_id` equals the chosen agent. Neither can be set to anything else through the function or a direct write.
4. The scoped admin can add and edit items only in in-scope batches. `compliance_admin` can read in-scope batches but write nothing.
5. The agent sees the prepared batch and its items in their own history. Another agent sees nothing.
6. An admin running the commit on the agent's batch is refused in the Hub, and no admin-held authority consent can be inserted (D15).
7. The verified agent commits. The resulting listings have `agent_id` and `created_by` set to the agent, the agent's country, currency and language, and status `draft` / `pending`. The consent's `user_id` is the agent, with `import_batch_ref` set.
8. An agent still under review cannot commit until verified.
9. Audit rows exist for create, items, handover and commit, with the actors shown in the table above.
10. Existing agent self-imports behave exactly as before. The existing `listing-import` tests stay green.
11. Photos are still not saved to the gallery; this stays P0-e-1.
12. Only if the owner approves the rule in the decision below: the admin who prepared a batch cannot approve moderation of its listings, and another admin can.

**Not in P0-d-1:**
- an admin committing on the agent's behalf (P0-d-2, after counsel's Q1 and Q2);
- photos (P0-e-1);
- sync from approved sources (P2).

## Decision needed before implementation

Approve P0-d-1 as defined above: the admin prepares, and **the agent accepts and commits personally**. The D15 and D8 fixes are included.

Also choose one: **should the admin who prepared a batch be barred from approving moderation of the listings it produced?** This applies the P0-b separation-of-duties rule to listings.
- **Recommended: yes.** Same trigger pattern as P0-b, and test 12 applies.
- **No:** leave moderation as it is.

Counsel isn't needed for P0-d-1. P0-d-2 stays blocked on Q1 and Q2.
