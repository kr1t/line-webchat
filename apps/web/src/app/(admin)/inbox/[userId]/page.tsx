import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ThreadSkeleton, ThreadView } from "@/components/inbox/thread-view";
import { ApiError, apiGet } from "@/lib/api.server";
import type { AdminProfile, ConversationDetail, MessagePage } from "@/lib/types";

const LINE_USER_ID = /^U[0-9a-f]{32}$/;

async function ThreadLoader({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!LINE_USER_ID.test(userId)) notFound();

  const [conversation, page, me] = await Promise.all([
    apiGet<ConversationDetail>(`/conversations/${userId}`),
    apiGet<MessagePage>(`/conversations/${userId}/messages`),
    apiGet<AdminProfile>("/auth/me"),
  ]).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });

  return <ThreadView key={userId} conversation={conversation} initialPage={page} me={me} />;
}

export default function ThreadPage({ params }: PageProps<"/inbox/[userId]">) {
  return (
    <Suspense fallback={<ThreadSkeleton />}>
      <ThreadLoader params={params} />
    </Suspense>
  );
}
