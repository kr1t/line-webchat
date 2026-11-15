const TIME_ZONE = "Asia/Bangkok";
const LOCALE = "th-TH";

const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: TIME_ZONE });
const fullDateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
export const formatFullDate = (iso: string) => fullDateFormat.format(new Date(iso));
export const dayKey = (iso: string) => dayKeyFormat.format(new Date(iso));

/** Short label for the conversation list: time today, "เมื่อวาน", or a date. */
export function formatListTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const today = dayKey(now.toISOString());
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000).toISOString());
  const key = dayKey(iso);
  if (key === today) return timeFormat.format(date);
  if (key === yesterday) return "เมื่อวาน";
  return dateFormat.format(date);
}

export function formatDayDivider(iso: string, now = new Date()): string {
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return "วันนี้";
  if (key === dayKey(new Date(now.getTime() - 86_400_000).toISOString())) return "เมื่อวาน";
  return fullDateFormat.format(new Date(iso));
}

const TYPE_LABELS: Record<string, string> = {
  sticker: "สติกเกอร์",
  image: "รูปภาพ",
  video: "วิดีโอ",
  audio: "ข้อความเสียง",
  file: "ไฟล์",
  location: "ตำแหน่ง",
  flex: "การ์ด",
  postback: "กดปุ่ม",
};

export function messagePreview(message: { type: string; text: string | null }): string {
  if (message.type === "text") return message.text ?? "";
  // Bot cards and button presses already carry a readable summary
  if ((message.type === "flex" || message.type === "postback") && message.text) return message.text;
  const label = TYPE_LABELS[message.type] ?? "ข้อความ";
  return message.text ? `${label}: ${message.text}` : `[${label}]`;
}

export const displayName = (name: string | null) => name ?? "ผู้ใช้ LINE";

const SEND_ERRORS: Record<string, string> = {
  quota_exceeded: "โควตาข้อความของ OA เดือนนี้หมดแล้ว",
  line_rejected: "LINE ไม่รับข้อความนี้",
  line_unavailable: "เชื่อมต่อ LINE ไม่ได้",
  line_auth: "Channel access token ของ LINE ไม่ถูกต้อง",
  user_blocked: "ผู้ใช้บล็อกบัญชีนี้แล้ว",
};

export const sendErrorText = (code: string | null) => (code && SEND_ERRORS[code]) || "ส่งไม่สำเร็จ";

export const CONVERSATION_STATUS_LABELS: Record<"open" | "handling" | "closed", string> = {
  open: "เปิด",
  handling: "กำลังตอบ",
  closed: "ปิด",
};

/** One line describing a status change, shown in the middle of the chat. */
export function conversationEventText(event: {
  type: string;
  data: Record<string, unknown> | null;
  actorName: string | null;
}): string {
  const actor = event.actorName ?? "ระบบ";
  const data = event.data ?? {};
  switch (event.type) {
    case "claimed":
      if (data.auto) return `${actor} ตอบและรับแชทนี้`;
      return typeof data.fromName === "string" ? `${actor} รับแชทต่อจาก ${data.fromName}` : `${actor} รับแชท`;
    case "transferred":
      return `${actor} โอนแชทให้ ${typeof data.toName === "string" ? data.toName : "คนอื่น"}`;
    case "closed":
      return `${actor} ปิดแชท`;
    case "reopened":
      return "ลูกค้าทักกลับมา แชทเปิดอีกครั้ง";
    case "role_granted":
      return `${actor} ให้สิทธิ์ลูกค้า`;
    case "role_revoked":
      return `${actor} ถอนสิทธิ์ลูกค้า`;
    case "ticket_reopened":
      return `ลูกค้าแจ้งว่า ${typeof data.code === "string" ? data.code : "ticket"} ยังไม่หาย ส่งกลับให้ทีมแก้ใหม่`;
    case "ticket_confirmed":
      return `ลูกค้ายืนยันว่า ${typeof data.code === "string" ? data.code : "ticket"} หายแล้ว`;
    case "ticket_created":
      return `สร้าง ticket ${typeof data.code === "string" ? data.code : ""}${typeof data.severity === "string" ? ` (${data.severity})` : ""}`;
    default:
      return event.type;
  }
}
