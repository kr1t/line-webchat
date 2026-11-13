import clsx from "clsx";
import { X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { displayName, formatFullDate } from "@/lib/format";
import type { ConversationDetail } from "@/lib/types";

interface ContactPanelProps {
  conversation: ConversationDetail;
  open: boolean;
  onClose: () => void;
}

export function ContactPanel({ conversation: c, open, onClose }: ContactPanelProps) {
  return (
    <aside
      className={clsx(
        "w-72 shrink-0 border-l border-border bg-surface",
        open ? "fixed inset-y-0 right-0 z-20 shadow-xl xl:static xl:shadow-none" : "hidden xl:block",
      )}
    >
      <div className="flex justify-end p-2 xl:hidden">
        <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-zinc-100" aria-label="ปิด">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex flex-col items-center px-6 pb-6 pt-2 text-center xl:pt-8">
        <Avatar name={c.displayName} src={c.pictureUrl} seed={c.userId} size={72} />
        <h3 className="mt-3 font-semibold">{displayName(c.displayName)}</h3>
        {c.statusMessage && <p className="mt-1 text-sm text-muted">{c.statusMessage}</p>}
        <span
          className={clsx(
            "mt-3 rounded-full px-2.5 py-0.5 text-xs",
            c.isFollowing ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
          )}
        >
          {c.isFollowing ? "เป็นเพื่อนกับ OA" : "บล็อกแล้ว"}
        </span>
      </div>
      <dl className="space-y-4 border-t border-border px-6 py-5 text-sm">
        <div>
          <dt className="text-muted">แชทครั้งแรก</dt>
          <dd className="mt-0.5">{c.firstMessageAt ? formatFullDate(c.firstMessageAt) : "-"}</dd>
        </div>
        <div>
          <dt className="text-muted">จำนวนข้อความ</dt>
          <dd className="mt-0.5">{c.messageCount.toLocaleString("th-TH")}</dd>
        </div>
        <div>
          <dt className="text-muted">LINE user ID</dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-muted">{c.userId}</dd>
        </div>
      </dl>
    </aside>
  );
}
