import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import { ApiError, apiGet } from "@/lib/api.server";
import type { AdminProfile, TicketDetail as Detail } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function TicketLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [ticket, me] = await Promise.all([apiGet<Detail>(`/tickets/${id}`), apiGet<AdminProfile>("/auth/me")]).catch(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 404) notFound();
      throw error;
    },
  );
  return <TicketDetail key={id} initial={ticket} me={me} />;
}

export default function TicketPage({ params }: PageProps<"/tickets/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl p-8"><div className="h-6 w-40 animate-pulse rounded bg-zinc-100" /></div>}>
      <TicketLoader params={params} />
    </Suspense>
  );
}
