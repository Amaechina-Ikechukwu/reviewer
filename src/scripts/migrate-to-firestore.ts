/**
 * One-shot migration: Postgres -> Firestore.
 *
 * Usage:
 *   DATABASE_URL=postgres://...                    \
 *   FIREBASE_SERVICE_ACCOUNT=./service-account.json \
 *   bun src/scripts/migrate-to-firestore.ts
 *
 * Or set FIREBASE_SERVICE_ACCOUNT to the raw JSON string.
 *
 * Flags:
 *   --dry-run        Read from Postgres, print counts, write nothing.
 *   --only=users,... Comma-separated collections to migrate (default: all).
 *   --wipe           Delete existing docs in the target collection first.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import admin from "firebase-admin";

type TableSpec = {
  collection: string;
  table: string;
  // Optional row transformer (defaults to identity-with-camelCase-keys).
  transform?: (row: Record<string, unknown>) => Record<string, unknown>;
  // Column holding the document id (defaults to "id").
  idColumn?: string;
};

const TABLES: TableSpec[] = [
  { collection: "users", table: "users" },
  { collection: "assignments", table: "assignments" },
  { collection: "submissions", table: "submissions" },
  { collection: "reviews", table: "reviews" },
  { collection: "authTokens", table: "auth_tokens" },
  { collection: "submissionOverrides", table: "submission_overrides" },
  { collection: "auditLogs", table: "audit_logs" },
];

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  const [k, v = "true"] = arg.replace(/^--/, "").split("=");
  args.set(k, v);
}

const DRY_RUN = args.get("dry-run") === "true";
const WIPE = args.get("wipe") === "true";
const ONLY = args.get("only")?.split(",").map((s) => s.trim()).filter(Boolean);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function loadServiceAccount(): admin.ServiceAccount {
  const raw = requireEnv("FIREBASE_SERVICE_ACCOUNT");
  const text = raw.trim().startsWith("{") ? raw : readFileSync(raw, "utf8");
  return JSON.parse(text) as admin.ServiceAccount;
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function toFirestore(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return admin.firestore.Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(toFirestore);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[snakeToCamel(k)] = toFirestore(v);
    }
    return out;
  }
  return value;
}

function transformRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = toFirestore(v);
  }
  return out;
}

async function wipeCollection(
  fs: FirebaseFirestore.Firestore,
  collection: string,
): Promise<number> {
  const ref = fs.collection(collection);
  let deleted = 0;
  while (true) {
    const snap = await ref.limit(500).get();
    if (snap.empty) break;
    const batch = fs.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    process.stdout.write(`  wiped ${deleted}\r`);
  }
  if (deleted > 0) process.stdout.write(`\n`);
  return deleted;
}

async function migrateTable(
  sql: postgres.Sql,
  fs: FirebaseFirestore.Firestore,
  spec: TableSpec,
): Promise<{ read: number; written: number }> {
  const idCol = spec.idColumn ?? "id";
  const rows = (await sql.unsafe(`SELECT * FROM "${spec.table}"`)) as Array<Record<string, unknown>>;
  const total = rows.length;

  if (DRY_RUN) return { read: total, written: 0 };

  if (WIPE) {
    const wiped = await wipeCollection(fs, spec.collection);
    if (wiped) console.log(`  wiped ${wiped} existing docs`);
  }

  const ref = fs.collection(spec.collection);
  const BATCH = 450;
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const batch = fs.batch();
    for (const row of chunk) {
      const id = String(row[idCol] ?? "");
      if (!id) {
        console.warn(`  skipped row in ${spec.table} without id`);
        continue;
      }
      const data = (spec.transform ?? transformRow)(row);
      batch.set(ref.doc(id), data);
    }
    await batch.commit();
    written += chunk.length;
    process.stdout.write(`  ${written}/${total}\r`);
  }
  if (total > 0) process.stdout.write(`\n`);
  return { read: total, written };
}

async function main() {
  const connectionString = requireEnv("DATABASE_URL");
  const serviceAccount = loadServiceAccount();

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  const fs = admin.firestore();
  const sql = postgres(connectionString, { max: 4, idle_timeout: 10 });

  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}${WIPE ? " (wipe)" : ""}`);

  const targets = ONLY
    ? TABLES.filter((t) => ONLY.includes(t.collection) || ONLY.includes(t.table))
    : TABLES;

  const summary: Array<{ collection: string; read: number; written: number }> = [];

  try {
    for (const spec of targets) {
      console.log(`\n-> ${spec.table} -> ${spec.collection}`);
      const result = await migrateTable(sql, fs, spec);
      summary.push({ collection: spec.collection, ...result });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log("\nDone:");
  for (const row of summary) {
    console.log(`  ${row.collection.padEnd(22)} read=${row.read} written=${row.written}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
