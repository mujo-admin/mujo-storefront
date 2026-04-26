// W1 Postgres connectivity smoke test.
// Run: node --env-file=.env.local scripts/db-smoke.mjs
// Expected output: "Postgres OK: <ISO timestamp>" + Postgres version
import postgres from "postgres";

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.error("POSTGRES_URL_NON_POOLING not set — run `vercel env pull` first.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  const [{ now }] = await sql`SELECT NOW() as now`;
  const [{ version }] = await sql`SELECT version()`;
  console.log("Postgres OK:", now.toISOString());
  console.log("Version:", version.split(" ").slice(0, 2).join(" "));
  process.exit(0);
} catch (err) {
  console.error("Postgres ERROR:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
