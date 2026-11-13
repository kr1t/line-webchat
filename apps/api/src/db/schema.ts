import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const adminRole = pgEnum('admin_role', ['SUPER_ADMIN', 'ADMIN']);

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(), // stored lowercase
  displayName: text('display_name').notNull(),
  role: adminRole('role').notNull().default('ADMIN'),
  isActive: boolean('is_active').notNull().default(true),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  tempPasswordExpiresAt: timestamp('temp_password_expires_at', { withTimezone: true }),
  totpSecretEnc: text('totp_secret_enc'), // AES-256-GCM, see crypto.ts
  totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
  totpLastUsedStep: integer('totp_last_used_step'),
  // Bumped on password/2FA changes and deactivation to revoke existing sessions
  tokenVersion: integer('token_version').notNull().default(0),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdById: uuid('created_by_id'),
  ...timestamps,
});

export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('recovery_codes_admin_id_idx').on(table.adminId)],
);

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(), // e.g. "user:somchai", "ip:1.2.3.4", "2fa:<adminId>"
    success: boolean('success').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('login_attempts_key_created_at_idx').on(table.key, table.createdAt)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => admins.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetId: text('target_id'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('audit_logs_created_at_idx').on(table.createdAt.desc())],
);

export const lineUsers = pgTable('line_users', {
  userId: text('user_id').primaryKey(),
  displayName: text('display_name'),
  pictureUrl: text('picture_url'),
  statusMessage: text('status_message'),
  isFollowing: boolean('is_following').notNull().default(true),
  profileUpdatedAt: timestamp('profile_updated_at', { withTimezone: true }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  unreadCount: integer('unread_count').notNull().default(0),
  ...timestamps,
});

export const messageDirection = pgEnum('message_direction', ['in', 'out']);
export const messageStatus = pgEnum('message_status', ['sending', 'sent', 'failed']);
export const messageDelivery = pgEnum('message_delivery', ['reply', 'push']);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => lineUsers.userId, { onDelete: 'cascade' }),
    direction: messageDirection('direction').notNull(),
    type: text('type').notNull(),
    text: text('text'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    // Unique ids from LINE make webhook redeliveries idempotent
    webhookEventId: text('webhook_event_id').unique(),
    lineMessageId: text('line_message_id').unique(),
    replyToken: text('reply_token'),
    replyTokenExpiresAt: timestamp('reply_token_expires_at', { withTimezone: true }),
    status: messageStatus('status').notNull().default('sent'),
    // Outgoing only: how LINE accepted it, why it failed, and the idempotency key for push retries
    delivery: messageDelivery('delivery'),
    error: text('error'),
    retryKey: uuid('retry_key'),
    sentByAdminId: uuid('sent_by_admin_id').references(() => admins.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('messages_user_id_created_at_idx').on(table.userId, table.createdAt.desc())],
);

export type Admin = typeof admins.$inferSelect;
export type LineUser = typeof lineUsers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export const schema = { admins, recoveryCodes, loginAttempts, auditLogs, lineUsers, messages };
