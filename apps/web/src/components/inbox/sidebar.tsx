import { Suspense } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api.server";
import type { AdminProfile } from "@/lib/types";
import { AccountMenu } from "./account-menu";
import { SidebarNav } from "./sidebar-nav";

async function SidebarContent() {
  const admin = await apiGet<AdminProfile>("/auth/me");
  return (
    <>
      <SidebarNav isSuperAdmin={admin.role === "SUPER_ADMIN"} />
      <AccountMenu admin={admin} />
    </>
  );
}

export function Sidebar() {
  return (
    <nav className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-border bg-surface py-4 md:flex" aria-label="เมนูหลัก">
      <Link href="/inbox" className="mb-4 flex size-9 items-center justify-center rounded-xl bg-accent text-sm font-semibold text-accent-foreground" aria-label="tickget">
        t
      </Link>
      <Suspense>
        <SidebarContent />
      </Suspense>
    </nav>
  );
}
