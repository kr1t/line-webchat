"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Bell, BellRing, Check, Settings2, Volume2, VolumeX, X } from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import { formatListTime } from "@/lib/format";

type NotificationType = "ticket_new" | "ticket_reopened" | "chat_new" | "chat_transferred" | "ticket_assigned" | "ticket_reply";

interface AdminNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  severity: string | null;
  createdAt: string;
}

interface Prefs {
  sound: boolean;
  desktop: boolean;
  newTickets: "all" | "urgent" | "off";
  reopened: boolean;
  chats: boolean;
  mine: boolean;
}

const DEFAULT_PREFS: Prefs = { sound: true, desktop: true, newTickets: "all", reopened: true, chats: true, mine: true };
const PREFS_KEY = "tickget:notify-prefs";
const READ_KEY = "tickget:notify-read-at";
const POLL_MS = 10_000;
// Messages carry the time LINE sent them and can land in the database a bit later,
// so every poll looks back a little and repeats are dropped by id
const OVERLAP_MS = 2 * 60_000;
const MAX_ITEMS = 30;

// Per-browser settings; storage can be unavailable (private mode), so every access is guarded
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // ignore
  }
}

function wanted(n: AdminNotification, prefs: Prefs) {
  switch (n.type) {
    case "ticket_new":
      return prefs.newTickets === "all" || (prefs.newTickets === "urgent" && (n.severity === "P1" || n.severity === "P2"));
    case "ticket_reopened":
      return prefs.reopened;
    case "chat_new":
      return prefs.chats;
    default:
      return prefs.mine;
  }
}

