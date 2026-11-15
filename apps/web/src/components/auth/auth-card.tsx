import type { ReactNode } from "react";
import { AdminLogo } from "@/components/admin-logo";

export function AuthCard({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="w-full max-w-sm">
      <AdminLogo className="mb-8" />
      <h1 className="text-xl font-semibold">{title}</h1>
      {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[15px] outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25";

export const buttonClass =
  "flex w-full items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
      {message}
    </p>
  );
}
