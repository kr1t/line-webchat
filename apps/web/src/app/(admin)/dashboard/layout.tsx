export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
  );
}
