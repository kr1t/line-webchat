"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, MessageCircle, Send, Star } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { fetcher } from "@/lib/fetcher";
import { displayName } from "@/lib/format";
import { CATEGORY_LABELS, SEVERITIES, SEVERITY_INFO, spanText, STATUS_LABELS } from "@/lib/tickets";
import type { DashboardSummary, QuotaInfo, Severity } from "@/lib/types";

// Severity is ordered, so it reads as one hue from dark (most urgent) to light
const SEVERITY_FILL: Record<Severity, string> = {
  P1: "#7f1d1d",
  P2: "#b91c1c",
  P3: "#ef4444",
  P4: "#fca5a5",
  P5: "#fecaca",
};

type Range = "1" | "7" | "30";
const RANGES: { value: Range; label: string }[] = [
  { value: "1", label: "วันนี้" },
  { value: "7", label: "7 วัน" },
  { value: "30", label: "30 วัน" },
];

/** Start of today in Bangkok (UTC+7, no daylight saving) as an ISO string. */
function bangkokMidnight(daysBack: number) {
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 3600_000);
  const midnight = Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate()) - 7 * 3600_000;
  return new Date(midnight - daysBack * 86_400_000).toISOString();
}

export function DashboardView({ initial }: { initial: DashboardSummary }) {
  const [range, setRange] = useState<Range>("7");
  const from = useMemo(() => (range === "7" ? null : bangkokMidnight(range === "1" ? 0 : 29)), [range]);
  const key = from ? `/dashboard?from=${encodeURIComponent(from)}` : "/dashboard";
  const { data = initial } = useSWR<DashboardSummary>(key, fetcher, {
    fallbackData: range === "7" ? initial : undefined,
    keepPreviousData: true,
    refreshInterval: 60_000,
  });
  const { data: quota } = useSWR<QuotaInfo | null>("/dashboard/quota", fetcher, { refreshInterval: 300_000 });
  const c = data.cards;
  const openTotal = SEVERITIES.reduce((sum, s) => sum + c.openBySeverity[s], 0);
  const exportParams = new URLSearchParams({ status: "all", from: data.range.from, to: data.range.to });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">สรุปเรื่องที่ลูกค้าแจ้งเข้ามา เวลาไทย</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full bg-zinc-100 p-1 text-sm" role="tablist">
            {RANGES.map((r) => (
              <button
                key={r.value}
                role="tab"
                aria-selected={range === r.value}
                onClick={() => setRange(r.value)}
                className={clsx("rounded-full px-3 py-1", range === r.value ? "bg-surface shadow-sm" : "text-muted")}
              >
                {r.label}
              </button>
            ))}
          </div>
          <a
            href={`/api/tickets/export.csv?${exportParams}`}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted ring-1 ring-border hover:bg-surface hover:text-foreground"
          >
            <Download className="size-4" /> CSV
          </a>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Ticket ใหม่" value={c.newTickets} delta={c.newTickets - c.previousNewTickets} />
        <Tile label="ยังไม่ปิด" value={openTotal}>
          <SeverityStrip counts={c.openBySeverity} />
        </Tile>
        <Tile
          label="เกินกำหนดตอนนี้"
          value={c.breachedNow}
          tone={c.breachedNow > 0 ? "critical" : undefined}
          icon={c.breachedNow > 0 ? <AlertTriangle className="size-4" aria-hidden /> : undefined}
        />
        <Tile label="แชทที่ยังไม่มีคนรับ" value={c.unclaimedChats} icon={<MessageCircle className="size-4 text-muted" aria-hidden />} />
        <Tile label="ตอบครั้งแรกทันเวลา" value={pctText(c.responseMetPct)} hint="รวมเรื่องที่ยังไม่ตอบแต่เลยกำหนดแล้ว" />
        <Tile label="แก้เสร็จทันเวลา" value={pctText(c.resolveMetPct)} />
        <Tile
          label="ความพอใจ"
          value={c.csat.average === null ? "-" : `${c.csat.average}/5`}
          icon={<Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />}
          hint={c.csat.count ? `${c.csat.count} คะแนน · พอใจ (4–5) ${pctText(c.csat.positivePct)}` : "ยังไม่มีคะแนน"}
        />
        <QuotaTile quota={quota} />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Ticket รายวัน</h2>
          <Legend />
        </div>
        <DailyChart days={data.daily} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 font-semibold">แยกตามหมวด</h2>
          <HBars rows={data.byCategory.map((r) => ({ label: CATEGORY_LABELS[r.category], value: r.count }))} empty="ยังไม่มี ticket ในช่วงนี้" />
        </section>
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 font-semibold">เรื่องที่ยังไม่ปิด ตามสถานะ</h2>
          <HBars rows={data.byStatus.map((r) => ({ label: STATUS_LABELS[r.status], value: r.count }))} empty="ไม่มีเรื่องค้าง" />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-1 font-semibold">เวลาตอบครั้งแรกเฉลี่ย</h2>
          <p className="mb-3 text-xs text-muted">
            ทีมปรับระดับลงจากที่ลูกค้าแจ้ง {pctText(c.downgradedPct)} ของ ticket
          </p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {SEVERITIES.map((s) => (
                <tr key={s}>
                  <td className="py-2">
                    <span className="mr-2 inline-block size-2.5 rounded-sm align-middle" style={{ background: SEVERITY_FILL[s] }} />
                    {s} {SEVERITY_INFO[s].label}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {c.firstResponseMinutes[s] === null ? "-" : spanText(c.firstResponseMinutes[s]! * 60_000)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 font-semibold">ลูกค้าที่แจ้งบ่อย</h2>
          {data.topReporters.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">ยังไม่มี ticket ในช่วงนี้</p>
          ) : (
            <ol className="space-y-2">
              {data.topReporters.map((r) => (
                <li key={r.userId} className="flex items-center gap-3 text-sm">
                  <Avatar name={r.displayName} src={r.pictureUrl} seed={r.userId} size={28} />
                  <span className="min-w-0 flex-1 truncate">{displayName(r.displayName)}</span>
                  <span className="tabular-nums text-muted">{r.count} เรื่อง</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {data.staff && (
        <section className="overflow-x-auto rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 font-semibold">ทีม</h2>
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2 font-medium">พนักงาน</th>
                <th className="pb-2 text-right font-medium">รับแชท</th>
                <th className="pb-2 text-right font-medium">ข้อความที่ตอบ</th>
                <th className="pb-2 text-right font-medium">ticket ที่แก้เสร็จ</th>
                <th className="pb-2 text-right font-medium">ตอบแรกเฉลี่ย</th>
                <th className="pb-2 text-right font-medium">ตอบทันเวลา</th>
                <th className="pb-2 text-right font-medium">คะแนน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {data.staff.map((s) => (
                <tr key={s.id}>
                  <td className="py-2">{s.displayName}</td>
                  <td className="py-2 text-right">{s.chatsClaimed}</td>
                  <td className="py-2 text-right">{s.messagesSent}</td>
                  <td className="py-2 text-right">{s.ticketsResolved}</td>
                  <td className="py-2 text-right">{s.firstResponseMinutes === null ? "-" : spanText(s.firstResponseMinutes * 60_000)}</td>
                  <td className="py-2 text-right">{pctText(s.responseMetPct)}</td>
                  <td className="py-2 text-right">{s.ratingAvg ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

const pctText = (value: number | null) => (value === null ? "-" : `${value}%`);

function Tile({
  label,
  value,
  delta,
  hint,
  tone,
  icon,
  children,
}: {
  label: string;
  value: number | string;
  delta?: number;
  hint?: string;
  tone?: "critical" | "warning";
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border bg-surface p-4",
        tone === "critical" ? "border-red-300" : tone === "warning" ? "border-amber-300" : "border-border",
      )}
    >
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </p>
      <p className={clsx("mt-1 text-2xl font-semibold tabular-nums", tone === "critical" && "text-red-700")}>{value}</p>
      {delta !== undefined && delta !== 0 && (
        <p className="mt-0.5 flex items-center gap-0.5 text-xs text-muted">
          {delta > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {delta > 0 ? "+" : ""}
          {delta} จากช่วงก่อนหน้า
        </p>
      )}
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      {children}
    </div>
  );
}

function SeverityStrip({ counts }: { counts: Record<Severity, number> }) {
  return (
    <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
      {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
        <span key={s} className="flex items-center gap-1">
          <span className="size-2 rounded-sm" style={{ background: SEVERITY_FILL[s] }} />
          {s} {counts[s]}
        </span>
      ))}
    </p>
  );
}

function QuotaTile({ quota }: { quota: QuotaInfo | null | undefined }) {
  if (!quota) return <Tile label="ข้อความ push เดือนนี้" value="-" hint="อ่านโควตาจาก LINE ไม่ได้" icon={<Send className="size-4 text-muted" />} />;
  if (quota.type === "none") return <Tile label="ข้อความ push เดือนนี้" value={quota.used} hint="แพ็กนี้ไม่จำกัด" icon={<Send className="size-4 text-muted" />} />;
  const left = quota.remaining ?? 0;
  const ratio = quota.limit ? left / quota.limit : 1;
  const tone = left === 0 ? "critical" : ratio < 0.2 ? "warning" : undefined;
  return (
    <Tile
      label="ข้อความ push เดือนนี้"
      value={`${quota.used}/${quota.limit}`}
      tone={tone}
      icon={tone ? <AlertTriangle className="size-4" aria-hidden /> : <Send className="size-4 text-muted" />}
      hint={left === 0 ? "หมดแล้ว ระบบหยุดแจ้งลูกค้าอัตโนมัติ (ตอบในแชทยังได้)" : `เหลือ ${left}`}
    />
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {SEVERITIES.map((s) => (
        <li key={s} className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm" style={{ background: SEVERITY_FILL[s] }} />
          {s} {SEVERITY_INFO[s].label}
        </li>
      ))}
    </ul>
  );
}

const dayLabel = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });

/** Stacked bars per day, most urgent at the bottom; hover a day for the breakdown. */
function DailyChart({ days }: { days: DashboardSummary["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = days.map((d) => SEVERITIES.reduce((sum, s) => sum + d[s], 0));
  const max = Math.max(1, ...totals);
  const height = 180;
  const gap = 2;
  const ticks = [...new Set([0, Math.round(max / 2), max])];

  if (totals.every((t) => t === 0)) return <p className="py-12 text-center text-sm text-muted">ยังไม่มี ticket ในช่วงนี้</p>;

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex w-6 flex-col-reverse justify-between text-right text-[11px] tabular-nums text-muted" style={{ height }}>
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="relative flex flex-1 items-end gap-[2px]" style={{ height }}>
          {ticks.slice(1).map((t) => (
            <div key={t} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: (t / max) * height }} />
          ))}
          {days.map((d, i) => {
            let y = 0;
            return (
              <div
                key={d.day}
                className="relative flex h-full flex-1 cursor-default flex-col-reverse"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {SEVERITIES.map((s) => {
                  if (!d[s]) return null;
                  const h = (d[s] / max) * height;
                  y += h;
                  return (
                    <div
                      key={s}
                      style={{ height: Math.max(h - gap, 2), marginTop: gap, background: SEVERITY_FILL[s] }}
                      className={clsx("w-full first:rounded-b-[4px] last:rounded-t-[4px]", hover !== null && hover !== i && "opacity-50")}
                    />
                  );
                })}
                {hover === i && (
                  <div
                    className="absolute z-10 w-40 -translate-x-1/2 rounded-xl border border-border bg-surface p-2.5 text-xs shadow-lg"
                    style={{ left: "50%", bottom: Math.min(y, height - 40) + 8 }}
                  >
                    <p className="mb-1 font-medium">
                      {dayLabel.format(new Date(`${d.day}T00:00:00Z`))} · {totals[i]} เรื่อง
                    </p>
                    {SEVERITIES.filter((s) => d[s]).map((s) => (
                      <p key={s} className="flex items-center justify-between gap-2 text-muted">
                        <span className="flex items-center gap-1">
                          <span className="size-2 rounded-sm" style={{ background: SEVERITY_FILL[s] }} />
                          {s}
                        </span>
                        <span className="tabular-nums text-foreground">{d[s]}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="ml-8 mt-1 flex gap-[2px] text-[10px] text-muted">
        {days.map((d, i) => (
          <span key={d.day} className="flex-1 truncate text-center">
            {days.length <= 10 || i % Math.ceil(days.length / 8) === 0 ? dayLabel.format(new Date(`${d.day}T00:00:00Z`)) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function HBars({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2">
      {[...rows]
        .sort((a, b) => b.value - a.value)
        .map((r) => (
          <li key={r.label} className="text-sm">
            <div className="mb-1 flex justify-between">
              <span>{r.label}</span>
              <span className="tabular-nums text-muted">{r.value}</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-100">
              <div className="h-2 rounded-full bg-foreground/80" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
    </ul>
  );
}
