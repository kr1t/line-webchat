import type { Metadata } from "next";
import { HelpGuide } from "@/components/help/help-guide";

export const metadata: Metadata = { title: { absolute: "วิธีใช้ · tickget" } };

/** Opened from the rich menu's คู่มือ button through LIFF. */
export default function LiffHelpPage() {
  return <HelpGuide inLiff />;
}
