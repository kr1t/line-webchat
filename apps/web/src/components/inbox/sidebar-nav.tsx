"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import clsx from "clsx";
import { BookOpen, LayoutDashboard, MessageCircle, QrCode, Search, Settings, Ticket, Users } from "lucide-react";
import { CommandPalette } from "@/components/search/command-palette";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { fetcher } from "@/lib/fetcher";
import type { TicketCounts } from "@/lib/types";

const itemClass = "flex size-10 items-center justify-center rounded-xl";

export function SidebarNav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const [searching, setSearching] = useState(false);
  // P1/P2 tickets nobody has answered yet: a red number on the Tickets icon
  const { data: counts } = useSWR<TicketCounts>("/tickets/counts", fetcher, { refreshInterval: 15_000 });
  const urgent = counts?.urgent ?? 0;
  const items = [
    { href: "/inbox", label: "กล่องข้อความ", icon: MessageCircle },
    { href: "/tickets", label: "Tickets", icon: Ticket },
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/share", label: "แชร์ QR", icon: QrCode },
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/guide", label: "คู่มือ", icon: BookOpen },
    ...(isSuperAdmin ? [{ href: "/admins", label: "แอดมิน", icon: Users }] : []),
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <NotificationCenter />
      <button
        onClick={() => setSearching(true)}
        title="ค้นหา (⌘K)"
        aria-label="ค้นหา"
        className={clsx(itemClass, "text-muted hover:bg-zinc-50 hover:text-foreground")}
      >
        <Search className="size-5" strokeWidth={1.75} />
      </button>
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={clsx(
              itemClass,
              "relative",
              active ? "bg-zinc-100 text-foreground" : "text-muted hover:bg-zinc-50 hover:text-foreground",
            )}
          >
            <Icon className="size-5" strokeWidth={1.75} />
            {href === "/tickets" && urgent > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white"
                title={`P1/P2 ที่ยังไม่มีคนตอบ ${urgent} เรื่อง`}
              >
                {urgent > 9 ? "9+" : urgent}
              </span>
            )}
          </Link>
        );
      })}
      <CommandPalette open={searching} onClose={() => setSearching(false)} />
    </>
  );
}
