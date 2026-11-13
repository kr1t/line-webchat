"use client";

import { useState } from "react";
import type { ConversationDetail, MessagePage } from "@/lib/types";
import { ChatThread } from "./chat-thread";
import { ContactPanel } from "./contact-panel";

export function ThreadView({ conversation, initialPage }: { conversation: ConversationDetail; initialPage: MessagePage }) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div data-thread className="flex h-full min-w-0 flex-1">
      <ChatThread conversation={conversation} initialPage={initialPage} onToggleInfo={() => setInfoOpen((v) => !v)} />
      <ContactPanel conversation={conversation} open={infoOpen} onClose={() => setInfoOpen(false)} />
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
