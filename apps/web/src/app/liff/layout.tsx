import type { Metadata } from "next";
import { LiffShell } from "@/components/liff/liff-shell";

export const metadata: Metadata = { title: "tickget" };

export default function LiffLayout({ children }: LayoutProps<"/liff">) {
  return <LiffShell>{children}</LiffShell>;
}
