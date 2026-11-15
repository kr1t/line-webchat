import { Suspense } from "react";
import { SettingsView } from "@/components/settings/settings-view";
import { apiGet } from "@/lib/api.server";
import type { AdminProfile, BusinessHours, CannedResponse } from "@/lib/types";

async function SettingsLoader() {
  const [me, hours, canned] = await Promise.all([
    apiGet<AdminProfile>("/auth/me"),
    apiGet<BusinessHours>("/settings/business-hours"),
    apiGet<CannedResponse[]>("/canned-responses"),
  ]);
  return <SettingsView me={me} initialHours={hours} initialCanned={canned} />;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl p-8"><div className="h-6 w-24 animate-pulse rounded bg-zinc-100" /></div>}>
      <SettingsLoader />
    </Suspense>
  );
}
