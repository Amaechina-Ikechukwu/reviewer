/**
 * Migrate every row from Postgres into Firestore.
 *
 * Usage:
 *   bun src/scripts/migrate-pg-to-firestore.ts          # do it
 *   bun src/scripts/migrate-pg-to-firestore.ts --dry    # count only, no writes
 *   bun src/scripts/migrate-pg-to-firestore.ts --wipe   # clear destination collections first
 *
 * Reads DATABASE_URL and FIREBASE_* from .env.
 * Document IDs in Firestore are kept identical to the Postgres UUIDs so all
 * cross-references survive intact.
 */

import { db, sql } from "../db/connection";
import {
  assignments,
  auditLogs,
  authTokens,
  classNoteFiles,
  reviews,
  submissionOverrides,
  submissions,
  users,
} from "../db/schema";
import { COLLECTIONS, getFirestore } from "../v2/firebase";

const DRY = process.argv.includes("--dry");
const WIPE = process.argv.includes("--wipe");
const BATCH_SIZE = 400;

type AnyRow = Record<string, unknown> & { id: string };

function clean(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

async function wipeCollection(name: string) {
  const fs = getFirestore();
  const col = fs.collection(name);
  let removed = 0;
  while (true) {
    const snap = await col.limit(500).get();
    if (snap.empty) break;
    const batch = fs.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
  }
  return removed;
}

async function copy(name: string, rows: AnyRow[]) {
  console.log(`  ${name}: ${rows.length} row(s)`);
  if (DRY) return;

  const fs = getFirestore();
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const batch = fs.batch();
    for (const row of slice) {
      const { id, ...rest } = row;
      const ref = fs.collection(name).doc(id);
      batch.set(ref, clean(rest));
    }
    await batch.commit();
    process.stdout.write(`    wrote ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}\r`);
  }
  process.stdout.write("\n");
}

async function main() {
  console.log(`migrate-pg-to-firestore ${DRY ? "(DRY RUN)" : ""}${WIPE ? " (WIPE)" : ""}`);

  if (WIPE && !DRY) {
    console.log("wiping destination collections...");
    for (const name of Object.values(COLLECTIONS)) {
      const removed = await wipeCollection(name);
      console.log(`  ${name}: removed ${removed}`);
    }
  }

  const [
    userRows,
    assignmentRows,
    submissionRows,
    reviewRows,
    tokenRows,
    overrideRows,
    auditRows,
    noteRows,
  ] = await Promise.all([
    db.select().from(users),
    db.select().from(assignments),
    db.select().from(submissions),
    db.select().from(reviews),
    db.select().from(authTokens),
    db.select().from(submissionOverrides),
    db.select().from(auditLogs),
    db.select().from(classNoteFiles),
  ]);

  console.log("copying...");
  await copy(COLLECTIONS.users, userRows as unknown as AnyRow[]);
  await copy(COLLECTIONS.assignments, assignmentRows as unknown as AnyRow[]);
  await copy(COLLECTIONS.submissions, submissionRows as unknown as AnyRow[]);
  await copy(COLLECTIONS.reviews, reviewRows as unknown as AnyRow[]);
  await copy(COLLECTIONS.authTokens, tokenRows as unknown as AnyRow[]);
  await copy(COLLECTIONS.submissionOverrides, overrideRows as unknown as AnyRow[]);
  await copy(COLLECTIONS.auditLogs, auditRows as unknown as AnyRow[]);
  await copy(COLLECTIONS.classNoteFiles, noteRows as unknown as AnyRow[]);

  console.log("done.");
  await sql.end({ timeout: 5 });
  process.exit(0);
}

main().catch((err) => {
  console.error("MIGRATION FAILED:", err);
  process.exit(1);
});
