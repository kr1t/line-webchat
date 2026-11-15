"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./brand";
import { LiffProvider, useLiff } from "./liff-provider";

function Gate({ children }: { children: ReactNode }) {
  const { me, error } = useLiff();
  if (error) return <p className="px-6 py-20 text-center text-sm text-zinc-600">{error}</p>;
  if (!me) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-sm text-zinc-500">
        <span className="size-8 animate-spin rounded-full border-[3px] border-zinc-300 border-t-[#F2483A]" />
        กำลังเชื่อมต่อ LINE…
      </div>
    );
  }
  return <>{children}</>;
}

/** Customer pages inside LINE: tickget look, cream background, phone-first. */
export function LiffShell({ children }: { children: ReactNode }) {
  // The guide is public: show it right away instead of waiting for LINE login
  const isPublic = usePathname() === "/liff/help";
  return (
    <LiffProvider>
      <div className="min-h-dvh bg-[#FBF8F1] text-[#1A1A1A]">
        <header className="sticky top-0 z-10 flex items-center justify-between bg-[#FBF8F1]/90 px-5 py-3 backdrop-blur">
          <Link href="/liff" aria-label="หน้าแรก">
            <Wordmark className="text-2xl" />
          </Link>
        </header>
        <main className="mx-auto w-full max-w-md px-4 pb-10">
          {isPublic ? children : <Gate>{children}</Gate>}
        </main>
      </div>
    </LiffProvider>
  );
}
