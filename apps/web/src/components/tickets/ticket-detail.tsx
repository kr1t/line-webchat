"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import clsx from "clsx";
import { AlertCircle, ArrowLeft, Lock, MessageCircle, SendHorizontal, Star } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { buttonClass, FormError, inputClass } from "@/components/auth/auth-card";
import { Dialog } from "@/components/ui/dialog";
import { useNow } from "@/hooks/use-now";
import { fetcher, patch, post, RequestError } from "@/lib/fetcher";
import { displayName, formatFullDate, formatTime, sendErrorText } from "@/lib/format";
import {
  CATEGORY_LABELS,
  DEADLINE_LABELS,
  dueText,
  SEVERITIES,
  SEVERITY_INFO,
  STATUS_LABELS,
  TICKET_EVENT_TEXT,
  TICKET_STATUSES,
} from "@/lib/tickets";
import type { AdminProfile, Severity, TeamMember, TicketCategory, TicketDetail as Detail, TicketStatus } from "@/lib/types";
import { CannedPicker } from "@/components/canned/canned-picker";
import { ReopenedBadge, SeverityBadge, SlaBadge, TicketStatusBadge } from "./badges";
import { TICKETS_KEY_PREFIX } from "./ticket-list";

const selectClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent/40";

export function TicketDetail({ initial, me }: { initial: Detail; me: AdminProfile }) {
  const key = `/tickets/${initial.id}`;
  const { data: ticket = initial, mutate } = useSWR<Detail>(key, fetcher, { fallbackData: initial, refreshInterval: 5000 });
  const { mutate: globalMutate } = useSWRConfig();
  const [error, setError] = useState<string | null>(null);
  const [severityDraft, setSeverityDraft] = useState<Severity | null>(null);
  const now = useNow();

  const apply = async (request: Promise<Detail>) => {
    setError(null);
    try {
      await mutate(await request, { revalidate: false });
      void globalMutate((k) => typeof k === "string" && (k.startsWith(TICKETS_KEY_PREFIX) || k === "/tickets/counts"));
    } catch (err) {
      setError(err instanceof RequestError && err.code ? sendErrorText(err.code) : "บันทึกไม่สำเร็จ");
      throw err;
    }
  };

  const update = (body: Record<string, unknown>) => apply(patch<Detail>(key, body)).catch(() => undefined);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 lg:flex-row">
      <div className="min-w-0 flex-1">
        <Link href="/tickets" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="size-4" /> Tickets
        </Link>
        <header className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted">{ticket.code}</span>
            <SeverityBadge severity={ticket.severity} withLabel />
            <TicketStatusBadge status={ticket.status} />
            <SlaBadge ticket={ticket} now={now} />
            <ReopenedBadge count={ticket.reopenCount} />
          </div>
          <h1 className="mt-2 text-xl font-semibold">{ticket.title}</h1>
          {ticket.reopenedAt && ticket.status !== "closed" && ticket.status !== "resolved" && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-semibold">↩️ ลูกค้าแจ้งว่ายังไม่หาย{ticket.reopenCount > 1 ? ` (ครั้งที่ ${ticket.reopenCount})` : ""}</p>
              <p className="mt-0.5 text-red-700" suppressHydrationWarning>
                เมื่อ {formatFullDate(ticket.reopenedAt)} {formatTime(ticket.reopenedAt)} · ดูรายละเอียดที่ลูกค้าส่งมาด้านล่าง แล้วแก้ใหม่ก่อนกด &quot;แก้แล้ว&quot;
              </p>
            </div>
          )}
          {ticket.reportedSeverity !== ticket.severity && (
            <p className="mt-1 text-xs text-muted">ลูกค้าแจ้งเป็น {ticket.reportedSeverity} ทีมปรับเป็น {ticket.severity}</p>
          )}
        </header>

        {ticket.attachments.length > 0 && (
          <div className="mb-4 rounded-2xl border border-border bg-surface p-4">
            <p className="mb-2 text-sm font-medium">รูปจากลูกค้า ({ticket.attachments.length})</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {ticket.attachments.map((a, i) => (
                <a
                  key={a.id}
                  href={`/api/tickets/${ticket.id}/attachments/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-border hover:opacity-90"
                  title={`${a.source === "line" ? "ส่งในแชท LINE" : "อัปโหลดจากหน้า tickget"} · ${Math.round(a.size / 1024)} KB`}
                >
                  <Image src={`/api/tickets/${ticket.id}/attachments/${a.id}`} alt={`รูปที่ ${i + 1}`} fill sizes="160px" className="object-cover" unoptimized />
                </a>
              ))}
            </div>
          </div>
        )}
        <Thread ticket={ticket} />
        <ReplyBox
          ticketId={ticket.id}
          disabled={!ticket.reporterFollowing}
          onSent={apply}
          cannedVars={{ name: ticket.reporter.displayName ?? undefined, ticket: ticket.code, agent: me.displayName }}
        />
        <FormError message={error} />
      </div>

      <aside className="w-full shrink-0 space-y-4 lg:w-80">
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 text-sm">
          <Field label="สถานะ">
            <select
              className={selectClass}
              value={ticket.status}
              onChange={(e) => update({ status: e.target.value as TicketStatus })}
            >
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ระดับ">
            <select className={selectClass} value={ticket.severity} onChange={(e) => setSeverityDraft(e.target.value as Severity)}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_INFO[s].emoji} {s} {SEVERITY_INFO[s].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="หมวด">
            <select className={selectClass} value={ticket.category} onChange={(e) => update({ category: e.target.value as TicketCategory })}>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <AssigneeField ticket={ticket} me={me} onChange={(assigneeId) => update({ assigneeId })} />
        </section>

        <section className="space-y-2 rounded-2xl border border-border bg-surface p-4 text-sm">
          <h2 className="font-medium">SLA</h2>
          <Deadline
            label="ตอบครั้งแรก"
            state={ticket.sla.response}
            due={ticket.sla.responseDueAt}
            doneAt={ticket.firstResponseAt}
            now={now}
          />
          <Deadline label="แก้เสร็จ" state={ticket.sla.resolve} due={ticket.sla.resolveDueAt} doneAt={ticket.resolvedAt} now={now} />
          {ticket.sla.paused && <p className="text-xs text-violet-700">หยุดนับเวลา ระหว่างรอข้อมูลจากลูกค้า</p>}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4 text-sm">
          <div className="flex items-center gap-3">
            <Avatar name={ticket.reporter.displayName} src={ticket.reporter.pictureUrl} seed={ticket.reporter.userId} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{displayName(ticket.reporter.displayName)}</p>
              {!ticket.reporterFollowing && <p className="text-xs text-red-600">บล็อก OA แล้ว ส่งข้อความไม่ได้</p>}
            </div>
            <Link
              href={`/inbox/${ticket.reporter.userId}`}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted ring-1 ring-border hover:bg-zinc-50"
            >
              <MessageCircle className="size-3.5" /> แชท
            </Link>
          </div>
          {ticket.rating !== null && (
            <div className="mt-3 rounded-xl bg-zinc-50 p-3">
              <p className="flex items-center gap-1 font-medium">
                <Star className="size-4 fill-amber-400 text-amber-400" /> {ticket.rating}/5
              </p>
              {ticket.ratingComment && <p className="mt-1 text-xs text-muted">“{ticket.ratingComment}”</p>}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4 text-sm">
          <h2 className="mb-2 font-medium">ประวัติ</h2>
          <ol className="space-y-2 text-xs text-muted">
            {ticket.events.map((e) => (
              <li key={e.id}>
                <span className="text-foreground">{TICKET_EVENT_TEXT(e)}</span>
                {e.reason && e.type === "severity" && <span className="block">เหตุผล: {e.reason}</span>}
                <time className="block" dateTime={e.createdAt} suppressHydrationWarning>
                  {formatFullDate(e.createdAt)} {formatTime(e.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        </section>
      </aside>

      <SeverityDialog
        draft={severityDraft}
        current={ticket.severity}
        onClose={() => setSeverityDraft(null)}
        onSave={async (severity, severityReason) => {
          await apply(patch<Detail>(key, { severity, severityReason }));
          setSeverityDraft(null);
        }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

function Deadline({
  label,
  state,
  due,
  doneAt,
  now,
}: {
  label: string;
  state: Detail["sla"]["response"];
  due: string | null;
  doneAt: string | null;
  now: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span
        className={clsx(
          "text-right text-xs",
          state === "breached" && "font-medium text-red-600",
          state === "at_risk" && "font-medium text-amber-700",
          state === "met" && "text-emerald-700",
        )}
        suppressHydrationWarning
      >
        {state === "none"
          ? DEADLINE_LABELS.none
          : doneAt
            ? `${DEADLINE_LABELS[state]} · ${formatTime(doneAt)}`
            : `${dueText(due, now)} (${due ? formatTime(due) : "-"})`}
      </span>
    </div>
  );
}

function AssigneeField({ ticket, me, onChange }: { ticket: Detail; me: AdminProfile; onChange: (id: string | null) => void }) {
  const { data: team } = useSWR<TeamMember[]>("/team", fetcher);
  return (
    <Field label="ผู้รับผิดชอบ">
      <div className="flex gap-2">
        <select
          className={selectClass}
          value={ticket.assigneeId ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">ยังไม่มีคนรับ</option>
          {(team ?? (ticket.assigneeId ? [{ id: ticket.assigneeId, displayName: ticket.assigneeName ?? "" }] : [])).map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
        {ticket.assigneeId !== me.id && (
          <button
            type="button"
            onClick={() => onChange(me.id)}
            className="shrink-0 rounded-lg px-2.5 text-xs font-medium ring-1 ring-border hover:bg-zinc-50"
          >
            รับเอง
          </button>
        )}
      </div>
    </Field>
  );
}

function Thread({ ticket }: { ticket: Detail }) {
  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-border bg-surface p-4">
      {ticket.messages.map((m) => {
        if (m.authorType === "system") {
          return (
            <div key={m.id} className="flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-border" />
              <span className={m.body.includes("ยังไม่หาย") ? "font-semibold text-red-700" : "font-medium"}>
                {m.body} · {formatTime(m.createdAt)}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
          );
        }
        if (m.internal) {
          return (
            <div key={m.id} className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm">
              <p className="mb-1 flex items-center gap-1 text-xs font-medium text-amber-800">
                <Lock className="size-3" /> โน้ตภายใน · {m.authorName ?? "ทีม"} · {formatTime(m.createdAt)}
              </p>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </div>
          );
        }
        const fromTeam = m.authorType === "admin";
        return (
          <div key={m.id} className={clsx("flex flex-col", fromTeam ? "items-end" : "items-start")}>
            <div
              className={clsx(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px]",
                fromTeam ? "rounded-br-md bg-accent text-accent-foreground" : "rounded-bl-md bg-zinc-100",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </div>
            <span className="mt-1 flex items-center gap-1 px-1 text-[11px] text-muted">
              {m.status === "failed" && (
                <span className="flex items-center gap-1 text-red-500">
                  <AlertCircle className="size-3" /> {sendErrorText(m.error)} ·
                </span>
              )}
              {fromTeam ? (m.authorName ?? "ทีม") : "ลูกค้า"} · {formatFullDate(m.createdAt)} {formatTime(m.createdAt)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ReplyBox({
  ticketId,
  disabled,
  onSent,
  cannedVars,
}: {
  ticketId: string;
  disabled: boolean;
  onSent: (request: Promise<Detail>) => Promise<void>;
  cannedVars: Record<string, string | undefined>;
}) {
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(disabled);
  const [sending, setSending] = useState(false);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSent(post<Detail>(`/tickets/${ticketId}/messages`, { body, internal }));
      setText("");
    } catch {
      // error shown by the parent
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form
      onSubmit={submit}
      className={clsx("rounded-2xl border bg-surface p-3", internal ? "border-amber-300" : "border-border")}
    >
      <div className="mb-2 flex gap-1 text-sm">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setInternal(false)}
          className={clsx("rounded-full px-3 py-1 disabled:opacity-40", !internal ? "bg-foreground text-white" : "text-muted hover:bg-zinc-100")}
        >
          ตอบลูกค้า (ส่งเข้า LINE)
        </button>
        <button
          type="button"
          onClick={() => setInternal(true)}
          className={clsx("flex items-center gap-1 rounded-full px-3 py-1", internal ? "bg-amber-500 text-white" : "text-muted hover:bg-zinc-100")}
        >
          <Lock className="size-3" /> โน้ตภายใน
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        maxLength={4900}
        placeholder={internal ? "โน้ตนี้ทีมเห็นคนเดียว" : "ข้อความถึงลูกค้า ระบบจะใส่เลข ticket ให้"}
        className="w-full resize-y bg-transparent text-[15px] outline-none placeholder:text-muted"
      />
      <div className="flex items-center justify-between gap-2">
        <CannedPicker onPick={(body) => setText((prev) => (prev ? `${prev}\n${body}` : body))} vars={cannedVars} />
        <span className="hidden text-[11px] text-muted md:inline">⌘/Ctrl + Enter เพื่อส่ง</span>
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="flex items-center gap-1.5 rounded-xl bg-foreground px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          <SendHorizontal className="size-4" />
          {sending ? "กำลังส่ง…" : internal ? "บันทึกโน้ต" : "ส่ง"}
        </button>
      </div>
    </form>
  );
}

function SeverityDialog({
  draft,
  current,
  onClose,
  onSave,
}: {
  draft: Severity | null;
  current: Severity;
  onClose: () => void;
  onSave: (severity: Severity, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = draft !== null && draft !== current;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft, reason.trim());
      setReason("");
    } catch {
      setError("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`เปลี่ยนเป็น ${draft ?? ""}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">เวลาที่ต้องตอบและแก้จะคำนวณใหม่ นับจากตอนที่ลูกค้าแจ้ง</p>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">เหตุผล</span>
          <input
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={3}
            maxLength={300}
            required
            placeholder="เช่น กระทบลูกค้าทุกคน / มีทางเลี่ยงแล้ว"
          />
        </label>
        <FormError message={error} />
        <button type="submit" disabled={saving || reason.trim().length < 3} className={buttonClass}>
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </form>
    </Dialog>
  );
}
