"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { STATUS_LABELS } from "@/lib/tickets";
import type { TicketStatus } from "@/lib/types";

const SECONDS = 5;

/** What changing to this status does outside the CMS, so nobody is surprised. */
const EFFECTS: Partial<Record<TicketStatus, string>> = {
  in_progress: "ลูกค้าจะได้รับแจ้งทาง LINE ว่ากำลังแก้ไข",
  waiting_customer: "ลูกค้าจะได้รับแจ้งทาง LINE และหยุดนับเวลา SLA จนกว่าลูกค้าจะตอบ",
  resolved: "ลูกค้าจะได้รับการ์ดให้กด \"หายแล้ว\" หรือ \"ยังไม่หาย\"",
  closed: "ปิดเรื่อง ลูกค้าจะได้รับแจ้งและถูกขอให้ให้คะแนน",
  open: "กลับไปเป็นเรื่องที่ยังไม่มีคนรับ",
};

/**
 * Every status change waits a few seconds with a visible countdown:
 * "เปลี่ยนเลย" confirms now, "ยกเลิก" (or Esc) keeps the old status, otherwise it goes through.
 */
export function StatusConfirm({
  from,
  to,
  onConfirm,
  onCancel,
}: {
  from: TicketStatus;
  to: TicketStatus | null;
  onConfirm: (status: TicketStatus) => void;
  onCancel: () => void;
}) {
  const [left, setLeft] = useState(SECONDS);
  const done = useRef(false);
  // The ticket page re-renders while polling; keep the countdown running across that
  const confirmRef = useRef(onConfirm);
  useEffect(() => {
    confirmRef.current = onConfirm;
  }, [onConfirm]);

  useEffect(() => {
    if (!to) return;
    done.current = false;
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const remaining = Math.max(0, SECONDS - (Date.now() - startedAt) / 1000);
      setLeft(remaining);
      if (remaining <= 0 && !done.current) {
        done.current = true;
        clearInterval(tick);
        confirmRef.current(to);
      }
    }, 100);
    return () => clearInterval(tick);
  }, [to]);

  const confirm = () => {
    if (!to || done.current) return;
    done.current = true;
    confirmRef.current(to);
  };
  const cancel = () => {
    done.current = true;
    onCancel();
  };

  return (
    <Dialog open={to !== null} onClose={cancel} title="เปลี่ยนสถานะ">
      {to && (
        <div className="space-y-4 text-sm">
          <p className="text-[15px]">
            <span className="text-muted">{STATUS_LABELS[from]}</span> → <span className="font-semibold">{STATUS_LABELS[to]}</span>
          </p>
          {EFFECTS[to] && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">{EFFECTS[to]}</p>}
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-foreground transition-[width] duration-100 ease-linear" style={{ width: `${(left / SECONDS) * 100}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted">เปลี่ยนอัตโนมัติใน {Math.ceil(left)} วินาที</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={cancel} className="rounded-xl px-3 py-2.5 font-medium ring-1 ring-border hover:bg-zinc-50">
              ยกเลิก
            </button>
            <button onClick={confirm} autoFocus className="rounded-xl bg-foreground px-3 py-2.5 font-medium text-white hover:bg-zinc-800">
              เปลี่ยนเลย
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
