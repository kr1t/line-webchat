import type { Severity, TicketCategory, TicketStatus } from "@/lib/types";

export interface LiffTicket {
  id: string;
  code: string;
  title: string;
  severity: Severity;
  status: TicketStatus;
  category: TicketCategory;
  createdAt: string;
  updatedAt: string;
  rating: number | null;
  expectedResponse: string;
}

export interface LiffTicketDetail extends LiffTicket {
  description: string;
  messages: { id: string; from: "customer" | "admin" | "system"; authorName: string | null; body: string; createdAt: string }[];
  statusHistory: { status: TicketStatus; at: string }[];
}

/** What the customer sees for each level (matches the chat cards). */
export const LEVELS: { severity: Severity; label: string; hint: string; examples: string; response: string; color: string }[] = [
  { severity: "P1", label: "วิกฤต", hint: "ใช้งานไม่ได้เลย และกระทบเงินหรือข้อมูล", examples: "เว็บล่ม · จ่ายเงินไม่ได้ · ข้อมูลหาย", response: "15 นาที", color: "#E5352B" },
  { severity: "P2", label: "สูง", hint: "ฟีเจอร์หลักใช้ไม่ได้ และไม่มีวิธีอื่น", examples: "login ไม่ได้ · สั่งซื้อไม่ได้", response: "1 ชม.", color: "#EA7A1A" },
  { severity: "P3", label: "ปานกลาง", hint: "ผิดปกติ แต่ยังใช้วิธีอื่นแทนได้", examples: "ค้นหาไม่เจอบางคำ · ตัวเลขผิด", response: "4 ชม.", color: "#C99A00" },
  { severity: "P4", label: "ต่ำ", hint: "ไม่กระทบการใช้งาน แค่ดูไม่ถูก", examples: "สะกดผิด · UI เพี้ยน", response: "1 วัน", color: "#2E9E4F" },
  { severity: "P5", label: "คำถาม / ขอฟีเจอร์", hint: "อยากถาม หรืออยากได้อะไรเพิ่ม", examples: "ถามวิธีใช้ · ขอฟีเจอร์ใหม่", response: "2 วัน", color: "#3B7BE0" },
];

export const CUSTOMER_STATUS: Record<TicketStatus, string> = {
  open: "รอทีมรับเรื่อง",
  acknowledged: "ทีมรับเรื่องแล้ว",
  in_progress: "กำลังแก้ไข",
  waiting_customer: "รอข้อมูลเพิ่มจากคุณ",
  resolved: "แก้แล้ว รอคุณยืนยัน",
  closed: "ปิดแล้ว",
};

export const levelOf = (severity: Severity) => LEVELS.find((l) => l.severity === severity)!;
