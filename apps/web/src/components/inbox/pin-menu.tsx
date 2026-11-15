"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Pin, PinOff } from "lucide-react";
import { del, post } from "@/lib/fetcher";
import type { ConversationDetail } from "@/lib/types";

/** Pin a chat for yourself (📌) or for the whole team (📍). */
export function PinMenu({ conversation: c, onChanged }: { conversation: ConversationDetail; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pinned = c.pinnedByMe || c.pinnedTeam;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = async (team: boolean, on: boolean) => {
    if (on) await post(`/conversations/${c.userId}/pin`, { team });
    else await del(`/conversations/${c.userId}/pin?team=${team}`);
    setOpen(false);
    onChanged();
  };

  const item = "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={pinned ? "ปักหมุดอยู่" : "ปักหมุด"}
        aria-label="ปักหมุดแชท"
        className={clsx(
          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium ring-1 ring-border hover:bg-zinc-50",
          pinned ? "text-foreground" : "text-muted hover:text-foreground",
        )}
      >
        {pinned ? <span aria-hidden>{c.pinnedTeam ? "📍" : "📌"}</span> : <Pin className="size-4" />}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-xl">
          <button onClick={() => toggle(false, !c.pinnedByMe)} className={item}>
            <span>📌 {c.pinnedByMe ? "เอาออกจากหมุดของฉัน" : "ปักหมุดของฉัน"}</span>
            <span className="text-[11px] text-muted">เห็นคนเดียว</span>
          </button>
          <button onClick={() => toggle(true, !c.pinnedTeam)} className={item}>
            <span>📍 {c.pinnedTeam ? "เอาออกจากหมุดทีม" : "ปักหมุดให้ทั้งทีม"}</span>
            <span className="text-[11px] text-muted">ทุกคนเห็น</span>
          </button>
          {c.pinnedTeam && c.pinnedTeamBy && <p className="px-3 pb-1 pt-1 text-[11px] text-muted">ปักให้ทีมโดย {c.pinnedTeamBy}</p>}
          {pinned && (
            <p className="flex items-center gap-1 px-3 pb-1 text-[11px] text-muted">
              <PinOff className="size-3" /> หมุดทีม ใครก็เอาออกได้
            </p>
          )}
        </div>
      )}
    </div>
  );
}
