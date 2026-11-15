import clsx from "clsx";
import { Pause } from "lucide-react";
import { dueText, SEVERITY_INFO, STATUS_CLASS, STATUS_LABELS } from "@/lib/tickets";
import type { Severity, TicketListItem, TicketStatus } from "@/lib/types";

export function SeverityBadge({ severity, withLabel = false }: { severity: Severity; withLabel?: boolean }) {
  const info = SEVERITY_INFO[severity];
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1", info.className)}
      title={`${severity} ${info.label}`}
    >
      {severity}
      {withLabel && <span className="font-medium">{info.label}</span>}
    </span>
  );
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={clsx("inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLASS[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Customer said "ยังไม่หาย" after the team marked it fixed. */
export function ReopenedBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200"
      title={`ลูกค้าแจ้งว่ายังไม่หาย ${count} ครั้ง`}
    >
      ↩ ตีกลับ{count > 1 ? ` ×${count}` : ""}
    </span>
  );
}

/** What the team owes next and how long is left: first reply, then the fix. */
export function SlaBadge({ ticket, now }: { ticket: TicketListItem; now: number }) {
  const { sla } = ticket;
  if (!sla.current) return null;
  const due = ticket.firstResponseAt ? sla.resolveDueAt : sla.responseDueAt;
  const what = ticket.firstResponseAt ? "แก้" : "ตอบ";
  const text = dueText(due, now);
  if (!text) return null;
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        sla.current === "breached" && "bg-red-600 text-white",
        sla.current === "at_risk" && "bg-amber-100 text-amber-800",
        sla.current === "ok" && "bg-zinc-100 text-muted",
      )}
      suppressHydrationWarning
    >
      {sla.paused && <Pause className="size-3" aria-label="หยุดนับเวลา" />}
      {what} {text}
    </span>
  );
}
