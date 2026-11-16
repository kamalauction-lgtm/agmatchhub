#!/usr/bin/env node
/**
 * Create the five PILOT REHEARSAL accounts on a NON-production database, so the
 * onboarding script can be walked through on hub-staging before real agents
 * join. Composition mirrors the pilot roster: 2 Malaysia, 2 Indonesia,
 * 1 cross-border collaboration agent. These are rehearsal fixtures, NOT the
 * pilot roster — the real roster is filled only from accounts real agents
 * create themselves on production.
 *
 *   node scripts/seed-pilot-rehearsal.mjs --env=staging
 *
 * Credentials live in the git-ignored env file as PILOT_<SLOT>_EMAIL /
 * PILOT_<SLOT>_PASSWORD. Missing lines are appended; empty passwords are
 * generated and written back, never printed. After creation each account is
 * signed in once with the anon key, in-process, to prove the credentials work.
 *
 * REFUSES PRODUCTION. E-mail domain is `.test` (RFC 2606), not a swept fixture
 * domain, so the RLS suite's teardown leaves these accounts alone.
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
  console.error("Refusing: seed-pilot-rehearsal never runs against production.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !service || !anon) {
  console.error(`NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY missing in ${fileName}`);
  process.exit(1);
}
const admin = createClient(url, service, { auth: { persistSession: false } });

const SLOTS = [
  { key: "MY_A", email: "pilot-my-a@rehearsal.propertiguru.test", name: "Pilot MY A (rehearsal)", country: "MY", lang: "ms", city: "Kuala Lumpur", region: "Wilayah Persekutuan" },
  { key: "MY_B", email: "pilot-my-b@rehearsal.propertiguru.test", name: "Pilot MY B (rehearsal)", country: "MY", lang: "en", city: "Petaling Jaya", region: "Selangor" },
  { key: "ID_A", email: "pilot-id-a@rehearsal.propertiguru.test", name: "Pilot ID A (rehearsal)", country: "ID", lang: "id", city: "Jakarta Selatan", region: "DKI Jakarta" },
  { key: "ID_B", email: "pilot-id-b@rehearsal.propertiguru.test", name: "Pilot ID B (rehearsal)", country: "ID", lang: "id", city: "Bandung", region: "Jawa Barat" },
  { key: "XB", email: "pilot-xb@rehearsal.propertiguru.test", name: "Pilot Cross-border (rehearsal)", country: "MY", lang: "en", city: "Johor Bahru", region: "Johor" },
];

const envPath = join(root, fileName);
let envText = readFileSync(envPath, "utf8");
const envLine = (name) => envText.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() ?? "";
const setEnvLine = (name, value) => {
  if (new RegExp(`^${name}=`, "m").test(envText)) {
    envText = envText.replace(new RegExp(`^${name}=.*$`, "m"), `${name}=${value}`);
  } else {
    if (!envText.endsWith("\n")) envText += "\n";
    envText += `${name}=${value}\n`;
  }
};
if (!/^# Pilot rehearsal accounts/m.test(envText)) {
  if (!envText.endsWith("\n")) envText += "\n";
  envText += "\n# Pilot rehearsal accounts (seed-pilot-rehearsal.mjs) — staging only, never printed\n";
}

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) throw listErr;
const byEmail = new Map(list.users.map((u) => [u.email?.toLowerCase(), u]));

let written = 0;
const summary = [];
for (const s of SLOTS) {
  let email = envLine(`PILOT_${s.key}_EMAIL`);
  if (!email) { email = s.email; setEnvLine(`PILOT_${s.key}_EMAIL`, email); written++; }
  let password = envLine(`PILOT_${s.key}_PASSWORD`);
  if (!password) {
    password = randomBytes(12).toString("base64url") + "!A1";
    setEnvLine(`PILOT_${s.key}_PASSWORD`, password);
    written++;
  }

  let user = byEmail.get(email.toLowerCase());
  let action;
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { display_name: s.name },
    });
    if (error) throw new Error(`create ${email}: ${error.message}`);
    user = data.user;
    action = "created";
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) throw new Error(`update ${email}: ${error.message}`);
    action = "synced ";
  }

  const { error: pErr } = await admin.from("profiles").upsert({
    id: user.id, display_name: s.name, agent_status: "verified",
    country_code: s.country, preferred_language: s.lang,
  });
  if (pErr) throw new Error(`profile ${email}: ${pErr.message}`);

  const { error: uErr } = await admin.from("users_private").upsert({ user_id: user.id, email, full_legal_name: s.name });
  if (uErr) throw new Error(`users_private ${email}: ${uErr.message}`);

  const { error: aErr } = await admin.from("agent_profiles").upsert({
    user_id: user.id, full_legal_name: s.name, country_code: s.country,
    city: s.city, state_region: s.region, submitted_at: new Date().toISOString(),
  });
  if (aErr) throw new Error(`agent_profile ${email}: ${aErr.message}`);

  // Prove the credentials work without the password ever leaving this process.
  const probe = createClient(url, anon, { auth: { persistSession: false } });
  const { data: signIn, error: sErr } = await probe.auth.signInWithPassword({ email, password });
  const ok = !sErr && signIn?.user?.id === user.id;
  if (ok) await probe.auth.signOut();

  console.log(`${action}  ${s.key.padEnd(5)} ${email.padEnd(42)} ${user.id}  sign-in ${ok ? "OK" : "FAILED: " + sErr?.message}`);
  summary.push({ slot: s.key, email, id: user.id, country: s.country, lang: s.lang, signIn: ok });
}

if (written) {
  writeFileSync(envPath, envText);
  console.log(`\n${written} line(s) written into ${fileName} (passwords never printed).`);
}
console.log(`\nPilot rehearsal accounts ready on ${ref}.`);
console.log(JSON.stringify(summary, null, 2));
