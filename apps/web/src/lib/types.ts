export type MessageDirection = "in" | "out";

export interface LastMessage {
  direction: MessageDirection;
  type: string;
  text: string | null;
  createdAt: string;
}

export interface Conversation {
  userId: string;
  displayName: string | null;
  pictureUrl: string | null;
  isFollowing: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessage: LastMessage | null;
}

export interface ConversationDetail extends Omit<Conversation, "lastMessage"> {
  statusMessage: string | null;
  createdAt: string;
  messageCount: number;
  firstMessageAt: string | null;
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
