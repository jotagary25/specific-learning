ALTER TABLE "daily_article" ADD COLUMN "annotations" jsonb;--> statement-breakpoint
-- Annotations are personalised per learner: each existing daily pick keeps the copy it read.
UPDATE "daily_article" SET "annotations" = "article"."annotations" FROM "article" WHERE "article"."id" = "daily_article"."article_id";--> statement-breakpoint
ALTER TABLE "article" DROP COLUMN "annotations";
