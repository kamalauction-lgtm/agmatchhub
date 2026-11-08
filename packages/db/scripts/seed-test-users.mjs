#!/usr/bin/env node
/**
 * Create the five accounts the RLS suite signs in as, on a NON-production
 * database, from the TEST_* lines of its env file.
 *
 *   node scripts/seed-test-users.mjs --env=staging
 *
 *   TEST_RA_*     requesting agent  (verified agent, MatchHub requester)
 *   TEST_SA_*     supply agent      (verified agent, MatchHub supplier)
 *   TEST_LA_*     listing agent     (verified agent, co-marketing lender)
 *   TEST_MA_*     marketing agent   (verified agent, co-marketing borrower)
 *   TEST_ADMIN_*  super_admin
 *
 * Passwords: if a TEST_*_PASSWORD line is empty the script generates one and
 * WRITES IT BACK into the env file, so the file and Supabase Auth agree and
 * nobody has to carry a password through chat. Existing passwords are kept
 * and applied to the account (so re-running after a file edit re-syncs).
 *
 * REFUSES PRODUCTION. These are standing accounts, not swept fixtures; the
 * three that exist on production today are a known cleanup item, not a
 * pattern to extend. The e-mail domain is `.test` (RFC 2606) and deliberately
 * NOT the `@fixture.propertiguru.invalid` marker, which the teardown sweeps
 * after every run — seeded users on that domain would vanish on the first
 * `npm test`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./load-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { isProduction, fileName, ref } = loadEnv();

if (isProduction) {
  console.error("Refusing: seed-test-users never runs against production.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error(`NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in ${fileName}`);
  process.exit(1);
}
const admin = createClient(url, service, { auth: { persistSession: false } });

const USERS = [
  { key: "RA", name: "Test Agent One (staging)", kind: "agent" },
  { key: "SA", name: "Supply Sally (staging)", kind: "agent" },
  { key: "LA", name: "Listing Agent (staging)", kind: "agent" },
  { key: "MA", name: "Marketing Agent (staging)", kind: "agent" },
  { key: "ADMIN", name: "Test Admin (staging)", kind: "admin" },
];

const envPath = join(root, fileName);
let envText = readFileSync(envPath, "utf8");
const envLine = (name) => envText.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() ?? "";
const setEnvLine = (name, value) => {
  envText = envText.replace(new RegExp(`^${name}=.*$`, "m"), `${name}=${value}`);
};

// One listing is enough to find existing accounts; a staging project is small.
const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) throw listErr;
const byEmail = new Map(list.users.map((u) => [u.email?.toLowerCase(), u]));

const { data: superRole } = await admin.from("roles").select("id").eq("key", "super_admin").single();

let written = 0;
for (const u of USERS) {
  const email = envLine(`TEST_${u.key}_EMAIL`);
  if (!email) {
    console.error(`TEST_${u.key}_EMAIL is empty in ${fileName}; add it and re-run.`);
    process.exit(1);
  }
  if (/@fixture\.propertiguru\.invalid$|@staging\.propertiguru\.invalid$/.test(email)) {
    console.error(`TEST_${u.key}_EMAIL uses a swept fixture domain (${email}); use *.test instead.`);
    process.exit(1);
  }
  let password = envLine(`TEST_${u.key}_PASSWORD`);
  if (!password) {
    password = randomBytes(12).toString("base64url") + "!A1";
    setEnvLine(`TEST_${u.key}_PASSWORD`, password);
    written++;
  }

  let user = byEmail.get(email.toLowerCase());
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { display_name: u.name },
    });
    if (error) throw new Error(`create ${email}: ${error.message}`);
    user = data.user;
    console.log(`created   ${u.key.padEnd(5)} ${email}`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) throw new Error(`update ${email}: ${error.message}`);
    console.log(`synced    ${u.key.padEnd(5)} ${email}`);
  }

  // Profile row is auto-provisioned by trigger on user creation; upsert covers
  // both the fresh and the re-run case.
  const { error: pErr } = await admin.from("profiles").upsert({
    id: user.id, display_name: u.name, agent_status: "verified",
    country_code: "ID", preferred_language: "id",
  });
  if (pErr) throw new Error(`profile ${email}: ${pErr.message}`);

  const { error: uErr } = await admin.from("users_private").upsert({ user_id: user.id, email, full_legal_name: u.name });
  if (uErr) throw new Error(`users_private ${email}: ${uErr.message}`);

  if (u.kind === "agent") {
    const { error: aErr } = await admin.from("agent_profiles").upsert({
      user_id: user.id, full_legal_name: u.name, country_code: "ID", submitted_at: new Date().toISOString(),
    });
    if (aErr) throw new Error(`agent_profile ${email}: ${aErr.message}`);
  } else {
    const { error: rErr } = await admin
      .from("user_roles")
      .upsert({ user_id: user.id, role_id: superRole.id }, { onConflict: "user_id,role_id" });
    if (rErr) throw new Error(`role ${email}: ${rErr.message}`);
  }
}

if (written) {
  writeFileSync(envPath, envText);
  console.log(`\n${written} generated password(s) written into ${fileName} (never printed).`);
}
console.log(`\nTest users ready on ${ref}.`);
