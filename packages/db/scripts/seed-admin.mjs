/**
 * One-time Super Admin bootstrap. Creates (or finds) the given user, confirms
 * the email, grants super_admin, sets profile display name + verified status.
 *
 * Usage: node scripts/seed-admin.mjs --env=<target> <email> "<Display Name>"
 * Prints a generated temporary password when creating a new user.
 *
 * Target comes from the shared loader (mandatory --env). This file used to read
 * `.env.legacy` by name — the retired project — so `npm run seed:admin:production`
 * would have bootstrapped an admin on a database nothing deploys against.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, restArgs } from "./load-env.mjs";

loadEnv();

const [email, displayName = "Super Admin"] = restArgs();
if (!email) {
  console.error('Usage: node scripts/seed-admin.mjs --env=<target> <email> "<Display Name>"');
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: list } = await admin.auth.admin.listUsers();
let user = list.users.find((u) => u.email === email);
let tempPassword = null;

if (!user) {
  tempPassword = randomBytes(9).toString("base64url") + "!A1";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw error;
  user = data.user;
  console.log("created user", user.id);
} else if (!user.email_confirmed_at) {
  await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
}

const { data: role } = await admin.from("roles").select("id").eq("key", "super_admin").single();
const { error: roleErr } = await admin
  .from("user_roles")
  .upsert({ user_id: user.id, role_id: role.id }, { onConflict: "user_id,role_id" });
if (roleErr) throw roleErr;

const { error: profErr } = await admin
  .from("profiles")
  .update({ display_name: displayName, agent_status: "verified" })
  .eq("id", user.id);
if (profErr) throw profErr;

console.log(`super_admin granted to ${email}`);
if (tempPassword) console.log(`TEMP PASSWORD (change after first login): ${tempPassword}`);
