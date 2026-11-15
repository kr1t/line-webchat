CREATE TYPE "public"."chat_flow_step" AS ENUM('choose_severity', 'confirm_severity', 'await_description', 'await_more_info', 'await_rating_comment');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('open', 'handling', 'closed');--> statement-breakpoint
CREATE TYPE "public"."customer_role" AS ENUM('CUSTOMER');--> statement-breakpoint
CREATE TYPE "public"."ticket_author" AS ENUM('customer', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."ticket_category" AS ENUM('login', 'payment', 'data', 'ui', 'other');--> statement-breakpoint
CREATE TYPE "public"."ticket_severity" AS ENUM('P1', 'P2', 'P3', 'P4', 'P5');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'acknowledged', 'in_progress', 'waiting_customer', 'resolved', 'closed');--> statement-breakpoint
CREATE TABLE "canned_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shortcut" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canned_responses_shortcut_unique" UNIQUE("shortcut")
);
--> statement-breakpoint
CREATE TABLE "chat_states" (
	"user_id" text PRIMARY KEY NOT NULL,
	"step" "chat_flow_step" NOT NULL,
	"severity" "ticket_severity",
	"ticket_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"role" "customer_role" DEFAULT 'CUSTOMER' NOT NULL,
	"target_user_id" text,
	"require_approval" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_id" uuid,
	"used_at" timestamp with time zone,
	"used_by_user_id" text,
	"approved_at" timestamp with time zone,
	"approved_by_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_type" "ticket_author" NOT NULL,
	"author_admin_id" uuid,
	"body" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "tickets_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reporter_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" "ticket_category" DEFAULT 'other' NOT NULL,
	"severity" "ticket_severity" NOT NULL,
	"reported_severity" "ticket_severity" NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"assignee_id" uuid,
	"response_due_at" timestamp with time zone NOT NULL,
	"resolve_due_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"paused_seconds" integer DEFAULT 0 NOT NULL,
	"response_breached" boolean DEFAULT false NOT NULL,
	"resolve_breached" boolean DEFAULT false NOT NULL,
	"rating" smallint,
	"rating_comment" text,
	"rated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "line_users" ADD COLUMN "role" "customer_role";--> statement-breakpoint
ALTER TABLE "line_users" ADD COLUMN "role_granted_by_id" uuid;--> statement-breakpoint
ALTER TABLE "line_users" ADD COLUMN "role_granted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "line_users" ADD COLUMN "status" "conversation_status" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "line_users" ADD COLUMN "assigned_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "line_users" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "line_users" ADD COLUMN "last_auto_reply_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_created_by_id_admins_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_states" ADD CONSTRAINT "chat_states_user_id_line_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."line_users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_states" ADD CONSTRAINT "chat_states_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_user_id_line_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."line_users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_actor_id_admins_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_invites" ADD CONSTRAINT "role_invites_target_user_id_line_users_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."line_users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_invites" ADD CONSTRAINT "role_invites_created_by_id_admins_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_invites" ADD CONSTRAINT "role_invites_approved_by_id_admins_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_invites" ADD CONSTRAINT "role_invites_revoked_by_id_admins_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_admins_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_id_admins_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_admin_id_admins_id_fk" FOREIGN KEY ("author_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reporter_id_line_users_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."line_users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_admins_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_events_user_id_created_at_idx" ON "conversation_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "role_invites_created_at_idx" ON "role_invites" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_id_created_at_idx" ON "ticket_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_id_created_at_idx" ON "ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_status_response_due_idx" ON "tickets" USING btree ("status","response_due_at");--> statement-breakpoint
CREATE INDEX "tickets_reporter_id_idx" ON "tickets" USING btree ("reporter_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tickets_assignee_id_idx" ON "tickets" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "tickets_created_at_idx" ON "tickets" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "line_users" ADD CONSTRAINT "line_users_role_granted_by_id_admins_id_fk" FOREIGN KEY ("role_granted_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_users" ADD CONSTRAINT "line_users_assigned_admin_id_admins_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "line_users_status_idx" ON "line_users" USING btree ("status","last_message_at" DESC NULLS LAST);