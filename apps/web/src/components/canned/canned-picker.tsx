"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Zap } from "lucide-react";
import { fetcher, post } from "@/lib/fetcher";
import type { CannedResponse } from "@/lib/types";

/** Fills {name}, {ticket} and {agent}; unknown placeholders stay as they are. */
export function fillCanned(body: string, vars: Record<string, string | undefined>) {
  return body.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

export function useCanned() {
  return useSWR<CannedResponse[]>("/canned-responses", fetcher, { revalidateOnFocus: false });
}

export function markCannedUsed(id: string) {
  void post(`/canned-responses/${id}/use`).catch(() => undefined);
}

/** ⚡ button that opens a searchable list of saved replies. */
export function CannedPicker({ onPick, vars = {} }: { onPick: (body: string) => void; vars?: Record<string, string | undefined> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data } = useCanned();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter(
      (c) => !needle || c.shortcut.includes(needle) || c.title.toLowerCase().includes(needle) || c.body.toLowerCase().includes(needle),
    );
  }, [data, q]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="ข้อความสำเร็จรูป"
        title="ข้อความสำเร็จรูป"
        className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-zinc-200/60 hover:text-foreground"
      >
        <Zap className="size-4" />
      </button>
      {open && (
        <div className="absolute bottom-11 left-0 z-30 w-80 rounded-2xl border border-border bg-surface p-2 shadow-xl">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาข้อความสำเร็จรูป"
            className="mb-1 w-full rounded-lg bg-zinc-100 px-3 py-1.5 text-sm outline-none"
          />
          <ul className="max-h-64 overflow-y-auto">
            {items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(fillCanned(c.body, vars));
                    markCannedUsed(c.id);
                    setOpen(false);
                    setQ("");
                  }}
                  className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-zinc-100"
                >
                  <span className="text-sm font-medium">{c.title}</span>
                  <span className="ml-2 font-mono text-xs text-muted">/{c.shortcut}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{c.body}</span>
                </button>
              </li>
            ))}
            {data && items.length === 0 && (
              <li className="px-2.5 py-4 text-center text-xs text-muted">
                {data.length === 0 ? "ยังไม่มีข้อความสำเร็จรูป เพิ่มได้ที่หน้า Settings" : "ไม่พบ"}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
