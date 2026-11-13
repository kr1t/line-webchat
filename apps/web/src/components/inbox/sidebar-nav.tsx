"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { MessageCircle, Users } from "lucide-react";

export function SidebarNav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/inbox", label: "กล่องข้อความ", icon: MessageCircle },
    ...(isSuperAdmin ? [{ href: "/admins", label: "แอดมิน", icon: Users }] : []),
  ];
  return (
    <>
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
              "flex size-10 items-center justify-center rounded-xl",
              active ? "bg-zinc-100 text-foreground" : "text-muted hover:bg-zinc-50 hover:text-foreground",
            )}
          >
            <Icon className="size-5" strokeWidth={1.75} />
          </Link>
        );
      })}
    </>
  );
}
