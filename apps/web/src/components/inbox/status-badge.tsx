import clsx from "clsx";
import { CONVERSATION_STATUS_LABELS } from "@/lib/format";
import type { ConversationStatus } from "@/lib/types";

const STYLES: Record<ConversationStatus, string> = {
  open: "bg-sky-50 text-sky-700",
  handling: "bg-amber-50 text-amber-700",
  closed: "bg-zinc-100 text-muted",
};

const DOTS: Record<ConversationStatus, string> = {
  open: "bg-sky-500",
  handling: "bg-amber-500",
  closed: "bg-zinc-400",
};

/** "เปิด", "Nok กำลังตอบ" or "ปิด". Compact shows only a dot and the owner's first name for the list. */
export function StatusBadge({
  status,
  assignedName,
  compact = false,
}: {
  status: ConversationStatus;
  assignedName: string | null;
  compact?: boolean;
}) {
  const label = status === "handling" && assignedName ? `${assignedName} กำลังตอบ` : CONVERSATION_STATUS_LABELS[status];
  if (compact) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted" title={label}>
        <span className={clsx("size-1.5 rounded-full", DOTS[status])} aria-hidden />
        <span className="max-w-16 truncate">{status === "handling" && assignedName ? assignedName.split(" ")[0] : CONVERSATION_STATUS_LABELS[status]}</span>
      </span>
    );
  }
  return <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", STYLES[status])}>{label}</span>;
}
