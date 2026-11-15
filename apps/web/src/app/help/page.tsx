import type { Metadata } from "next";
import { HelpGuide } from "@/components/help/help-guide";

export const metadata: Metadata = {
  title: { absolute: "วิธีใช้ tickget · น้องติ๊ก" },
  description: "แจ้งปัญหาและติดตามงานผ่าน LINE กับน้องติ๊ก",
  robots: { index: false, follow: false },
};

/** Customer guide outside LINE (no sign-in needed). */
export default function HelpPage() {
  return (
    <div className="min-h-dvh bg-[#FBF8F1] text-[#1A1A1A]">
      <main className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
        <HelpGuide />
      </main>
    </div>
  );
}
