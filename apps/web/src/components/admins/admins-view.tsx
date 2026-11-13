"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { KeyRound, MoreHorizontal, Plus, ShieldOff, UserCheck, UserX } from "lucide-react";
import { buttonClass, Field, FormError, inputClass } from "@/components/auth/auth-card";
import { Dialog } from "@/components/ui/dialog";
import { authErrorText } from "@/lib/auth";
import { fetcher, patch, post, RequestError } from "@/lib/fetcher";
import { formatFullDate, formatListTime, formatTime } from "@/lib/format";
import type { AdminRow, AuditEntry } from "@/lib/types";
import { useStepUp } from "./step-up";
import { TempPassword } from "./temp-password";

type Issued = { username: string; password: string } | null;
type Confirm = { kind: "reset-password" | "reset-2fa" | "deactivate" | "activate"; admin: AdminRow } | null;

const errorText = (err: unknown) => authErrorText(err instanceof RequestError ? err.code : undefined);
const isCancelled = (err: unknown) => err instanceof RequestError && err.code === "step_up_cancelled";

export function AdminsView({ initialAdmins, initialAudit, currentId }: { initialAdmins: AdminRow[]; initialAudit: AuditEntry[]; currentId: string }) {
  const [tab, setTab] = useState<"admins" | "audit">("admins");
  const { data: adminList, mutate } = useSWR<AdminRow[]>("/admins", fetcher, { fallbackData: initialAdmins });
  const { data: audit, mutate: mutateAudit } = useSWR<AuditEntry[]>(tab === "audit" ? "/audit-logs" : null, fetcher, {
    fallbackData: initialAudit,
  });

  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<Issued>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const refresh = () => {
    void mutate();
    void mutateAudit();
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">แอดมิน</h1>
          <p className="text-sm text-muted">จัดการบัญชีที่เข้าใช้งานกล่องข้อความ</p>
        </div>
        <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-foreground px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-800">
          <Plus className="size-4" />
          เพิ่มแอดมิน
        </button>
      </header>

      <div className="mb-4 flex gap-1 text-sm" role="tablist">
        {(
          [
            ["admins", "บัญชี"],
            ["audit", "ประวัติการใช้งาน"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={clsx("rounded-full px-3 py-1", tab === value ? "bg-foreground text-white" : "text-muted hover:bg-zinc-100")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "admins" ? (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {(adminList ?? []).map((admin) => (
            <AdminItem key={admin.id} admin={admin} isSelf={admin.id === currentId} onAction={(kind) => setConfirm({ kind, admin })} />
          ))}
        </ul>
      ) : (
        <AuditList entries={audit ?? []} />
      )}

      <CreateAdminDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(username, password) => {
          setCreating(false);
          setIssued({ username, password });
          refresh();
        }}
      />

      <ConfirmDialog
        confirm={confirm}
        onClose={() => setConfirm(null)}
        onDone={(result) => {
          setConfirm(null);
          if (result) setIssued(result);
          refresh();
        }}
      />

      <Dialog open={!!issued} onClose={() => setIssued(null)} title="บัญชีพร้อมใช้งาน">
        {issued && <TempPassword username={issued.username} password={issued.password} onDone={() => setIssued(null)} />}
      </Dialog>
    </div>
  );
}

function StatusBadges({ admin }: { admin: AdminRow }) {
  const badges: [string, string][] = [];
  if (admin.role === "SUPER_ADMIN") badges.push(["Super admin", "bg-violet-50 text-violet-700"]);
  if (!admin.isActive) badges.push(["ปิดใช้งาน", "bg-zinc-100 text-zinc-600"]);
  else if (admin.mustChangePassword) badges.push(["รอเข้าสู่ระบบครั้งแรก", "bg-amber-50 text-amber-700"]);
  else if (!admin.totpEnabled) badges.push(["ยังไม่ตั้ง 2FA", "bg-amber-50 text-amber-700"]);
  return (
    <>
      {badges.map(([label, color]) => (
        <span key={label} className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium", color)}>
          {label}
        </span>
      ))}
    </>
  );
}

function AdminItem({ admin, isSelf, onAction }: { admin: AdminRow; isSelf: boolean; onAction: (kind: NonNullable<Confirm>["kind"]) => void }) {
  const manageable = !isSelf && admin.role !== "SUPER_ADMIN";
  return (
    <li className={clsx("flex items-center gap-3 px-4 py-3.5", !admin.isActive && "opacity-60")}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium">
        {admin.displayName.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium">{admin.displayName}</span>
          {isSelf && <span className="text-xs text-muted">(คุณ)</span>}
          <StatusBadges admin={admin} />
        </div>
        <p className="truncate text-sm text-muted">
          @{admin.username} ·{" "}
          {admin.lastLoginAt ? (
            <span suppressHydrationWarning>เข้าใช้ล่าสุด {formatListTime(admin.lastLoginAt)}</span>
          ) : (
            "ยังไม่เคยเข้าใช้"
          )}
        </p>
      </div>
      {manageable && (
        <details className="relative">
          <summary className="list-none rounded-lg p-1.5 text-muted hover:bg-zinc-100 [&::-webkit-details-marker]:hidden" aria-label="ตัวเลือก">
            <MoreHorizontal className="size-5" />
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-52 overflow-hidden rounded-xl border border-border bg-surface py-1 text-sm shadow-lg">
            <MenuButton icon={KeyRound} label="รีเซ็ตรหัสผ่าน" onClick={() => onAction("reset-password")} />
            <MenuButton icon={ShieldOff} label="รีเซ็ต 2FA" onClick={() => onAction("reset-2fa")} />
            {admin.isActive ? (
              <MenuButton icon={UserX} label="ปิดใช้งาน" danger onClick={() => onAction("deactivate")} />
            ) : (
              <MenuButton icon={UserCheck} label="เปิดใช้งาน" onClick={() => onAction("activate")} />
            )}
          </div>
        </details>
      )}
    </li>
  );
}

function MenuButton({ icon: Icon, label, onClick, danger }: { icon: typeof KeyRound; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.currentTarget.closest("details")?.removeAttribute("open");
        onClick();
      }}
      className={clsx("flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50", danger && "text-red-600")}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function CreateAdminDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (username: string, password: string) => void }) {
  const withStepUp = useStepUp();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const result = await withStepUp(() =>
        post<{ admin: AdminRow; tempPassword: string }>("/admins", {
          username: String(form.get("username") ?? ""),
          displayName: String(form.get("displayName") ?? ""),
        }),
      );
      onCreated(result.admin.username, result.tempPassword);
    } catch (err) {
      if (!isCancelled(err)) setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="เพิ่มแอดมิน">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="ชื่อที่แสดง">
          <input name="displayName" required maxLength={60} autoFocus className={inputClass} placeholder="เช่น นก ฝ่ายบริการลูกค้า" />
        </Field>
        <Field label="ชื่อผู้ใช้">
          <input
            name="username"
            required
            pattern="[A-Za-z0-9._\-]{3,32}"
            maxLength={32}
            autoComplete="off"
            className={inputClass}
            placeholder="nok"
          />
          <span className="mt-1 block text-xs text-muted">3–32 ตัว ใช้ a-z, 0-9, จุด, ขีดล่าง หรือขีดกลาง</span>
        </Field>
        <FormError message={error} />
        <button type="submit" disabled={submitting} className={buttonClass}>
          {submitting ? "กำลังสร้าง…" : "สร้างบัญชี"}
        </button>
      </form>
    </Dialog>
  );
}

const CONFIRM_TEXT: Record<NonNullable<Confirm>["kind"], { title: string; body: string; action: string; danger?: boolean }> = {
  "reset-password": {
    title: "รีเซ็ตรหัสผ่าน",
    body: "รหัสผ่านเดิมจะใช้ไม่ได้ทันที และระบบจะสร้างรหัสผ่านชั่วคราวใหม่ให้ เจ้าของบัญชีจะถูกออกจากระบบทุกอุปกรณ์",
    action: "รีเซ็ตรหัสผ่าน",
  },
  "reset-2fa": {
    title: "รีเซ็ต 2FA",
    body: "แอป Authenticator และ recovery codes เดิมจะใช้ไม่ได้ เจ้าของบัญชีต้องตั้งค่า 2FA ใหม่เมื่อเข้าสู่ระบบครั้งถัดไป",
    action: "รีเซ็ต 2FA",
  },
  deactivate: {
    title: "ปิดใช้งานบัญชี",
    body: "บัญชีนี้จะถูกออกจากระบบทันทีและเข้าสู่ระบบไม่ได้ ประวัติการตอบแชทยังอยู่ครบ เปิดใช้งานใหม่ได้ภายหลัง",
    action: "ปิดใช้งาน",
    danger: true,
  },
  activate: { title: "เปิดใช้งานบัญชี", body: "บัญชีนี้จะเข้าสู่ระบบได้อีกครั้ง", action: "เปิดใช้งาน" },
};

function ConfirmDialog({ confirm, onClose, onDone }: { confirm: Confirm; onClose: () => void; onDone: (issued: Issued) => void }) {
  const withStepUp = useStepUp();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const text = confirm && CONFIRM_TEXT[confirm.kind];

  async function run() {
    if (!confirm) return;
    const { kind, admin } = confirm;
    setSubmitting(true);
    setError(null);
    try {
      if (kind === "reset-password") {
        const res = await withStepUp(() => post<{ tempPassword: string }>(`/admins/${admin.id}/reset-password`));
        onDone({ username: admin.username, password: res.tempPassword });
      } else {
        await withStepUp(() =>
          kind === "reset-2fa"
            ? post(`/admins/${admin.id}/reset-2fa`)
            : patch(`/admins/${admin.id}`, { isActive: kind === "activate" }),
        );
        onDone(null);
      }
    } catch (err) {
      if (!isCancelled(err)) setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={!!confirm}
      onClose={() => {
        setError(null);
        onClose();
      }}
      title={text?.title ?? ""}
    >
      {confirm && text && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">{confirm.admin.displayName}</span> (@{confirm.admin.username}): {text.body}
          </p>
          <FormError message={error} />
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm hover:bg-zinc-50">
              ยกเลิก
            </button>
            <button
              onClick={run}
              disabled={submitting}
              className={clsx(buttonClass, "flex-1", text.danger && "bg-red-600 hover:bg-red-700")}
            >
              {submitting ? "กำลังดำเนินการ…" : text.action}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

const ACTION_LABELS: Record<string, string> = {
  "login.success": "เข้าสู่ระบบ",
  "login.failed": "เข้าสู่ระบบไม่สำเร็จ",
  "login.blocked": "ถูกล็อกเพราะลองผิดหลายครั้ง",
  logout: "ออกจากระบบ",
  "password.changed": "เปลี่ยนรหัสผ่าน",
  "2fa.enabled": "เปิดใช้ 2FA",
  "2fa.recovery_code_used": "ใช้ recovery code",
  step_up: "ยืนยันตัวตนซ้ำ",
  "admin.created": "สร้างบัญชี",
  "admin.deactivated": "ปิดใช้งานบัญชี",
  "admin.activated": "เปิดใช้งานบัญชี",
  "admin.password_reset": "รีเซ็ตรหัสผ่าน",
  "admin.2fa_reset": "รีเซ็ต 2FA",
};

function AuditList({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return <p className="py-10 text-center text-sm text-muted">ยังไม่มีประวัติ</p>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-3">
          <span className={clsx("font-medium", e.action.startsWith("login.f") || e.action === "login.blocked" ? "text-red-600" : "")}>
            {ACTION_LABELS[e.action] ?? e.action}
          </span>
          <span className="text-muted">
            {e.actor ? `โดย @${e.actor}` : ""}
            {e.target && e.target !== e.actor ? ` → @${e.target}` : ""}
          </span>
          <span className="ml-auto text-xs text-muted" suppressHydrationWarning>
            {formatFullDate(e.createdAt)} {formatTime(e.createdAt)}
            {e.ip ? ` · ${e.ip}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
