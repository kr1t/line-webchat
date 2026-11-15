export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
  );
}
