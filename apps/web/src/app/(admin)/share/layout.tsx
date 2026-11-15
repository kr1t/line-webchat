export default function ShareLayout({ children }: LayoutProps<"/share">) {
  return (
    <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
  );
}
