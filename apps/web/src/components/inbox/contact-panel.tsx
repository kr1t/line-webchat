"use client";

import { useState } from "react";
import clsx from "clsx";
import { BadgeCheck, X } from "lucide-react";
import { useStepUp } from "@/components/admins/step-up";
import { CreateInviteDialog } from "@/components/settings/invites";
import Link from "next/link";
import useSWR from "swr";
import { SeverityBadge, TicketStatusBadge } from "@/components/tickets/badges";
import { fetcher, put, RequestError } from "@/lib/fetcher";
import { Avatar } from "@/components/avatar";
import { displayName, formatFullDate } from "@/lib/format";
import type { AdminProfile, ConversationDetail, TicketListItem } from "@/lib/types";

interface ContactPanelProps {
  conversation: ConversationDetail;
  me: AdminProfile;
  onChanged: () => void;
  open: boolean;
  onClose: () => void;
}

export function ContactPanel({ conversation: c, open, onClose, onChanged }: ContactPanelProps) {
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
      <CustomerAccess conversation={c} onChanged={onChanged} />
      <CustomerTickets userId={c.userId} />
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

const RICH_MENU_NOTES: Record<string, string> = {
  not_configured: "ยังไม่ได้ตั้งค่า Rich menu ลูกค้า (CUSTOMER_RICH_MENU_ID) ลูกค้าจะยังไม่เห็นเมนู",
  failed: "ผูก Rich menu ไม่สำเร็จ ลองกดบันทึกอีกครั้ง",
};

function CustomerAccess({ conversation: c, onChanged }: { conversation: ConversationDetail; onChanged: () => void }) {
  const withStepUp = useStepUp();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const isCustomer = c.role === "CUSTOMER";
  const [inviting, setInviting] = useState(false);

  const toggle = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = await withStepUp(() =>
        put<{ richMenu: string }>(`/conversations/${c.userId}/role`, { role: isCustomer ? null : "CUSTOMER" }),
      );
      setNote(RICH_MENU_NOTES[result.richMenu] ?? null);
      onChanged();
    } catch (err) {
      if (!(err instanceof RequestError && err.code === "step_up_cancelled")) setNote("บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-t border-border px-6 py-5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">สิทธิ์ลูกค้า</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            {isCustomer ? (
              <>
                <BadgeCheck className="size-3.5 text-emerald-600" aria-hidden />
                แจ้ง ticket ผ่าน LINE ได้
              </>
            ) : (
              "แชทได้อย่างเดียว"
            )}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={clsx(
            "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50",
            isCustomer ? "text-red-600 ring-1 ring-red-200 hover:bg-red-50" : "bg-foreground text-white hover:bg-zinc-800",
          )}
        >
          {busy ? "กำลังบันทึก…" : isCustomer ? "ถอนสิทธิ์" : "ให้สิทธิ์"}
        </button>
      </div>
      {note && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">{note}</p>}
      {!isCustomer && (
        <button onClick={() => setInviting(true)} className="mt-3 text-xs text-muted underline underline-offset-2 hover:text-foreground">
          หรือส่งลิงก์เชิญให้ลูกค้ากดยืนยันเอง
        </button>
      )}
      <CreateInviteDialog open={inviting} onClose={() => setInviting(false)} target={{ userId: c.userId, name: c.displayName }} />
    </section>
  );
}

function CustomerTickets({ userId }: { userId: string }) {
  const { data } = useSWR<TicketListItem[]>(`/tickets?status=all&reporterId=${userId}&limit=10`, fetcher, {
    refreshInterval: 15_000,
  });
  if (!data?.length) return null;
  return (
    <section className="border-t border-border px-6 py-5 text-sm">
      <p className="mb-2 font-medium">Tickets</p>
      <ul className="space-y-1.5">
        {data.map((t) => (
          <li key={t.id}>
            <Link href={`/tickets/${t.id}`} className="block rounded-lg p-2 hover:bg-zinc-50">
              <div className="flex items-center gap-1.5">
                <SeverityBadge severity={t.severity} />
                <span className="font-mono text-xs text-muted">{t.code}</span>
              </div>
              <p className="mt-1 truncate">{t.title}</p>
              <div className="mt-1">
                <TicketStatusBadge status={t.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
