import type { DeadlineState, Severity, TicketCategory, TicketStatus } from "./types";

export const SEVERITIES: Severity[] = ["P1", "P2", "P3", "P4", "P5"];

export const SEVERITY_INFO: Record<Severity, { label: string; emoji: string; className: string; dot: string }> = {
  P1: { label: "วิกฤต", emoji: "🔴", className: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
  P2: { label: "สูง", emoji: "🟠", className: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-500" },
  P3: { label: "ปานกลาง", emoji: "🟡", className: "bg-yellow-50 text-yellow-800 ring-yellow-200", dot: "bg-yellow-500" },
  P4: { label: "ต่ำ", emoji: "🟢", className: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  P5: { label: "คำถาม / ขอฟีเจอร์", emoji: "🔵", className: "bg-blue-50 text-blue-700 ring-blue-200", dot: "bg-blue-500" },
};

export const TICKET_STATUSES: TicketStatus[] = ["open", "acknowledged", "in_progress", "waiting_customer", "resolved", "closed"];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "รอรับเรื่อง",
  acknowledged: "รับเรื่องแล้ว",
  in_progress: "กำลังแก้ไข",
  waiting_customer: "รอข้อมูลจากลูกค้า",
  resolved: "แก้แล้ว รอยืนยัน",
  closed: "ปิดแล้ว",
};

export const STATUS_CLASS: Record<TicketStatus, string> = {
  open: "bg-sky-50 text-sky-700",
  acknowledged: "bg-indigo-50 text-indigo-700",
  in_progress: "bg-amber-50 text-amber-700",
  waiting_customer: "bg-violet-50 text-violet-700",
  resolved: "bg-emerald-50 text-emerald-700",
  closed: "bg-zinc-100 text-muted",
};

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  login: "เข้าสู่ระบบ",
  payment: "ชำระเงิน",
  data: "ข้อมูล",
  ui: "หน้าตา / UI",
  other: "อื่นๆ",
};

/** "12 นาที", "3 ชม.", "2 วัน" for a span in milliseconds. */
export function spanText(ms: number): string {
  const minutes = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ชม.`;
  return `${Math.round(hours / 24)} วัน`;
}

/** "เหลือ 12 นาที" or "เกิน 5 นาที" against a deadline. */
export function dueText(dueIso: string | null, now: number): string | null {
  if (!dueIso) return null;
  const diff = new Date(dueIso).getTime() - now;
  return diff >= 0 ? `เหลือ ${spanText(diff)}` : `เกิน ${spanText(diff)}`;
}

export const DEADLINE_LABELS: Record<DeadlineState, string> = {
  ok: "ทันเวลา",
  at_risk: "ใกล้ครบ",
  breached: "เกินกำหนด",
  met: "ทัน",
  none: "ไม่มีกำหนด",
};

export const TICKET_EVENT_TEXT = (e: { type: string; fromValue: string | null; toValue: string | null; actorName: string | null }) => {
  const actor = e.actorName ?? "ลูกค้า";
  switch (e.type) {
    case "created":
      return `ลูกค้าแจ้งเรื่อง (${e.toValue})`;
    case "status":
      return `${e.actorName ?? "ลูกค้า"} เปลี่ยนสถานะเป็น "${STATUS_LABELS[e.toValue as TicketStatus] ?? e.toValue}"`;
    case "severity":
      return `${actor} เปลี่ยนระดับ ${e.fromValue ?? ""} → ${e.toValue}`;
    case "assignee":
      return e.toValue ? `${actor} มอบหมายให้ ${e.toValue}` : `${actor} ยกเลิกผู้รับผิดชอบ`;
    case "category":
      return `${actor} เปลี่ยนหมวดเป็น ${CATEGORY_LABELS[e.toValue as TicketCategory] ?? e.toValue}`;
    case "rated":
      return `ลูกค้าให้คะแนน ${e.toValue}/5`;
    default:
      return e.type;
  }
};
