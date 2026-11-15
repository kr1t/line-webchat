import type { ReactNode } from "react";
import clsx from "clsx";

export const INK = "#1A1A1A";
export const RED = "#F2483A";
export const CREAM = "#FBF8F1";

/** "tickget" with the red dot on the i. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={clsx("relative inline-block font-extrabold tracking-tight text-[#1A1A1A]", className)} aria-label="tickget">
      t<span className="relative">
        ı<span className="absolute left-1/2 top-[0.12em] size-[0.26em] -translate-x-1/2 rounded-full bg-[#F2483A]" aria-hidden />
      </span>
      ckget
    </span>
  );
}

export function LiffCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("rounded-3xl border-2 border-[#1A1A1A] bg-white p-4", className)}>{children}</div>;
}

export const primaryButton =
  "flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1A1A1A] px-4 py-3 text-[15px] font-semibold text-white active:scale-[0.99] disabled:opacity-40";
export const secondaryButton =
  "flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#1A1A1A] bg-white px-4 py-3 text-[15px] font-semibold text-[#1A1A1A] disabled:opacity-40";