/** A short two-note chime; P1 gets a louder, longer one. */
function chime(urgent: boolean) {
  try {
    const ctx = new AudioContext();
    const notes = urgent ? [880, 1175, 880, 1175] : [988, 1319];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(urgent ? 0.35 : 0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    // Audio can be blocked until the page has been clicked once
  }
}

const ICON: Record<NotificationType, string> = {
  ticket_new: "🎫",
  ticket_reopened: "↩️",
  chat_new: "💬",
  chat_transferred: "🔀",
  ticket_assigned: "📌",
  ticket_reply: "✉️",
};

/**
 * Bell in the sidebar: polls /notifications, keeps a short list, plays a chime,
 * shows a toast (or a system notification when the tab is in the background)
 * and puts the unread count in the tab title.
 */
export function NotificationCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [toasts, setToasts] = useState<AdminNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [readAt, setReadAt] = useState<number>(0);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const sinceRef = useRef<string | null>(null);
  const seen = useRef(new Set<string>());
  const mountedAt = useRef(0);
  const prefsRef = useRef(prefs);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Read browser-only state after mount so the server render stays the same
    const stored = load(PREFS_KEY, DEFAULT_PREFS);
    prefsRef.current = stored;
    mountedAt.current = Date.now();
    queueMicrotask(() => {
      setPrefs(stored);
      setReadAt(Number(load<{ v: number }>(READ_KEY, { v: Date.now() }).v) || Date.now());
      setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    });
  }, []);

  const updatePrefs = (next: Prefs) => {
    setPrefs(next);
    prefsRef.current = next;
    save(PREFS_KEY, next);
  };

  const announce = useCallback(
    (fresh: AdminNotification[]) => {
      const p = prefsRef.current;
      const shown = fresh.filter((n) => wanted(n, p));
      if (shown.length === 0) return;
      if (p.sound) chime(shown.some((n) => n.severity === "P1" || n.type === "ticket_reopened"));
      if (document.hidden && p.desktop && typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const n of shown.slice(0, 3)) {
          const note = new Notification(n.title, { body: n.body, tag: n.id, icon: "/brand/mascot/greet.png" });
          note.onclick = () => {
            window.focus();
            router.push(n.href);
            note.close();
          };
        }
      } else {
        setToasts((prev) => [...shown.slice(0, 3), ...prev].slice(0, 4));
        for (const n of shown.slice(0, 3)) setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== n.id)), 8000);
      }
    },
    [router],
  );

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      const startedAt = new Date(Date.now() - OVERLAP_MS).toISOString();
      try {
        const query = sinceRef.current ? `?since=${encodeURIComponent(sinceRef.current)}` : "";
        const list = await fetcher<AdminNotification[]>(`/notifications${query}`);
        if (stopped) return;
        const fresh = list.filter((n) => !seen.current.has(n.id));
        fresh.forEach((n) => seen.current.add(n.id));
        if (fresh.length) {
          setItems((prev) => [...fresh, ...prev].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_ITEMS));
          // Only things that happen while the page is open make noise; the first load just fills the list
          if (sinceRef.current) announce(fresh.filter((n) => new Date(n.createdAt).getTime() >= mountedAt.current - POLL_MS));
        }
        sinceRef.current = startedAt;
      } catch {
        // Try again on the next tick
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [announce]);

  const visible = items.filter((n) => wanted(n, prefs));
  const unread = visible.filter((n) => new Date(n.createdAt).getTime() > readAt).length;

  // "(3) tickget admin" while something is unread
  useEffect(() => {
    // Next sets the title on navigation, so apply the count again after it does
    const apply = () => {
      const base = document.title.replace(/^\(\d+\+?\) /, "");
      document.title = unread > 0 ? `(${unread > 9 ? "9+" : unread}) ${base}` : base;
    };
    apply();
    const id = setTimeout(apply, 300);
    return () => clearTimeout(id);
  }, [unread, pathname]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !panelRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const markAllRead = () => {
    const now = Date.now();
    setReadAt(now);
    save(READ_KEY, { v: now });
  };

  const askPermission = async () => {
    if (typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  };

  return (
    <>
      <div ref={panelRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          title="การแจ้งเตือน"
          aria-label={`การแจ้งเตือน${unread ? ` ${unread} รายการใหม่` : ""}`}
          className="relative flex size-10 items-center justify-center rounded-xl text-muted hover:bg-zinc-50 hover:text-foreground"
        >
          {unread > 0 ? <BellRing className="size-5" strokeWidth={1.75} /> : <Bell className="size-5" strokeWidth={1.75} />}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute left-12 top-0 z-40 w-[22rem] rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-semibold">การแจ้งเตือน</p>
              <div className="flex items-center gap-1">
                <button onClick={markAllRead} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-zinc-100" title="อ่านทั้งหมด">
                  <Check className="size-3.5" /> อ่านทั้งหมด
                </button>
                <button onClick={() => setSettings((v) => !v)} className="rounded-lg p-1.5 text-muted hover:bg-zinc-100" aria-label="ตั้งค่าการแจ้งเตือน">
                  <Settings2 className="size-4" />
                </button>
              </div>
            </div>

            {settings && (
              <div className="space-y-2 border-b border-border bg-zinc-50 px-4 py-3 text-sm">
                <label className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">{prefs.sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} เสียง</span>
                  <input type="checkbox" checked={prefs.sound} onChange={(e) => updatePrefs({ ...prefs, sound: e.target.checked })} className="size-4 accent-foreground" />
                </label>
                <div className="flex items-center justify-between gap-2">
                  <span>แจ้งเตือนของเครื่อง (ตอนอยู่แท็บอื่น)</span>
                  {permission === "granted" ? (
                    <input type="checkbox" checked={prefs.desktop} onChange={(e) => updatePrefs({ ...prefs, desktop: e.target.checked })} className="size-4 accent-foreground" />
                  ) : permission === "denied" ? (
                    <span className="text-xs text-red-600">ถูกบล็อกในเบราว์เซอร์</span>
                  ) : permission === "unsupported" ? (
                    <span className="text-xs text-muted">เบราว์เซอร์ไม่รองรับ</span>
                  ) : (
                    <button onClick={askPermission} className="rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-white">
                      เปิดใช้
                    </button>
                  )}
                </div>
                <label className="flex items-center justify-between">
                  <span>ticket ใหม่</span>
                  <select
                    value={prefs.newTickets}
                    onChange={(e) => updatePrefs({ ...prefs, newTickets: e.target.value as Prefs["newTickets"] })}
                    className="rounded-lg border border-border bg-surface px-2 py-0.5 text-xs"
                  >
                    <option value="all">ทุกระดับ</option>
                    <option value="urgent">เฉพาะ P1–P2</option>
                    <option value="off">ไม่แจ้ง</option>
                  </select>
                </label>
                {(
                  [
                    ["reopened", "ลูกค้าแจ้งว่ายังไม่หาย"],
                    ["chats", "ข้อความใหม่ในแชทที่ยังไม่มีคนรับ / ของฉัน"],
                    ["mine", "โอนแชท / มอบหมาย / ลูกค้าตอบ ticket ของฉัน"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between gap-2">
                    <span>{label}</span>
                    <input type="checkbox" checked={prefs[key]} onChange={(e) => updatePrefs({ ...prefs, [key]: e.target.checked })} className="size-4 accent-foreground" />
                  </label>
                ))}
                <p className="text-xs text-muted">ตั้งค่านี้เก็บในเบราว์เซอร์นี้เท่านั้น</p>
              </div>
            )}

            <ul className="max-h-[60vh] overflow-y-auto p-2">
              {visible.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">ยังไม่มีอะไรใหม่</li>}
              {visible.map((n) => {
                const isNew = new Date(n.createdAt).getTime() > readAt;
                return (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className={clsx("flex gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-50", isNew && "bg-sky-50/60")}
                    >
                      <span className="text-lg leading-6" aria-hidden>
                        {ICON[n.type]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={clsx("block truncate text-sm", isNew ? "font-semibold" : "font-medium")}>{n.title}</span>
                        <span className="block truncate text-xs text-muted">{n.body}</span>
                      </span>
                      <time className="shrink-0 text-[11px] text-muted" suppressHydrationWarning>
                        {formatListTime(n.createdAt)}
                      </time>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Toasts while the tab is visible */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((n) => (
          <div key={n.id} className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-border bg-surface p-3 shadow-xl">
            <span className="text-xl leading-6" aria-hidden>
              {ICON[n.type]}
            </span>
            <button
              onClick={() => {
                setToasts((prev) => prev.filter((t) => t.id !== n.id));
                router.push(n.href);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-sm font-semibold">{n.title}</span>
              <span className="block truncate text-xs text-muted">{n.body}</span>
            </button>
            <button onClick={() => setToasts((prev) => prev.filter((t) => t.id !== n.id))} className="rounded p-0.5 text-muted hover:bg-zinc-100" aria-label="ปิด">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
