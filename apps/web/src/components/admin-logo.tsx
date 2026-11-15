import clsx from "clsx";

/** "tickget" with the red dot on the i, plus an "admin" tag so staff never confuse it with the customer pages. */
export function AdminLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  if (compact) {
    // Narrow sidebar: the "t" tile with "admin" underneath
    return (
      <span className={clsx("flex flex-col items-center gap-1", className)}>
        <span className="flex size-9 items-center justify-center rounded-xl bg-[#1A1A1A] text-lg font-extrabold leading-none text-white">
          t<span className="text-[#F2483A]">.</span>
        </span>
        <span className="rounded bg-[#F2483A] px-1 text-[9px] font-bold uppercase leading-4 tracking-wide text-white">admin</span>
      </span>
    );
  }
  return (
    <span className={clsx("flex items-center gap-2", className)}>
      <span className="text-2xl font-extrabold tracking-tight text-[#1A1A1A]">
        t<span className="text-[#F2483A]">i</span>ckget
      </span>
      <span className="rounded-md bg-[#F2483A] px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">admin</span>
    </span>
  );
}
