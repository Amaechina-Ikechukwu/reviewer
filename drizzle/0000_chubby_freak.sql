CREATE TYPE "public"."review_status" AS ENUM('pending', 'reviewing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."submission_type" AS ENUM('github', 'file_upload');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'teacher');--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text NOT NULL,
	"rubric" text NOT NULL,
	"source_type" varchar(20) DEFAULT 'manual' NOT NULL,
	"source_markdown" text,
	"source_url" text,
	"created_by" uuid NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"max_score" integer DEFAULT 100 NOT NULL,
	"allow_github" boolean DEFAULT true NOT NULL,
	"allow_file_upload" boolean DEFAULT true NOT NULL,
	"default_provider" varchar(20) DEFAULT 'claude' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"ai_score" integer,
	"max_score" integer,
	"teacher_override_score" integer,
	"feedback" jsonb,
	"raw_ai_response" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_submission_id_unique" UNIQUE("submission_id")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"submission_type" "submission_type" NOT NULL,
	"github_url" varchar(1000),
	"file_path" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_late" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assignments_created_by" ON "assignments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_assignments_dates" ON "assignments" USING btree ("opens_at","closes_at");--> statement-breakpoint
CREATE INDEX "idx_reviews_submission" ON "reviews" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_submissions_assignment_student" ON "submissions" USING btree ("assignment_id","student_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_assignment" ON "submissions" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_student" ON "submissions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_date" ON "submissions" USING btree ("submitted_at");