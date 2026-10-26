-- Multi-user: learner data gets an owner (user_id). Stored learner data is not kept (agreed
-- for this release): learner tables, settings and secrets are emptied before the NOT NULL
-- owner columns are added. Shared content (blocks, units, exercises, story, timeline,
-- article pool) is kept; unit progress moves to unit_progress and the daily article pick to
-- daily_article. The `.env` admin user is created by the api on startup, after migrations.
TRUNCATE TABLE "attempt", "reading_session", "srs_card", "srs_review", "writing_mission", "writing_submission", "writing_error", "study_session", "parking_item", "can_do", "event", "doubt", "tutor_conversation", "tutor_message", "eval_run", "setting", "secret";--> statement-breakpoint
CREATE TABLE "daily_article" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_article_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "unit_progress" (
	"user_id" uuid NOT NULL,
	"unit_id" integer NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_progress_user_id_unit_id_pk" PRIMARY KEY("user_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'learner' NOT NULL,
	"session_epoch" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email"),
	CONSTRAINT "app_user_email_lowercase" CHECK ("app_user"."email" = lower("app_user"."email")),
	CONSTRAINT "app_user_role_valid" CHECK ("app_user"."role" in ('admin', 'learner'))
);
--> statement-breakpoint
DROP INDEX "eval_run_created_at_idx";--> statement-breakpoint
DROP INDEX "event_created_at_idx";--> statement-breakpoint
DROP INDEX "event_type_created_at_idx";--> statement-breakpoint
DROP INDEX "article_selected_for_uidx";--> statement-breakpoint
DROP INDEX "study_session_started_at_idx";--> statement-breakpoint
DROP INDEX "attempt_item_id_created_at_idx";--> statement-breakpoint
DROP INDEX "srs_card_due_idx";--> statement-breakpoint
ALTER TABLE "secret" DROP CONSTRAINT "secret_pkey";--> statement-breakpoint
ALTER TABLE "setting" DROP CONSTRAINT "setting_pkey";--> statement-breakpoint
ALTER TABLE "eval_run" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "can_do" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_session" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "secret" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL;--> statement-breakpoint
ALTER TABLE "secret" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "setting" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL;--> statement-breakpoint
ALTER TABLE "setting" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "parking_item" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "study_session" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "doubt" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_conversation" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_message" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "srs_card" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "srs_review" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "writing_error" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "writing_mission" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "writing_submission" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_article" ADD CONSTRAINT "daily_article_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_article" ADD CONSTRAINT "daily_article_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_progress" ADD CONSTRAINT "unit_progress_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_progress" ADD CONSTRAINT "unit_progress_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_article_article_id_idx" ON "daily_article" USING btree ("article_id");--> statement-breakpoint
ALTER TABLE "eval_run" ADD CONSTRAINT "eval_run_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "can_do" ADD CONSTRAINT "can_do_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_session" ADD CONSTRAINT "reading_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret" ADD CONSTRAINT "secret_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setting" ADD CONSTRAINT "setting_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_item" ADD CONSTRAINT "parking_item_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_session" ADD CONSTRAINT "study_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doubt" ADD CONSTRAINT "doubt_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_conversation" ADD CONSTRAINT "tutor_conversation_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_message" ADD CONSTRAINT "tutor_message_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_card" ADD CONSTRAINT "srs_card_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_review" ADD CONSTRAINT "srs_review_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_error" ADD CONSTRAINT "writing_error_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_mission" ADD CONSTRAINT "writing_mission_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_submission" ADD CONSTRAINT "writing_submission_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_run_user_id_created_at_idx" ON "eval_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "can_do_user_id_created_at_idx" ON "can_do" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "event_user_id_created_at_idx" ON "event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "event_user_id_type_created_at_idx" ON "event" USING btree ("user_id","type","created_at");--> statement-breakpoint
CREATE INDEX "reading_session_user_id_article_id_idx" ON "reading_session" USING btree ("user_id","article_id");--> statement-breakpoint
CREATE INDEX "parking_item_user_id_created_at_idx" ON "parking_item" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "study_session_user_id_started_at_idx" ON "study_session" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "doubt_user_id_created_at_idx" ON "doubt" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tutor_conversation_user_id_created_at_idx" ON "tutor_conversation" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tutor_message_user_id_idx" ON "tutor_message" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attempt_user_id_item_id_created_at_idx" ON "attempt" USING btree ("user_id","item_id","created_at");--> statement-breakpoint
CREATE INDEX "attempt_item_id_idx" ON "attempt" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "srs_card_user_id_due_idx" ON "srs_card" USING btree ("user_id","due");--> statement-breakpoint
CREATE INDEX "srs_review_user_id_reviewed_at_idx" ON "srs_review" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "writing_error_user_id_created_at_idx" ON "writing_error" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "writing_mission_user_id_created_at_idx" ON "writing_mission" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "writing_submission_user_id_created_at_idx" ON "writing_submission" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "article" DROP COLUMN "selected_for";--> statement-breakpoint
ALTER TABLE "unit" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "unit" DROP COLUMN "priority";--> statement-breakpoint
ALTER TABLE "unit" DROP COLUMN "completed_at";--> statement-breakpoint
ALTER TABLE "secret" ADD CONSTRAINT "secret_user_id_key_unique" UNIQUE NULLS NOT DISTINCT("user_id","key");--> statement-breakpoint
ALTER TABLE "setting" ADD CONSTRAINT "setting_user_id_key_unique" UNIQUE NULLS NOT DISTINCT("user_id","key");