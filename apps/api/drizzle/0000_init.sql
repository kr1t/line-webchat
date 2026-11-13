CREATE TYPE "public"."message_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TABLE "line_users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"picture_url" text,
	"status_message" text,
	"is_following" boolean DEFAULT true NOT NULL,
	"profile_updated_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"direction" "message_direction" NOT NULL,
	"type" text NOT NULL,
	"text" text,
	"payload" jsonb,
	"webhook_event_id" text,
	"line_message_id" text,
	"reply_token" text,
	"reply_token_expires_at" timestamp with time zone,
	"status" "message_status" DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_webhook_event_id_unique" UNIQUE("webhook_event_id"),
	CONSTRAINT "messages_line_message_id_unique" UNIQUE("line_message_id")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_line_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."line_users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_user_id_created_at_idx" ON "messages" USING btree ("user_id","created_at" DESC NULLS LAST);