CREATE TABLE "conversation_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"pinned_by_id" uuid NOT NULL,
	"team" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "line_users" ADD COLUMN "alias" text;--> statement-breakpoint
ALTER TABLE "line_users" ADD COLUMN "remark" text;--> statement-breakpoint
ALTER TABLE "conversation_pins" ADD CONSTRAINT "conversation_pins_user_id_line_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."line_users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_pins" ADD CONSTRAINT "conversation_pins_pinned_by_id_admins_id_fk" FOREIGN KEY ("pinned_by_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_pins_personal_idx" ON "conversation_pins" USING btree ("user_id","pinned_by_id") WHERE not "conversation_pins"."team";--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_pins_team_idx" ON "conversation_pins" USING btree ("user_id") WHERE "conversation_pins"."team";