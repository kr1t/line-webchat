"use client";

import Link from "next/link";
import useSWR from "swr";
import { ChevronRight, Plus } from "lucide-react";
import { formatListTime } from "@/lib/format";
import { LiffCard, primaryButton } from "./brand";
import { Mascot } from "./mascot";
import { CUSTOMER_STATUS, levelOf, type LiffTicket } from "./liff-data";
import { liffFetch, useLiff } from "./liff-provider";

export function LiffHome() {
  const { me } = useLiff();
  const isCustomer = me?.role === "CUSTOMER";
  const { data } = useSWR<{ active: LiffTicket[]; closed: LiffTicket[] }>(isCustomer ? "/tickets" : null, liffFetch, {
    refreshInterval: 15_000,
  });

  if (!isCustomer) {
    return (
      <LiffCard className="mt-6 flex flex-col items-center text-center">
        <Mascot mood={me?.pendingApproval ? "p3" : "greet"} size={120} className="mb-3" />
        <p className="text-lg font-bold">สวัสดีครับ{me?.displayName ? ` คุณ${me.displayName}` : ""} น้องติ๊กเองครับ</p>
        <p className="mt-2 text-sm text-zinc-600">
          {me?.pendingApproval ? "ได้รับคำขอแล้ว รอทีมงานอนุมัติสักครู่นะครับ" : "บัญชีนี้ยังไม่มีสิทธิ์แจ้งปัญหา ขอลิงก์เชิญจากทีมงานได้เลยครับ"}
        </p>
      </LiffCard>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      <div className="flex items-center gap-3">
        <Mascot mood="greet" size={64} />
        <p className="font-bold">มีอะไรให้น้องติ๊กช่วยเหลือไหมครับ?</p>
      </div>
      <Link href="/liff/new" className={primaryButton}>
        <Plus className="size-5" /> แจ้งปัญหาใหม่
      </Link>
      <TicketGroup title="กำลังดำเนินการ" tickets={data?.active} empty="ไม่มีเรื่องค้างอยู่ 🎉" />
      {!!data?.closed.length && <TicketGroup title="ปิดแล้ว" tickets={data.closed} />}
    </div>
  );
}

function TicketGroup({ title, tickets, empty }: { title: string; tickets?: LiffTicket[]; empty?: string }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-bold text-zinc-500">{title}</h2>
      {!tickets ? (
        <div className="h-20 animate-pulse rounded-3xl bg-white/70" />
      ) : tickets.length === 0 ? (
        <p className="flex flex-col items-center gap-2 rounded-3xl bg-white/60 px-4 py-6 text-center text-sm text-zinc-500">
          <Mascot mood="p4" size={72} />
          {empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => {
            const level = levelOf(t.severity);
            return (
              <li key={t.id}>
                <Link href={`/liff/tickets/${t.id}`} className="flex items-center gap-3 rounded-3xl border-2 border-[#1A1A1A] bg-white p-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-xs font-extrabold text-white" style={{ background: level.color }}>
                    {t.severity}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{t.title}</span>
                    <span className="block text-xs text-zinc-500" suppressHydrationWarning>
                      {t.code} · {CUSTOMER_STATUS[t.status]} · {formatListTime(t.updatedAt)}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-zinc-400" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
