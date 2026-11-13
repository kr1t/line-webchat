"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { ArrowLeft, Info } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { fetcher, post, RequestError } from "@/lib/fetcher";
import { dayKey, displayName, formatDayDivider } from "@/lib/format";
import type { ChatMessage, ConversationDetail, MessagePage } from "@/lib/types";
import { Composer } from "./composer";
import { CONVERSATIONS_KEY_PREFIX } from "./conversation-list";
import { MessageBubble } from "./message-bubble";

const GROUP_GAP_MS = 5 * 60_000;
const NEAR_BOTTOM_PX = 120;

function mergeMessages(...lists: ChatMessage[][]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const list of lists) for (const m of list) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

interface ChatThreadProps {
  conversation: ConversationDetail;
  initialPage: MessagePage;
  onToggleInfo: () => void;
}

export function ChatThread({ conversation, initialPage, onToggleInfo }: ChatThreadProps) {
  const { userId } = conversation;
  const { mutate } = useSWRConfig();
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoreFromBottom = useRef<number | null>(null);
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Messages being sent (or that failed before reaching the API), keyed by a local id
  const [pending, setPending] = useState<ChatMessage[]>([]);

  // Re-fetch the latest page while open; older pages are kept locally and merged by id
  const latestKey = `/conversations/${userId}/messages`;
  const { data: latest, mutate: mutateLatest } = useSWR<MessagePage>(latestKey, fetcher, {
    fallbackData: initialPage,
    refreshInterval: 2000,
  });

  const messages = useMemo(
    () => [...mergeMessages(older, latest?.messages ?? []), ...pending],
    [older, latest, pending],
  );
  const hasMore = olderHasMore ?? latest?.hasMore ?? false;
  const lastIncomingId = useMemo(() => messages.findLast((m) => m.direction === "in")?.id, [messages]);

  // Opening the chat (or receiving a new message while it is open) marks it as read
  useEffect(() => {
    if (!lastIncomingId) return;
    post(`/conversations/${userId}/read`)
      .then(() => mutate((key) => typeof key === "string" && key.startsWith(CONVERSATIONS_KEY_PREFIX)))
      .catch(() => undefined);
  }, [lastIncomingId, userId, mutate]);

  // Stick to the bottom for new messages, keep position when older ones are prepended
  const lastId = messages.at(-1)?.id;
  const wasNearBottom = useRef(true);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restoreFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFromBottom.current;
      restoreFromBottom.current = null;
    } else if (wasNearBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lastId, messages.length]);

  const refreshList = useCallback(
    () => mutate((key) => typeof key === "string" && key.startsWith(CONVERSATIONS_KEY_PREFIX)),
    [mutate],
  );

  const applyServerMessage = useCallback(
    (saved: ChatMessage) => {
      mutateLatest(
        (page) => (page ? { ...page, messages: mergeMessages(page.messages, [saved]) } : page),
        { revalidate: false },
      );
      setOlder((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
      refreshList();
    },
    [mutateLatest, refreshList],
  );

  const send = useCallback(
    async (text: string) => {
      const localId = `local-${crypto.randomUUID()}`;
      const draft: ChatMessage = {
        id: localId,
        direction: "out",
        type: "text",
        text,
        payload: null,
        status: "sending",
        error: null,
        createdAt: new Date().toISOString(),
      };
      wasNearBottom.current = true;
      setPending((prev) => [...prev, draft]);
      try {
        const saved = await post<ChatMessage>(`/conversations/${userId}/messages`, { text });
        applyServerMessage(saved);
        setPending((prev) => prev.filter((m) => m.id !== localId));
      } catch (error) {
        const code = error instanceof RequestError ? (error.code ?? null) : null;
        setPending((prev) => prev.map((m) => (m.id === localId ? { ...m, status: "failed", error: code } : m)));
      }
    },
    [userId, applyServerMessage],
  );

  const retry = useCallback(
    async (message: ChatMessage) => {
      if (message.id.startsWith("local-")) {
        // Never reached the API: drop the local copy and send again
        setPending((prev) => prev.filter((m) => m.id !== message.id));
        return send(message.text ?? "");
      }
      applyServerMessage({ ...message, status: "sending", error: null });
      try {
        applyServerMessage(await post<ChatMessage>(`/conversations/${userId}/messages/${message.id}/retry`));
      } catch (error) {
        const code = error instanceof RequestError ? (error.code ?? null) : null;
        applyServerMessage({ ...message, status: "failed", error: code ?? message.error });
      }
    },
    [userId, send, applyServerMessage],
  );

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) wasNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  const loadOlder = useCallback(async () => {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await fetcher<MessagePage>(
        `/conversations/${userId}/messages?before=${encodeURIComponent(oldest.createdAt)}`,
      );
      const el = scrollRef.current;
      if (el) restoreFromBottom.current = el.scrollHeight - el.scrollTop;
      setOlder((prev) => mergeMessages(page.messages, prev));
      setOlderHasMore(page.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }, [messages, loadingOlder, userId]);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2.5 md:px-5">
        <Link href="/inbox" className="-ml-1 rounded-lg p-1.5 text-muted hover:bg-zinc-100 md:hidden" aria-label="กลับ">
          <ArrowLeft className="size-5" />
        </Link>
        <Avatar name={conversation.displayName} src={conversation.pictureUrl} seed={userId} size={36} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{displayName(conversation.displayName)}</h2>
          {!conversation.isFollowing && <p className="text-xs text-red-500">ผู้ใช้บล็อกบัญชีนี้แล้ว</p>}
        </div>
        <button onClick={onToggleInfo} className="rounded-lg p-1.5 text-muted hover:bg-zinc-100 xl:hidden" aria-label="ข้อมูลผู้ติดต่อ">
          <Info className="size-5" />
        </button>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-4 md:px-6">
        {hasMore && (
          <div className="mb-4 flex justify-center">
            <button
              onClick={loadOlder}
              disabled={loadingOlder}
              className="rounded-full px-3 py-1 text-xs text-muted ring-1 ring-border hover:bg-surface disabled:opacity-50"
            >
              {loadingOlder ? "กำลังโหลด…" : "ดูข้อความก่อนหน้า"}
            </button>
          </div>
        )}
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted">ยังไม่มีข้อความ</p>}
        <div className="flex flex-col gap-1">
          {messages.map((message, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const newDay = !prev || dayKey(prev.createdAt) !== dayKey(message.createdAt);
            const endsGroup =
              !next ||
              next.direction !== message.direction ||
              new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime() > GROUP_GAP_MS ||
              dayKey(next.createdAt) !== dayKey(message.createdAt);
            return (
              <Fragment key={message.id}>
                {newDay && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-zinc-200/70 px-2.5 py-0.5 text-[11px] text-muted" suppressHydrationWarning>
                      {formatDayDivider(message.createdAt)}
                    </span>
                  </div>
                )}
                <div className={endsGroup ? "mb-2" : undefined}>
                  <MessageBubble message={message} showTime={endsGroup} onRetry={retry} />
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      <Composer onSend={send} disabledReason={conversation.isFollowing ? undefined : "ผู้ใช้บล็อกบัญชีนี้แล้ว จึงส่งข้อความไม่ได้"} />
    </section>
  );
}
