CREATE TYPE "public"."admin_role" AS ENUM('SUPER_ADMIN', 'ADMIN');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "admin_role" DEFAULT 'ADMIN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"temp_password_expires_at" timestamp with time zone,
	"totp_secret_enc" text,
	"totp_enabled_at" timestamp with time zone,
	"totp_last_used_step" integer,
	"token_version" integer DEFAULT 0 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_id" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sent_by_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_admins_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "login_attempts_key_created_at_idx" ON "login_attempts" USING btree ("key","created_at");--> statement-breakpoint
CREATE INDEX "recovery_codes_admin_id_idx" ON "recovery_codes" USING btree ("admin_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_admin_id_admins_id_fk" FOREIGN KEY ("sent_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;