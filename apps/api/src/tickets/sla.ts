export const SEVERITIES = ['P1', 'P2', 'P3', 'P4', 'P5'] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface SeverityInfo {
  label: string;
  emoji: string;
  color: string;
  /** Question that helps the customer pick the right level */
  hint: string;
  examples: string;
  responseMinutes: number;
  /** null: no resolve target (questions and feature requests are planned instead) */
  resolveMinutes: number | null;
}

const HOUR = 60;
const DAY = 24 * HOUR;

export const SLA: Record<Severity, SeverityInfo> = {
  P1: {
    label: 'วิกฤต',
    emoji: '🔴',
    color: '#E5352B',
    hint: 'ใช้งานไม่ได้เลย และกระทบเงินหรือข้อมูล',
    examples: 'เว็บล่ม · จ่ายเงินไม่ได้ · ข้อมูลหายหรือรั่ว',
    responseMinutes: 15,
    resolveMinutes: 4 * HOUR,
  },
  P2: {
    label: 'สูง',
    emoji: '🟠',
    color: '#EA7A1A',
    hint: 'ฟีเจอร์หลักใช้ไม่ได้ และไม่มีวิธีอื่น',
    examples: 'login ไม่ได้ · สั่งซื้อไม่ได้ · ช้ามากจนใช้ไม่ได้',
    responseMinutes: 1 * HOUR,
    resolveMinutes: 8 * HOUR,
  },
  P3: {
    label: 'ปานกลาง',
    emoji: '🟡',
    color: '#C99A00',
    hint: 'ผิดปกติ แต่ยังใช้วิธีอื่นแทนได้',
    examples: 'ค้นหาไม่เจอบางคำ · ตัวเลขรายงานผิด · อีเมลมาช้า',
    responseMinutes: 4 * HOUR,
    resolveMinutes: 3 * DAY,
  },
  P4: {
    label: 'ต่ำ',
    emoji: '🟢',
    color: '#2E9E4F',
    hint: 'ไม่กระทบการใช้งาน แค่ดูไม่ถูก',
    examples: 'สะกดผิด · UI เพี้ยน · รูปไม่ขึ้นบางหน้า',
    responseMinutes: 1 * DAY,
    resolveMinutes: 7 * DAY,
  },
  P5: {
    label: 'คำถาม / ขอฟีเจอร์',
    emoji: '🔵',
    color: '#3B7BE0',
    hint: 'อยากถาม หรืออยากได้อะไรเพิ่ม',
    examples: 'ถามวิธีใช้ · ขอเพิ่มฟีเจอร์ · ขอปรับหน้าตา',
    responseMinutes: 2 * DAY,
    resolveMinutes: null,
  },
};

export const isSeverity = (value: unknown): value is Severity =>
  typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);

export const severityName = (severity: Severity) => `${severity} ${SLA[severity].label}`;

/** "15 นาที", "4 ชม.", "2 วัน" */
export function durationText(minutes: number): string {
  if (minutes < HOUR) return `${minutes} นาที`;
  if (minutes < DAY) return `${Math.round(minutes / HOUR)} ชม.`;
  return `${Math.round(minutes / DAY)} วัน`;
}

export function dueDates(createdAt: Date, severity: Severity) {
  const { responseMinutes, resolveMinutes } = SLA[severity];
  return {
    responseDueAt: new Date(createdAt.getTime() + responseMinutes * 60_000),
    resolveDueAt: resolveMinutes === null ? null : new Date(createdAt.getTime() + resolveMinutes * 60_000),
  };
}

export const ticketCode = (num: number) => `TK-${String(num).padStart(6, '0')}`;

/** Accepts "TK-000123", "tk123" or "TK 123". */
export function parseTicketCode(text: string): number | null {
  const match = /^\s*tk[\s-]?0*(\d{1,9})\s*$/i.exec(text);
  return match ? Number(match[1]) : null;
}

export type SlaState = 'ok' | 'at_risk' | 'breached' | 'met' | 'none';

interface SlaClock {
  createdAt: Date;
  pausedAt: Date | null;
  pausedSeconds: number;
}

/** Time spent waiting for the customer does not count against the team. */
export function pausedMs(t: SlaClock, now: Date) {
  return t.pausedSeconds * 1000 + (t.pausedAt ? now.getTime() - t.pausedAt.getTime() : 0);
}

/** Where a deadline stands: on track, last 25% of the time, or late. */
export function deadlineState(t: SlaClock, due: Date | null, doneAt: Date | null, now: Date): SlaState {
  if (!due) return 'none';
  const shift = pausedMs(t, doneAt ?? now);
  const effectiveDue = due.getTime() + shift;
  if (doneAt) return doneAt.getTime() <= effectiveDue ? 'met' : 'breached';
  const total = due.getTime() - t.createdAt.getTime();
  const left = effectiveDue - now.getTime();
  if (left < 0) return 'breached';
  return left <= total * 0.25 ? 'at_risk' : 'ok';
}

export function effectiveDue(t: SlaClock, due: Date | null, now: Date): Date | null {
  return due ? new Date(due.getTime() + pausedMs(t, now)) : null;
}

export const STATUS_LABELS = {
  open: 'รอทีมรับเรื่อง',
  acknowledged: 'ทีมรับเรื่องแล้ว',
  in_progress: 'กำลังแก้ไข',
  waiting_customer: 'รอข้อมูลเพิ่มจากคุณ',
  resolved: 'แก้แล้ว รอยืนยัน',
  closed: 'ปิดแล้ว',
} as const;

export type TicketStatus = keyof typeof STATUS_LABELS;
export const ACTIVE_STATUSES: TicketStatus[] = ['open', 'acknowledged', 'in_progress', 'waiting_customer', 'resolved'];
