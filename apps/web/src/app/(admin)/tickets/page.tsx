import { Suspense } from "react";
import { TicketList } from "@/components/tickets/ticket-list";
import { apiGet } from "@/lib/api.server";
import type { TicketCounts, TicketListItem } from "@/lib/types";

async function TicketsLoader() {
  const [tickets, counts] = await Promise.all([
    apiGet<TicketListItem[]>("/tickets?status=active"),
    apiGet<TicketCounts>("/tickets/counts"),
  ]);
  return <TicketList initial={tickets} initialCounts={counts} />;
}

export default function TicketsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TicketsLoader />
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 py-6 md:px-8">
      <div className="h-6 w-24 animate-pulse rounded bg-zinc-100" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-100" />
      ))}
    </div>
  );
}
