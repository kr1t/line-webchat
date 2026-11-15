import { Sidebar } from "@/components/inbox/sidebar";

export default function AdminsLayout({ children }: LayoutProps<"/admins">) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
