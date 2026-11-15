import { Sidebar } from "@/components/inbox/sidebar";

/** One sidebar for every admin page, so it stays put while moving between sections. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    // group/inbox: on mobile the chat list and an open chat take turns (CSS :has, no client state)
    <div className="group/inbox flex h-dvh overflow-hidden">
      <Sidebar />
      {children}
    </div>
  );
}
