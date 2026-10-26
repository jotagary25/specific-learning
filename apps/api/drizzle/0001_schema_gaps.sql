ALTER TABLE "srs_card" ALTER COLUMN "state" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "study_session" ADD COLUMN "blocks_done" smallint;--> statement-breakpoint
ALTER TABLE "study_session" ADD COLUMN "end_reason" text;--> statement-breakpoint
ALTER TABLE "doubt" ADD COLUMN "explanation" text;--> statement-breakpoint
ALTER TABLE "tutor_message" ADD COLUMN "tool_name" text;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "feedback" jsonb;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "hint_level" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "story_chapter" ADD COLUMN "story_title" text;--> statement-breakpoint
ALTER TABLE "srs_card" ADD COLUMN "suspended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "srs_review" ADD COLUMN "answer" text;--> statement-breakpoint
ALTER TABLE "writing_mission" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Data backfill: move values out of the jsonb workarounds into the new columns.
-- srs_card: the suspended flag lived inside `state`; an empty state ({}) meant "new" and is now NULL.
UPDATE "srs_card" SET "suspended" = true WHERE "state" -> 'suspended' = 'true'::jsonb;--> statement-breakpoint
UPDATE "srs_card" SET "state" = "state" - 'suspended' WHERE "state" ? 'suspended';--> statement-breakpoint
UPDATE "srs_card" SET "state" = NULL WHERE "state" = '{}'::jsonb;--> statement-breakpoint
-- study_session: legacy mode `standard` is the `full` mode; blocks/end reason come from the session_completed event.
UPDATE "study_session" SET "mode" = 'full' WHERE "mode" = 'standard';--> statement-breakpoint
UPDATE "study_session" AS s SET
  "blocks_done" = CASE WHEN jsonb_typeof(e."payload" -> 'blocksDone') = 'number' THEN (e."payload" ->> 'blocksDone')::smallint END,
  "end_reason" = e."payload" ->> 'reason'
FROM "event" AS e
WHERE e."type" = 'session_completed' AND e."payload" ->> 'sessionId' = s."id"::text;--> statement-breakpoint
-- doubt: the units "I don't get it" explanation was stored as context.explanationEs.
UPDATE "doubt" SET "explanation" = "context" ->> 'explanationEs', "context" = "context" - 'explanationEs' WHERE "context" ? 'explanationEs';--> statement-breakpoint
-- tutor_message: tool messages kept their tool in tool_calls[0].name.
UPDATE "tutor_message" SET "tool_name" = "tool_calls" -> 0 ->> 'name' WHERE "role" = 'tool' AND jsonb_typeof("tool_calls") = 'array';--> statement-breakpoint
-- writing_mission: existing rows default to the migration time; their creation time is the best known value.
UPDATE "writing_mission" SET "updated_at" = "created_at";
