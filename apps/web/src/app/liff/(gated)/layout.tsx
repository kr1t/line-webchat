import { LiffGate } from "@/components/liff/liff-shell";

/** Customer pages that need the LINE login first. */
export default function GatedLayout({ children }: { children: React.ReactNode }) {
  return <LiffGate>{children}</LiffGate>;
}
