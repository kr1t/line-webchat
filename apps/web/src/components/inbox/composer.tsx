"use client";

import { useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CannedPicker, fillCanned, markCannedUsed, useCanned } from "@/components/canned/canned-picker";
import clsx from "clsx";
import { SendHorizontal } from "lucide-react";

const MAX_LENGTH = 5000;
const MAX_HEIGHT_PX = 160;

interface ComposerProps {
  onSend: (text: string) => void;
  disabledReason?: string;
  /** Values for {name} / {agent} in saved replies */
  cannedVars?: Record<string, string | undefined>;
}

export function Composer({ onSend, disabledReason, cannedVars = {} }: ComposerProps) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_LENGTH;
  const { data: canned } = useCanned();
  // Typing "/short" at the start suggests saved replies
  const slash = /^\/(\S*)$/.exec(text)?.[1]?.toLowerCase();
  const suggestions = useMemo(
    () => (slash === undefined ? [] : (canned ?? []).filter((c) => c.shortcut.startsWith(slash)).slice(0, 6)),
    [slash, canned],
  );
  const insertCanned = (body: string) => {
    setText(body);
    ref.current?.focus();
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  if (disabledReason) {
    return (
      <div className="border-t border-border bg-surface px-4 py-3 text-center text-sm text-muted">{disabledReason}</div>
    );
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    onSend(trimmed);
    setText("");
    ref.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && suggestions.length > 0 && !event.nativeEvent.isComposing) {
      event.preventDefault();
      insertCanned(fillCanned(suggestions[0].body, cannedVars));
      markCannedUsed(suggestions[0].id);
      return;
    }
    // Thai and other IME input confirms candidates with Enter; never send mid-composition
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="relative border-t border-border bg-surface px-3 py-3 md:px-5">
      {suggestions.length > 0 && (
        <ul className="absolute inset-x-3 bottom-full z-20 mb-1 rounded-2xl border border-border bg-surface p-1.5 shadow-lg md:inset-x-5">
          {suggestions.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  insertCanned(fillCanned(c.body, cannedVars));
                  markCannedUsed(c.id);
                }}
                className={clsx("w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-zinc-100", i === 0 && "bg-zinc-50")}
              >
                <span className="font-mono text-xs text-muted">/{c.shortcut}</span> <span className="font-medium">{c.title}</span>{" "}
                <span className="text-muted">{c.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-1 rounded-2xl bg-zinc-100 py-1.5 pl-1.5 pr-1.5 focus-within:ring-2 focus-within:ring-accent/40">
        <CannedPicker onPick={insertCanned} vars={cannedVars} />
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={MAX_LENGTH + 500}
          placeholder="พิมพ์ข้อความ หรือ / เพื่อใช้ข้อความสำเร็จรูป"
          aria-label="ข้อความ"
          className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="ส่ง"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity disabled:opacity-30"
        >
          <SendHorizontal className="size-4" />
        </button>
      </div>
      <div className="mt-1 flex justify-between px-1 text-[11px] text-muted">
        <span className="hidden md:inline">Enter เพื่อส่ง · Shift+Enter ขึ้นบรรทัดใหม่</span>
        {trimmed.length > MAX_LENGTH - 500 && (
          <span className={clsx("ml-auto", trimmed.length > MAX_LENGTH && "text-red-500")}>
            {trimmed.length.toLocaleString()}/{MAX_LENGTH.toLocaleString()}
          </span>
        )}
      </div>
    </form>
  );
}
