CREATE TABLE "eval_run" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"model" text NOT NULL,
	"effort" text,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "can_do" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outlet" text,
	"license" text,
	"published_at" timestamp with time zone,
	"text" text NOT NULL,
	"topic" text,
	"est_level" text,
	"selected_for" date,
	"annotations" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "reading_session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"article_id" uuid NOT NULL,
	"prediction" text,
	"answers" jsonb,
	"spots" jsonb,
	"retell_submission_id" uuid,
	"opinion" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "secret" (
	"key" text PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"last4" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parking_item" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"mode" text NOT NULL,
	"budget_min" integer NOT NULL,
	"plan" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"bonus_min" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doubt" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"text" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_conversation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_message" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"item_id" text NOT NULL,
	"answer" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"correct" boolean NOT NULL,
	"score" real NOT NULL,
	"method" text NOT NULL,
	"attempt_no" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block" (
	"id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"unit_from" integer NOT NULL,
	"unit_to" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"position" integer NOT NULL,
	"instruction" text NOT NULL,
	"evaluation" text NOT NULL,
	"word_bank" jsonb,
	"passage" text,
	"answer_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_item" (
	"id" text PRIMARY KEY NOT NULL,
	"exercise_id" text NOT NULL,
	"num" text NOT NULL,
	"position" integer NOT NULL,
	"is_example" boolean NOT NULL,
	"is_open" boolean NOT NULL,
	"lines" jsonb NOT NULL,
	"answer" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_chapter" (
	"id" text PRIMARY KEY NOT NULL,
	"block_id" integer NOT NULL,
	"unit_id" integer,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"grammar_spans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"teaser" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_item" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"position" integer NOT NULL,
	"sentence" text NOT NULL,
	"expected_shape" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" integer PRIMARY KEY NOT NULL,
	"block_id" integer NOT NULL,
	"title" text NOT NULL,
	"subtitle" text NOT NULL,
	"theory" jsonb NOT NULL,
	"extras" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_card" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source" text NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" jsonb NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_review" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"card_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_error" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"submission_id" uuid NOT NULL,
	"span" jsonb NOT NULL,
	"type" text NOT NULL,
	"unit_id" integer,
	"hint" text NOT NULL,
	"fixed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_mission" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"level" smallint NOT NULL,
	"format" text NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"target_unit_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_submission" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"mission_id" uuid,
	"text_original" text NOT NULL,
	"text_fixed" text,
	"scores" jsonb,
	"rewrites" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_session" ADD CONSTRAINT "reading_session_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_session" ADD CONSTRAINT "reading_session_retell_submission_id_writing_submission_id_fk" FOREIGN KEY ("retell_submission_id") REFERENCES "public"."writing_submission"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_message" ADD CONSTRAINT "tutor_message_conversation_id_tutor_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."tutor_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_item_id_exercise_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."exercise_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_item" ADD CONSTRAINT "exercise_item_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_chapter" ADD CONSTRAINT "story_chapter_block_id_block_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."block"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_chapter" ADD CONSTRAINT "story_chapter_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_item" ADD CONSTRAINT "timeline_item_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_block_id_block_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."block"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_review" ADD CONSTRAINT "srs_review_card_id_srs_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."srs_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_error" ADD CONSTRAINT "writing_error_submission_id_writing_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."writing_submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_error" ADD CONSTRAINT "writing_error_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_mission" ADD CONSTRAINT "writing_mission_target_unit_id_unit_id_fk" FOREIGN KEY ("target_unit_id") REFERENCES "public"."unit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_submission" ADD CONSTRAINT "writing_submission_mission_id_writing_mission_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."writing_mission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_run_created_at_idx" ON "eval_run" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "event_created_at_idx" ON "event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "event_type_created_at_idx" ON "event" USING btree ("type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "article_selected_for_uidx" ON "article" USING btree ("selected_for");--> statement-breakpoint
CREATE INDEX "reading_session_article_id_idx" ON "reading_session" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "study_session_started_at_idx" ON "study_session" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "tutor_message_conversation_id_created_at_idx" ON "tutor_message" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "attempt_item_id_created_at_idx" ON "attempt" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "exercise_unit_id_position_idx" ON "exercise" USING btree ("unit_id","position");--> statement-breakpoint
CREATE INDEX "exercise_item_exercise_id_position_idx" ON "exercise_item" USING btree ("exercise_id","position");--> statement-breakpoint
CREATE INDEX "story_chapter_block_id_position_idx" ON "story_chapter" USING btree ("block_id","position");--> statement-breakpoint
CREATE INDEX "timeline_item_unit_id_idx" ON "timeline_item" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "unit_block_id_idx" ON "unit" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "srs_card_due_idx" ON "srs_card" USING btree ("due");--> statement-breakpoint
CREATE INDEX "srs_review_card_id_reviewed_at_idx" ON "srs_review" USING btree ("card_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "writing_error_submission_id_idx" ON "writing_error" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "writing_error_unit_id_idx" ON "writing_error" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "writing_submission_mission_id_idx" ON "writing_submission" USING btree ("mission_id");