"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { post } from "@/lib/fetcher";
import type { AdminProfile } from "@/lib/types";

export function AccountMenu({ admin }: { admin: AdminProfile }) {
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    await post("/auth/logout").catch(() => undefined);
    // Full reload on purpose: drops every cached chat in memory before the next person signs in
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  };

  return (
    <div className="mt-auto flex flex-col items-center gap-2">
      <span
        className="flex size-9 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium"
        title={`${admin.displayName} (${admin.username})`}
      >
        {admin.displayName.charAt(0).toUpperCase()}
      </span>
      <button
        onClick={logout}
        disabled={busy}
        className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-zinc-100 hover:text-foreground"
        aria-label="ออกจากระบบ"
        title="ออกจากระบบ"
      >
        <LogOut className="size-5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
