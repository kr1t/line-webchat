"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { AdminProfile, ConversationDetail, MessagePage } from "@/lib/types";
import { ChatThread } from "./chat-thread";
import { ContactPanel } from "./contact-panel";

interface ThreadViewProps {
  conversation: ConversationDetail;
  initialPage: MessagePage;
  me: AdminProfile;
}

export function ThreadView({ conversation: initial, initialPage, me }: ThreadViewProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  // Status, owner and role change while the chat is open; keep them fresh
  const { data: conversation = initial, mutate } = useSWR<ConversationDetail>(`/conversations/${initial.userId}`, fetcher, {
    fallbackData: initial,
    refreshInterval: 5000,
  });
  return (
    <div data-thread className="flex h-full min-w-0 flex-1">
      <ChatThread
        conversation={conversation}
        initialPage={initialPage}
        me={me}
        onConversationChanged={() => void mutate()}
        onToggleInfo={() => setInfoOpen((v) => !v)}
      />
      <ContactPanel
        conversation={conversation}
        me={me}
        onChanged={() => void mutate()}
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
      />
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div data-thread className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
        <div className="size-9 animate-pulse rounded-full bg-zinc-100" />
        <div className="h-4 w-32 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="flex-1 space-y-3 p-6">
        {[60, 40, 70, 30].map((w, i) => (
          <div key={i} className={i % 2 ? "flex justify-end" : "flex"}>
            <div className="h-9 animate-pulse rounded-2xl bg-zinc-100" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
