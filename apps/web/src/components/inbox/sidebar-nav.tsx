"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, MessageCircle, Search, Settings, Ticket, Users } from "lucide-react";
import { CommandPalette } from "@/components/search/command-palette";

const itemClass = "flex size-10 items-center justify-center rounded-xl";

export function SidebarNav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const [searching, setSearching] = useState(false);
  const items = [
    { href: "/inbox", label: "กล่องข้อความ", icon: MessageCircle },
    { href: "/tickets", label: "Tickets", icon: Ticket },
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/settings", label: "Settings", icon: Settings },
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
            className={clsx(itemClass, active ? "bg-zinc-100 text-foreground" : "text-muted hover:bg-zinc-50 hover:text-foreground")}
          >
            <Icon className="size-5" strokeWidth={1.75} />
          </Link>
        );
      })}
      <CommandPalette open={searching} onClose={() => setSearching(false)} />
    </>
  );
}
