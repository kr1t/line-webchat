import type { Metadata } from "next";
import { LiffShell } from "@/components/liff/liff-shell";

// Customer pages: plain brand name, no "admin"
export const metadata: Metadata = { title: { absolute: "tickget" } };

export default function LiffLayout({ children }: LayoutProps<"/liff">) {
  return <LiffShell>{children}</LiffShell>;
}
