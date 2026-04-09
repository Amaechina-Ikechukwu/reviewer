import { sql as sqlTag } from "drizzle-orm";
import { db } from "./connection";

/** Run on app startup to ensure production DB has all required tables/columns. Idempotent. */
export async function ensureSchema() {
  try {
    // Enum types
    await db.execute(sqlTag`
      DO $$ BEGIN
        CREATE TYPE "public"."token_type" AS ENUM('invite', 'reset');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Users columns
    await db.execute(sqlTag`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "join_code" varchar(16)`);
    await db.execute(sqlTag`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "teacher_id" uuid`);

    // Assignments columns
    await db.execute(sqlTag`ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "class_notes" text`);

    // Auth tokens
    await db.execute(sqlTag`
      CREATE TABLE IF NOT EXISTS "auth_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "token" text NOT NULL,
        "type" "token_type" NOT NULL,
        "expires_at" timestamp with time zone NOT NULL,
        "used_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);

    // Submission overrides
    await db.execute(sqlTag`
      CREATE TABLE IF NOT EXISTS "submission_overrides" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL REFERENCES "users"("id"),
        "assignment_id" uuid NOT NULL REFERENCES "assignments"("id"),
        "granted_by" uuid NOT NULL REFERENCES "users"("id"),
        "closes_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);

    // Audit logs
    await db.execute(sqlTag`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actor_id" uuid,
        "actor_email" varchar(255),
        "action" varchar(100) NOT NULL,
        "target_type" varchar(50),
        "target_id" varchar(255),
        "details" jsonb,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);

    // Indexes (idempotent)
    await db.execute(sqlTag`CREATE UNIQUE INDEX IF NOT EXISTS "idx_auth_tokens_token" ON "auth_tokens" ("token")`);
    await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS "idx_auth_tokens_user_type" ON "auth_tokens" ("user_id", "type")`);
    await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS "idx_audit_logs_created_at" ON "audit_logs" ("created_at")`);
    await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS "idx_audit_logs_actor" ON "audit_logs" ("actor_id")`);

    // Unique constraints (idempotent via DO block)
    await db.execute(sqlTag`
      DO $$ BEGIN
        ALTER TABLE "submission_overrides" ADD CONSTRAINT "uniq_overrides_student_assignment" UNIQUE ("student_id", "assignment_id");
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await db.execute(sqlTag`
      DO $$ BEGIN
        ALTER TABLE "users" ADD CONSTRAINT "users_join_code_unique" UNIQUE ("join_code");
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log("[schema] Production schema sync complete");
  } catch (err) {
    console.error("[schema] Schema sync failed:", err);
  }
}
