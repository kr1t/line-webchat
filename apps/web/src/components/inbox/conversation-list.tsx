"use client";

import { useState } from "react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import useSWR from "swr";
import clsx from "clsx";
import { Search } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { fetcher } from "@/lib/fetcher";
import { displayName, formatListTime, messagePreview } from "@/lib/format";
import type { Conversation } from "@/lib/types";

type Filter = "all" | "unread";

export const CONVERSATIONS_KEY_PREFIX = "/conversations?";

function conversationsKey(filter: Filter, q: string) {
  const params = new URLSearchParams({ filter });
  if (q.trim()) params.set("q", q.trim());
  return `${CONVERSATIONS_KEY_PREFIX}${params}`;
}

export function ConversationList({ initial }: { initial: Conversation[] }) {
  const activeId = useSelectedLayoutSegment();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const key = conversationsKey(filter, query);
  const isDefaultKey = key === conversationsKey("all", "");
  const { data, error } = useSWR<Conversation[]>(key, fetcher, {
    fallbackData: isDefaultKey ? initial : undefined,
    refreshInterval: 5000,
    keepPreviousData: true,
  });

  const conversations = data ?? [];

  return (
    <aside
      className={clsx(
        "flex w-full shrink-0 flex-col border-r border-border bg-surface md:w-80",
        "max-md:group-has-[[data-thread]]/inbox:hidden",
      )}
    >
      <header className="space-y-3 px-4 pb-3 pt-5">
        <h1 className="text-lg font-semibold">แชท</h1>
        <label className="flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-accent/40">
          <Search className="size-4 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ"
            maxLength={100}
            className="w-full bg-transparent outline-none placeholder:text-muted"
          />
        </label>
        <div className="flex gap-1 text-sm" role="tablist">
          {(["all", "unread"] as const).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={clsx(
                "rounded-full px-3 py-1 transition-colors",
                filter === value ? "bg-foreground text-white" : "text-muted hover:bg-zinc-100",
              )}
            >
              {value === "all" ? "ทั้งหมด" : "ยังไม่อ่าน"}
            </button>
          ))}
        </div>
      </header>

      <ul className="flex-1 overflow-y-auto px-2 pb-4">
        {error && <li className="px-3 py-6 text-center text-sm text-muted">โหลดรายการแชทไม่สำเร็จ</li>}
        {!error && conversations.length === 0 && (
          <li className="px-3 py-10 text-center text-sm text-muted">
            {query || filter === "unread" ? "ไม่พบแชทที่ตรงกัน" : "ยังไม่มีแชท"}
          </li>
        )}
        {conversations.map((c) => (
          <li key={c.userId}>
            <Link
              href={`/inbox/${c.userId}`}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                c.userId === activeId ? "bg-zinc-100" : "hover:bg-zinc-50",
              )}
            >
              <Avatar name={c.displayName} src={c.pictureUrl} seed={c.userId} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={clsx("truncate text-sm", c.unreadCount > 0 ? "font-semibold" : "font-medium")}>
                    {displayName(c.displayName)}
                  </span>
                  {c.lastMessageAt && (
                    <time className="shrink-0 text-xs text-muted" dateTime={c.lastMessageAt} suppressHydrationWarning>
                      {formatListTime(c.lastMessageAt)}
                    </time>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className={clsx("truncate text-sm", c.unreadCount > 0 ? "text-foreground" : "text-muted")}>
                    {c.lastMessage
                      ? `${c.lastMessage.direction === "out" ? "คุณ: " : ""}${messagePreview(c.lastMessage)}`
                      : c.isFollowing
                        ? "เพิ่มเพื่อนแล้ว"
                        : "บล็อกแล้ว"}
                  </p>
                  {c.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
                      {c.unreadCount > 99 ? "99+" : c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function ConversationListSkeleton() {
  return (
    <aside className="hidden w-80 shrink-0 flex-col gap-3 border-r border-border bg-surface p-4 md:flex">
      <div className="h-6 w-16 animate-pulse rounded bg-zinc-100" />
      <div className="h-9 animate-pulse rounded-xl bg-zinc-100" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-1">
          <div className="size-11 animate-pulse rounded-full bg-zinc-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-100" />
          </div>
        </div>
      ))}
    </aside>
  );
}
