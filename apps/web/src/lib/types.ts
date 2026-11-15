export type MessageDirection = "in" | "out";

export interface LastMessage {
  direction: MessageDirection;
  type: string;
  text: string | null;
  createdAt: string;
}

export type ConversationStatus = "open" | "handling" | "closed";
export type CustomerRole = "CUSTOMER";

export interface Conversation {
  userId: string;
  displayName: string | null;
  pictureUrl: string | null;
  isFollowing: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  role: CustomerRole | null;
  status: ConversationStatus;
  assignedAdminId: string | null;
  assignedName: string | null;
  lastMessage: LastMessage | null;
}

export interface ConversationDetail extends Omit<Conversation, "lastMessage"> {
  statusMessage: string | null;
  roleGrantedAt: string | null;
  createdAt: string;
  messageCount: number;
  firstMessageAt: string | null;
}

export interface ConversationCounts {
  open: number;
  mine: number;
  handling: number;
  unread: number;
}

export interface ConversationEvent {
  id: string;
  type: "claimed" | "transferred" | "closed" | "reopened" | "role_granted" | "role_revoked" | "ticket_created";
  data: Record<string, unknown> | null;
  actorName: string | null;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  displayName: string;
}

export interface ChatMessage {
  id: string;
  direction: MessageDirection;
  type: string;
  text: string | null;
  payload: Record<string, unknown> | null;
  status: "sending" | "sent" | "failed";
  error: string | null;
  sentByName?: string | null;
  createdAt: string;
}

export interface MessagePage {
  messages: ChatMessage[];
  hasMore: boolean;
}

export type LoginStage = "change_password" | "setup_2fa" | "verify_2fa";

export interface AdminProfile {
  id: string;
  username: string;
  displayName: string;
  role: "SUPER_ADMIN" | "ADMIN";
}

export interface AdminRow {
  id: string;
  username: string;
  displayName: string;
  role: "SUPER_ADMIN" | "ADMIN";
  isActive: boolean;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: string | null;
  target: string | null;
  ip: string | null;
  createdAt: string;
}

export type Severity = "P1" | "P2" | "P3" | "P4" | "P5";
export type TicketStatus = "open" | "acknowledged" | "in_progress" | "waiting_customer" | "resolved" | "closed";
export type TicketCategory = "login" | "payment" | "data" | "ui" | "other";
export type DeadlineState = "ok" | "at_risk" | "breached" | "met" | "none";

export interface TicketListItem {
  id: string;
  code: string;
  number: number;
  title: string;
  category: TicketCategory;
  severity: Severity;
  reportedSeverity: Severity;
  status: TicketStatus;
  reporter: { userId: string; displayName: string | null; pictureUrl: string | null };
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  rating: number | null;
  sla: {
    response: DeadlineState;
    resolve: DeadlineState;
    current: "ok" | "at_risk" | "breached" | null;
    responseDueAt: string | null;
    resolveDueAt: string | null;
    paused: boolean;
  };
}

export interface TicketMessage {
  id: string;
  authorType: "customer" | "admin" | "system";
  authorName: string | null;
  body: string;
  internal: boolean;
  status: "sending" | "sent" | "failed" | null;
  error: string | null;
  createdAt: string;
}

export interface TicketEvent {
  id: string;
  type: string;
  fromValue: string | null;
  toValue: string | null;
  reason: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface TicketDetail extends TicketListItem {
  description: string;
  reporterFollowing: boolean;
  ratingComment: string | null;
  messages: TicketMessage[];
  events: TicketEvent[];
}

export interface TicketCounts {
  active: number;
  unassigned: number;
  mine: number;
  breached: number;
  urgent: number;
}

export interface CannedResponse {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  useCount: number;
}

export interface BusinessHours {
  enabled: boolean;
  days: ({ open: string; close: string } | null)[];
  message: string;
}
