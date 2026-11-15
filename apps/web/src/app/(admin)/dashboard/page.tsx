import { Suspense } from "react";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { apiGet } from "@/lib/api.server";
import type { DashboardSummary } from "@/lib/types";

async function DashboardLoader() {
  const summary = await apiGet<DashboardSummary>("/dashboard");
  return <DashboardView initial={summary} />;
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 p-8 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
          ))}
        </div>
      }
    >
      <DashboardLoader />
    </Suspense>
  );
}
