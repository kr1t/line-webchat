"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { MessageCircle, Search, Ticket, User } from "lucide-react";
import { SeverityBadge } from "@/components/tickets/badges";
import { fetcher } from "@/lib/fetcher";
import { displayName, formatListTime } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/tickets";
import type { Severity, TicketStatus } from "@/lib/types";

interface SearchResults {
  tickets: { id: string; code: string; title: string; severity: Severity; status: TicketStatus }[];
  conversations: { userId: string; displayName: string | null }[];
  messages: { id: string; userId: string; displayName: string | null; text: string; createdAt: string }[];
}

type Item = { key: string; href: string; icon: typeof Ticket; title: React.ReactNode; sub?: string };

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Cmd/Ctrl+K: jump to a ticket (type TK-123), a customer, or a chat message. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const query = useDebounced(q.trim(), 200);
  const { data } = useSWR<SearchResults>(open && query ? `/search?q=${encodeURIComponent(query)}` : null, fetcher, {
    keepPreviousData: true,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    if (!data || !query) return [];
    return [
      ...data.tickets.map((t) => ({
        key: `t-${t.id}`,
        href: `/tickets/${t.id}`,
        icon: Ticket,
        title: (
          <span className="flex items-center gap-2">
            <SeverityBadge severity={t.severity} />
            <span className="font-mono text-xs text-muted">{t.code}</span>
            <span className="truncate">{t.title}</span>
          </span>
        ),
        sub: STATUS_LABELS[t.status],
      })),
      ...data.conversations.map((c) => ({
        key: `c-${c.userId}`,
        href: `/inbox/${c.userId}`,
        icon: User,
        title: displayName(c.displayName),
        sub: "เปิดแชท",
      })),
      ...data.messages.map((m) => ({
        key: `m-${m.id}`,
        href: `/inbox/${m.userId}`,
        icon: MessageCircle,
        title: <span className="truncate">{m.text}</span>,
        sub: `${displayName(m.displayName)} · ${formatListTime(m.createdAt)}`,
      })),
    ];
  }, [data, query]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    setQ("");
    router.push(item.href);
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="mx-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] rounded-2xl bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/30"
    >
      {open && (
        <div>
          <label className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="size-4 text-muted" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, items.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  go(items[active]);
                }
              }}
              placeholder="ค้นหา TK-000123, ชื่อลูกค้า หรือข้อความในแชท"
              maxLength={100}
              className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted"
            />
            <kbd className="rounded border border-border px-1.5 text-[10px] text-muted">esc</kbd>
          </label>
          <ul className="max-h-[50vh] overflow-y-auto p-2">
            {items.map((item, i) => (
              <li key={item.key}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${i === active ? "bg-zinc-100" : ""}`}
                >
                  <item.icon className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.title}</span>
                    {item.sub && <span className="block truncate text-xs text-muted">{item.sub}</span>}
                  </span>
                </button>
              </li>
            ))}
            {query && data && items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">ไม่พบผลลัพธ์</li>}
            {!query && <li className="px-3 py-6 text-center text-sm text-muted">พิมพ์เพื่อค้นหา</li>}
          </ul>
        </div>
      )}
    </dialog>
  );
}
