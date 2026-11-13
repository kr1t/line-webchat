import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminsView } from "@/components/admins/admins-view";
import { StepUpProvider } from "@/components/admins/step-up";
import { apiGet } from "@/lib/api.server";
import type { AdminProfile, AdminRow, AuditEntry } from "@/lib/types";

async function AdminsLoader() {
  const me = await apiGet<AdminProfile>("/auth/me");
  // The API enforces this too; this only avoids rendering a page that would fail
  if (me.role !== "SUPER_ADMIN") notFound();
  const [admins, audit] = await Promise.all([apiGet<AdminRow[]>("/admins"), apiGet<AuditEntry[]>("/audit-logs")]);
  return (
    <StepUpProvider>
      <AdminsView initialAdmins={admins} initialAudit={audit} currentId={me.id} />
    </StepUpProvider>
  );
}

export default function AdminsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl p-8"><div className="h-6 w-24 animate-pulse rounded bg-zinc-100" /></div>}>
      <AdminsLoader />
    </Suspense>
  );
}
