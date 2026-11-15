import { Suspense } from "react";
import { ConversationList, ConversationListSkeleton } from "@/components/inbox/conversation-list";
import { apiGet } from "@/lib/api.server";
import type { Conversation } from "@/lib/types";

async function ConversationListLoader() {
  const conversations = await apiGet<Conversation[]>("/conversations");
  return <ConversationList initial={conversations} />;
}

export default function InboxLayout({ children }: LayoutProps<"/inbox">) {
  return (
    // On mobile the list and an open chat take turns filling the screen (the group is on the admin layout)
    <>
      <Suspense fallback={<ConversationListSkeleton />}>
        <ConversationListLoader />
      </Suspense>
      <main className="min-w-0 flex-1 flex-col max-md:hidden max-md:group-has-[[data-thread]]/inbox:flex md:flex">
        {children}
      </main>
    </>
  );
}
