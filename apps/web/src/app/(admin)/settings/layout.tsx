import { Sidebar } from "@/components/inbox/sidebar";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
