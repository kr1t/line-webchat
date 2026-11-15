export default function AdminsLayout({ children }: LayoutProps<"/admins">) {
  return (
    <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
  );
}
