CREATE TYPE "public"."message_delivery" AS ENUM('reply', 'push');--> statement-breakpoint
ALTER TYPE "public"."message_status" ADD VALUE 'sending' BEFORE 'sent';--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivery" "message_delivery";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "retry_key" uuid;