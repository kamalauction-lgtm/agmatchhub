/**
 * Ad-hoc read-only query runner for checking production state.
 *
 * Usage: node scripts/q.mjs "select ..."
 *
 * Refuses anything that is not a single SELECT/WITH statement — this exists to
 * answer questions, and a typo here would answer them against live data.
 */
import pg from "pg";
import { loadEnv, restArgs } from "./load-env.mjs";

const { url } = loadEnv();
const sql = restArgs().join(" ").trim();

if (!/^(select|with)\b/i.test(sql) || /;\s*\S/.test(sql)) {
  console.error("Only a single SELECT/WITH statement is allowed.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const res = await client.query(sql);
console.table(res.rows);
await client.end();
