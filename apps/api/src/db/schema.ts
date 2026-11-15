import {
  boolean,
  customType,
  index,
  integer,
  uniqueIndex,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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

export const customerRole = pgEnum('customer_role', ['CUSTOMER']);
export const conversationStatus = pgEnum('conversation_status', ['open', 'handling', 'closed']);

export const lineUsers = pgTable(
  'line_users',
  {
    userId: text('user_id').primaryKey(),
    displayName: text('display_name'),
    pictureUrl: text('picture_url'),
    statusMessage: text('status_message'),
    isFollowing: boolean('is_following').notNull().default(true),
    profileUpdatedAt: timestamp('profile_updated_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    unreadCount: integer('unread_count').notNull().default(0),
    // Customer access (tickets + rich menu); null means a regular chat contact
    role: customerRole('role'),
    roleGrantedById: uuid('role_granted_by_id').references(() => admins.id, { onDelete: 'set null' }),
    roleGrantedAt: timestamp('role_granted_at', { withTimezone: true }),
    // Who is handling the chat right now
    status: conversationStatus('status').notNull().default('open'),
    assignedAdminId: uuid('assigned_admin_id').references(() => admins.id, { onDelete: 'set null' }),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    lastAutoReplyAt: timestamp('last_auto_reply_at', { withTimezone: true }),
    // Name the team uses for this customer, and a note; the LINE name stays in display_name
    alias: text('alias'),
    remark: text('remark'),
    ...timestamps,
  },
  (table) => [index('line_users_status_idx').on(table.status, table.lastMessageAt.desc())],
);

/**
 * Pinned chats. A personal pin (team = false) is only on that admin's list;
 * a team pin is on everyone's list (pinned_by just says who put it there).
 */
export const conversationPins = pgTable(
  'conversation_pins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => lineUsers.userId, { onDelete: 'cascade' }),
    pinnedById: uuid('pinned_by_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    team: boolean('team').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('conversation_pins_personal_idx').on(table.userId, table.pinnedById).where(sql`not ${table.team}`),
    uniqueIndex('conversation_pins_team_idx').on(table.userId).where(sql`${table.team}`),
  ],
);

export const conversationEvents = pgTable(
  'conversation_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => lineUsers.userId, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => admins.id, { onDelete: 'set null' }),
    // claimed | transferred | closed | reopened | role_granted | role_revoked | ticket_created
    type: text('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('conversation_events_user_id_created_at_idx').on(table.userId, table.createdAt)],
);

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

export const ticketSeverity = pgEnum('ticket_severity', ['P1', 'P2', 'P3', 'P4', 'P5']);
export const ticketStatus = pgEnum('ticket_status', [
  'open',
  'acknowledged',
  'in_progress',
  'waiting_customer',
  'resolved',
  'closed',
]);
export const ticketCategory = pgEnum('ticket_category', ['login', 'payment', 'data', 'ui', 'other']);
export const ticketAuthor = pgEnum('ticket_author', ['customer', 'admin', 'system']);

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Shown to customers as TK-000123
    number: integer('number').notNull().unique().generatedAlwaysAsIdentity(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => lineUsers.userId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    category: ticketCategory('category').notNull().default('other'),
    severity: ticketSeverity('severity').notNull(),
    reportedSeverity: ticketSeverity('reported_severity').notNull(),
    status: ticketStatus('status').notNull().default('open'),
    assigneeId: uuid('assignee_id').references(() => admins.id, { onDelete: 'set null' }),
    responseDueAt: timestamp('response_due_at', { withTimezone: true }).notNull(),
    resolveDueAt: timestamp('resolve_due_at', { withTimezone: true }), // null for P5
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    // SLA clock stops while waiting for the customer
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    pausedSeconds: integer('paused_seconds').notNull().default(0),
    responseBreached: boolean('response_breached').notNull().default(false),
    resolveBreached: boolean('resolve_breached').notNull().default(false),
    // Times the customer said "not fixed" after the team marked it resolved
    reopenCount: integer('reopen_count').notNull().default(0),
    reopenedAt: timestamp('reopened_at', { withTimezone: true }),
    rating: smallint('rating'),
    ratingComment: text('rating_comment'),
    ratedAt: timestamp('rated_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('tickets_status_response_due_idx').on(table.status, table.responseDueAt),
    index('tickets_reporter_id_idx').on(table.reporterId, table.createdAt.desc()),
    index('tickets_assignee_id_idx').on(table.assigneeId),
    index('tickets_created_at_idx').on(table.createdAt),
  ],
);

export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    authorType: ticketAuthor('author_type').notNull(),
    authorAdminId: uuid('author_admin_id').references(() => admins.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    // Team-only note, never sent to LINE or returned to the customer
    internal: boolean('internal').notNull().default(false),
    // The chat message this was sent as / came from, so both views stay in sync
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ticket_messages_ticket_id_created_at_idx').on(table.ticketId, table.createdAt)],
);

export const ticketEvents = pgTable(
  'ticket_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => admins.id, { onDelete: 'set null' }),
    // created | status | severity | assignee | rated
    type: text('type').notNull(),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ticket_events_ticket_id_created_at_idx').on(table.ticketId, table.createdAt)],
);

export const roleInvites = pgTable(
  'role_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // sha256 of the token in the link; the token itself is never stored
    tokenHash: text('token_hash').notNull().unique(),
    role: customerRole('role').notNull().default('CUSTOMER'),
    targetUserId: text('target_user_id').references(() => lineUsers.userId, { onDelete: 'cascade' }),
    requireApproval: boolean('require_approval').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdById: uuid('created_by_id').references(() => admins.id, { onDelete: 'set null' }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedByUserId: text('used_by_user_id'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedById: uuid('approved_by_id').references(() => admins.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedById: uuid('revoked_by_id').references(() => admins.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('role_invites_created_at_idx').on(table.createdAt.desc())],
);

export const chatFlowStep = pgEnum('chat_flow_step', [
  'choose_severity',
  'confirm_severity',
  'await_description',
  'await_more_info',
  'await_rating_comment',
]);

// Where a customer is in the ticket flow inside the LINE chat
export const chatStates = pgTable('chat_states', {
  userId: text('user_id')
    .primaryKey()
    .references(() => lineUsers.userId, { onDelete: 'cascade' }),
  step: chatFlowStep('step').notNull(),
  severity: ticketSeverity('severity'),
  ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cannedResponses = pgTable('canned_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  shortcut: text('shortcut').notNull().unique(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  useCount: integer('use_count').notNull().default(0),
  createdById: uuid('created_by_id').references(() => admins.id, { onDelete: 'set null' }),
  ...timestamps,
});

// Small key/value store for settings edited in the CMS (e.g. business hours)
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedById: uuid('updated_by_id').references(() => admins.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const attachmentSource = pgEnum('attachment_source', ['line', 'liff']);

/**
 * Screenshots customers send with a ticket. Kept in Postgres (small prototype, no extra storage service).
 * ticket_id is null while a report in the LINE chat is still being written.
 */
export const ticketAttachments = pgTable(
  'ticket_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => lineUsers.userId, { onDelete: 'cascade' }),
    source: attachmentSource('source').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    data: bytea('data').notNull(),
    // LINE message id, so a redelivered webhook does not store the same picture twice
    lineMessageId: text('line_message_id').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ticket_attachments_ticket_id_idx').on(table.ticketId),
    index('ticket_attachments_owner_draft_idx').on(table.ownerId, table.createdAt),
  ],
);

/** Pictures, video, audio and files customers send in the chat, copied before LINE deletes them. */
export const messageMedia = pgTable('message_media', {
  messageId: uuid('message_id')
    .primaryKey()
    .references(() => messages.id, { onDelete: 'cascade' }),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  data: bytea('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Admin = typeof admins.$inferSelect;
export type LineUser = typeof lineUsers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type RoleInvite = typeof roleInvites.$inferSelect;
export type ChatState = typeof chatStates.$inferSelect;

export const schema = {
  admins,
  recoveryCodes,
  loginAttempts,
  auditLogs,
  lineUsers,
  conversationEvents,
  messages,
  tickets,
  ticketMessages,
  ticketEvents,
  roleInvites,
  chatStates,
  cannedResponses,
  settings,
  ticketAttachments,
  messageMedia,
  conversationPins,
};
