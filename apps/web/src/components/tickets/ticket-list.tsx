"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import clsx from "clsx";
import { Download, Search } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useNow } from "@/hooks/use-now";
import { fetcher } from "@/lib/fetcher";
import { customerName, formatListTime } from "@/lib/format";
import { SEVERITIES, SEVERITY_INFO } from "@/lib/tickets";
import type { Severity, TicketCounts, TicketListItem } from "@/lib/types";
import { ReopenedBadge, SeverityBadge, SlaBadge, TicketStatusBadge } from "./badges";

type View = "active" | "mine" | "unassigned" | "reopened" | "breached" | "closed" | "all";

const VIEWS: { value: View; label: string; count?: keyof TicketCounts }[] = [
  { value: "active", label: "ยังไม่ปิด", count: "active" },
  { value: "mine", label: "ของฉัน", count: "mine" },
  { value: "unassigned", label: "ยังไม่มีคนรับ", count: "unassigned" },
  { value: "reopened", label: "ตีกลับ", count: "reopened" },
  { value: "breached", label: "เกินกำหนด", count: "breached" },
  { value: "closed", label: "ปิดแล้ว" },
  { value: "all", label: "ทั้งหมด" },
];

export const TICKETS_KEY_PREFIX = "/tickets?";

export function ticketsQuery(view: View, severity: Severity | null, q: string) {
  const params = new URLSearchParams();
  params.set("status", view === "closed" ? "closed" : view === "all" ? "all" : "active");
  if (view === "mine") params.set("assignee", "me");
  if (view === "unassigned") params.set("assignee", "unassigned");
  if (view === "breached") params.set("sla", "breached");
  if (view === "reopened") params.set("reopened", "1");
  if (severity) params.set("severity", severity);
  if (q.trim()) params.set("q", q.trim());
  return params;
}

export function TicketList({ initial, initialCounts }: { initial: TicketListItem[]; initialCounts: TicketCounts }) {
  const [view, setView] = useState<View>("active");
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [query, setQuery] = useState("");
  const now = useNow();

  const params = ticketsQuery(view, severity, query);
  const key = `${TICKETS_KEY_PREFIX}${params}`;
  const isDefault = view === "active" && !severity && !query.trim();
  const { data, error } = useSWR<TicketListItem[]>(key, fetcher, {
    fallbackData: isDefault ? initial : undefined,
    refreshInterval: 10_000,
    keepPreviousData: true,
  });
  const { data: counts } = useSWR<TicketCounts>("/tickets/counts", fetcher, {
    fallbackData: initialCounts,
    refreshInterval: 10_000,
  });
  const tickets = data ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tickets</h1>
          <p className="text-sm text-muted">เรียงตามเวลาที่ต้องตอบหรือแก้ให้เสร็จ ใกล้ครบก่อน</p>
        </div>
        <a
          href={`/api/tickets/export.csv?${params}`}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted ring-1 ring-border hover:bg-surface hover:text-foreground"
        >
          <Download className="size-4" />
          ดาวน์โหลด CSV
        </a>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 text-sm [scrollbar-width:none] md:mx-0 md:px-0" role="tablist">
          {VIEWS.map(({ value, label, count }) => {
            const n = count ? counts?.[count] : undefined;
            return (
              <button
                key={value}
                role="tab"
                aria-selected={view === value}
                onClick={() => setView(value)}
                className={clsx(
                  "flex shrink-0 items-center gap-1 rounded-full px-3 py-1",
                  view === value ? "bg-foreground text-white" : "text-muted hover:bg-zinc-100",
                  (value === "breached" || value === "reopened") && !!n && view !== value && "text-red-600",
                )}
              >
                {label}
                {!!n && <span className={clsx("text-xs tabular-nums", view === value ? "text-white/70" : "")}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex min-w-56 flex-1 items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm ring-1 ring-border focus-within:ring-2 focus-within:ring-accent/40">
          <Search className="size-4 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาเลข TK, หัวข้อ, ชื่อลูกค้า"
            maxLength={100}
            className="w-full bg-transparent outline-none placeholder:text-muted"
          />
        </label>
        <div className="flex gap-1">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              onClick={() => setSeverity(severity === s ? null : s)}
              aria-pressed={severity === s}
              title={SEVERITY_INFO[s].label}
              className={clsx(
                "rounded-lg px-2 py-1 text-xs font-semibold ring-1",
                severity === s ? SEVERITY_INFO[s].className : "text-muted ring-border hover:bg-surface",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {error && <p className="px-4 py-8 text-center text-sm text-muted">โหลดรายการไม่สำเร็จ</p>}
        {!error && tickets.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-muted">{isDefault ? "ไม่มีเรื่องค้าง 🎉" : "ไม่พบเรื่องที่ตรงกัน"}</p>
        )}
        <ul className="divide-y divide-border">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/tickets/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                <SeverityBadge severity={t.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 font-mono text-xs text-muted">{t.code}</span>
                    <span className="truncate text-sm font-medium">{t.title}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="flex items-center gap-1.5">
                      <Avatar name={t.reporter.displayName} src={t.reporter.pictureUrl} seed={t.reporter.userId} size={16} />
                      {customerName(t.reporter)}
                    </span>
                    <span suppressHydrationWarning>แจ้ง {formatListTime(t.createdAt)}</span>
                    <span>{t.assigneeName ? `ผู้รับผิดชอบ: ${t.assigneeName}` : "ยังไม่มีคนรับ"}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  {t.status !== "closed" && <ReopenedBadge count={t.reopenCount} />}
                  <SlaBadge ticket={t} now={now} />
                  <TicketStatusBadge status={t.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
