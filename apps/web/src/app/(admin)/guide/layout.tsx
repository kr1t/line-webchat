export default function GuideLayout({ children }: LayoutProps<"/guide">) {
  return (
    <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
  );
}
