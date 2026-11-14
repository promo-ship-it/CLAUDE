#!/usr/bin/env node
// Applies database migrations safely. Runs automatically during `npm run build`.
//
// Why this exists: earlier versions of the app created tables with
// `prisma db push`, which leaves no migration history. `prisma migrate deploy`
// refuses to touch a non-empty database without history (error P3005).
// So, once, for such a database we:
//   1. run the idempotent 0001_init SQL directly (adds only what's missing),
//   2. mark 0001_init as applied,
// and from then on it's plain `prisma migrate deploy` every build.
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  console.error("[migrate] DATABASE_URL is not set — cannot run migrations.");
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const prisma = new PrismaClient();

async function tableExists(name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    name
  );
  return rows.length > 0;
}

try {
  const hasHistory = await tableExists("_prisma_migrations");
  const hasAppTables = await tableExists("Property");
  await prisma.$disconnect();

  if (!hasHistory && hasAppTables) {
    console.log("[migrate] Existing database without migration history — baselining once.");
    run("npx prisma db execute --file prisma/migrations/0001_init/migration.sql --schema prisma/schema.prisma");
    run("npx prisma migrate resolve --applied 0001_init");
  }

  run("npx prisma migrate deploy");
} catch (err) {
  await prisma.$disconnect().catch(() => {});
  console.error("[migrate] Migration failed:", err?.message || err);
  process.exit(1);
}
