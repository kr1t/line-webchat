import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LiffTicket } from "@/components/liff/liff-ticket";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <LiffTicket id={id} />;
}

export default function LiffTicketPage({ params }: PageProps<"/liff/tickets/[id]">) {
  return (
    <Suspense fallback={<div className="mt-4 h-40 animate-pulse rounded-3xl bg-white/70" />}>
      <Ticket params={params} />
    </Suspense>
  );
}
