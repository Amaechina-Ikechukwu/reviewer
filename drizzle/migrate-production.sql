-- Production migration: bring DB up to date with current schema
-- Run this against your production DATABASE_URL

-- 1. Add missing enum type
DO $$ BEGIN
  CREATE TYPE "public"."token_type" AS ENUM('invite', 'reset');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add missing columns to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "join_code" varchar(16) UNIQUE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "teacher_id" uuid;

-- 3. Add missing columns to assignments
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "class_notes" text;

-- 4. Create auth_tokens table
CREATE TABLE IF NOT EXISTS "auth_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "token" text NOT NULL UNIQUE,
  "type" "token_type" NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_auth_tokens_token" ON "auth_tokens" ("token");
CREATE INDEX IF NOT EXISTS "idx_auth_tokens_user_type" ON "auth_tokens" ("user_id", "type");

-- 5. Create submission_overrides table
CREATE TABLE IF NOT EXISTS "submission_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" uuid NOT NULL REFERENCES "users"("id"),
  "assignment_id" uuid NOT NULL REFERENCES "assignments"("id"),
  "granted_by" uuid NOT NULL REFERENCES "users"("id"),
  "closes_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uniq_overrides_student_assignment" UNIQUE ("student_id", "assignment_id")
);

-- 6. Create audit_logs table
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" uuid,
  "actor_email" varchar(255),
  "action" varchar(100) NOT NULL,
  "target_type" varchar(50),
  "target_id" varchar(255),
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_audit_logs_created_at" ON "audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_actor" ON "audit_logs" ("actor_id");

-- 7. Fix default_provider default (was 'claude', now 'gemini')
ALTER TABLE "assignments" ALTER COLUMN "default_provider" SET DEFAULT 'gemini';

-- Done
SELECT 'Migration complete' AS status;
