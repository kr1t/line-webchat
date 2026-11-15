"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { Check, Copy, Link2 } from "lucide-react";
import { useStepUp } from "@/components/admins/step-up";
import { buttonClass, FormError } from "@/components/auth/auth-card";
import { Dialog } from "@/components/ui/dialog";
import { fetcher, post, RequestError } from "@/lib/fetcher";
import { displayName, formatFullDate, formatTime } from "@/lib/format";

/** Message to paste anywhere (email, other chats) for people outside the OA chat. */
function invitationText(url: string, expiresAt: string, name?: string | null) {
  return [
    `สวัสดีครับ${name ? ` คุณ${name}` : ""}`,
    "ทีมงานเชิญให้คุณแจ้งปัญหาและติดตามงานผ่าน LINE กับน้องติ๊ก (tickget)",
    "",
    "1. กดลิงก์นี้บนมือถือที่มีแอป LINE",
    url,
    "2. เพิ่มเพื่อน LINE OA ถ้าระบบถาม",
    "3. เมนูแจ้งปัญหาจะขึ้นในห้องแชท",
    "",
    name
      ? `ลิงก์ใช้ได้ครั้งเดียวและเฉพาะบัญชี LINE ของคุณ หมดอายุ ${formatFullDate(expiresAt)} ${formatTime(expiresAt)} น.`
      : `ลิงก์ใช้ได้ครั้งเดียว หลังกดลิงก์ทีมงานจะอนุมัติให้ หมดอายุ ${formatFullDate(expiresAt)} ${formatTime(expiresAt)} น.`,
  ].join("\n");
}
import type { RoleInvite } from "@/lib/types";

const STATUS: Record<RoleInvite["status"], { label: string; className: string }> = {
  unused: { label: "ยังไม่ถูกใช้", className: "bg-sky-50 text-sky-700" },
  pending_approval: { label: "รออนุมัติ", className: "bg-amber-50 text-amber-800" },
  granted: { label: "ได้สิทธิ์แล้ว", className: "bg-emerald-50 text-emerald-700" },
  expired: { label: "หมดอายุ", className: "bg-zinc-100 text-muted" },
  revoked: { label: "ยกเลิกแล้ว", className: "bg-zinc-100 text-muted" },
};

const isCancelled = (err: unknown) => err instanceof RequestError && err.code === "step_up_cancelled";

export function InvitesSection() {
  const { data: invites = [], mutate } = useSWR<RoleInvite[]>("/role-invites", fetcher, { refreshInterval: 15_000 });
  const withStepUp = useStepUp();
  const [creating, setCreating] = useState(false);

  const approve = async (id: string) => {
    try {
      await withStepUp(() => post(`/role-invites/${id}/approve`));
    } catch (err) {
      if (!isCancelled(err)) window.alert("อนุมัติไม่สำเร็จ");
    }
    void mutate();
  };
  const revoke = async (id: string) => {
    if (!window.confirm("ยกเลิกลิงก์นี้? คนที่ได้ลิงก์ไปจะใช้ไม่ได้อีก")) return;
    await post(`/role-invites/${id}/revoke`).catch(() => undefined);
    void mutate();
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">ลิงก์เชิญลูกค้า</h2>
          <p className="text-sm text-muted">ลิงก์ใช้ได้ครั้งเดียว มีวันหมดอายุ ยกเลิกได้ ถ้าไม่ระบุคนรับ ต้องอนุมัติหลังลูกค้าเปิดลิงก์</p>
        </div>
        <button onClick={() => setCreating(true)} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-sm font-medium text-white">
          <Link2 className="size-4" /> สร้างลิงก์
        </button>
      </div>
      {invites.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">ยังไม่มีลิงก์เชิญ</p>
      ) : (
        <ul className="divide-y divide-border">
          {invites.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", STATUS[inv.status].className)}>{STATUS[inv.status].label}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {inv.targetUserId ? `สำหรับ ${displayName(inv.targetName)}` : "ใครเปิดก็ได้ (ต้องอนุมัติ)"}
                  {inv.usedByUserId && <span className="text-muted"> · ใช้โดย {displayName(inv.usedByName)}</span>}
                </p>
                <p className="text-xs text-muted" suppressHydrationWarning>
                  สร้างโดย {inv.createdByName ?? "-"} · หมดอายุ {formatFullDate(inv.expiresAt)} {formatTime(inv.expiresAt)}
                </p>
              </div>
              {inv.status === "pending_approval" && (
                <button onClick={() => approve(inv.id)} className="rounded-lg bg-foreground px-2.5 py-1 text-xs font-medium text-white">
                  อนุมัติ
                </button>
              )}
              {(inv.status === "unused" || inv.status === "pending_approval") && (
                <button onClick={() => revoke(inv.id)} className="rounded-lg px-2.5 py-1 text-xs text-red-600 ring-1 ring-red-200 hover:bg-red-50">
                  ยกเลิก
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <CreateInviteDialog open={creating} onClose={() => setCreating(false)} onCreated={() => void mutate()} />
    </section>
  );
}

/** Also used from the chat side panel, where the invite is locked to that customer. */
export function CreateInviteDialog({
  open,
  onClose,
  onCreated,
  target,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  target?: { userId: string; name: string | null };
}) {
  const withStepUp = useStepUp();
  const [hours, setHours] = useState(24);
  const [requireApproval, setRequireApproval] = useState(false);
  const [sendToChat, setSendToChat] = useState(true);
  const [created, setCreated] = useState<{ url: string; expiresAt: string; sentToChat: boolean } | null>(null);
  const [copied, setCopied] = useState<"link" | "text" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    setCreated(null);
    setCopied(null);
    setError(null);
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await withStepUp(() =>
        post<{ url: string; expiresAt: string; sentToChat: boolean }>("/role-invites", {
          targetUserId: target?.userId ?? null,
          expiresInHours: hours,
          requireApproval: target ? requireApproval : true,
          sendToChat: !!target && sendToChat,
        }),
      );
      setCreated(result);
      onCreated?.();
    } catch (err) {
      if (!isCancelled(err)) setError("สร้างลิงก์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title={target ? `ลิงก์เชิญสำหรับ ${displayName(target.name)}` : "สร้างลิงก์เชิญ"}>
      {created ? (
        <div className="space-y-3 text-sm">
          {target && sendToChat && (
            <p className={clsx("rounded-xl px-3 py-2", created.sentToChat ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>
              {created.sentToChat
                ? `ส่งการ์ดเชิญเข้าแชท LINE ของ ${displayName(target.name)} แล้ว`
                : "ส่งการ์ดเข้าแชทไม่สำเร็จ (ลูกค้าบล็อก OA หรือโควตาหมด) ส่งข้อความด้านล่างแทนได้"}
            </p>
          )}
          <p className="text-muted">ลิงก์แสดงแค่ครั้งนี้ ระบบไม่ได้เก็บไว้ คัดลอกไปส่งได้เลย</p>
          <textarea
            readOnly
            value={invitationText(created.url, created.expiresAt, target ? (target.name ?? "ลูกค้า") : null)}
            rows={9}
            className="w-full resize-none rounded-xl bg-zinc-100 p-3 text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            {(["text", "link"] as const).map((kind) => (
              <button
                key={kind}
                onClick={async () => {
                  await navigator.clipboard.writeText(kind === "link" ? created.url : invitationText(created.url, created.expiresAt, target ? (target.name ?? "ลูกค้า") : null));
                  setCopied(kind);
                }}
                className={clsx(kind === "text" ? buttonClass : "rounded-xl px-3 py-2 font-medium ring-1 ring-border hover:bg-zinc-50")}
              >
                {copied === kind ? (
                  <>
                    <Check className="mr-1 inline size-4" /> คัดลอกแล้ว
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 inline size-4" /> {kind === "text" ? "คัดลอกข้อความเชิญ" : "คัดลอกแค่ลิงก์"}
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 text-sm">
          {!target && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ลิงก์ที่ไม่ได้ระบุคนรับ ใครได้ไปก็เปิดได้ จึงต้องมีแอดมินกดอนุมัติหลังลูกค้าเปิดลิงก์ทุกครั้ง
            </p>
          )}
          <label className="block">
            <span className="mb-1 block font-medium">หมดอายุใน</span>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full rounded-xl border border-border bg-surface px-3 py-2">
              <option value={1}>1 ชั่วโมง</option>
              <option value={24}>24 ชั่วโมง</option>
              <option value={72}>3 วัน</option>
              <option value={168}>7 วัน</option>
            </select>
          </label>
          {target && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sendToChat} onChange={(e) => setSendToChat(e.target.checked)} className="size-4 accent-foreground" />
              ส่งการ์ดเชิญเข้าแชท LINE ของลูกค้าด้วย (นับโควตา push)
            </label>
          )}
          {target && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} className="size-4 accent-foreground" />
              ต้องอนุมัติอีกครั้งหลังลูกค้าเปิดลิงก์
            </label>
          )}
          <FormError message={error} />
          <button type="submit" disabled={saving} className={buttonClass}>
            {saving ? "กำลังสร้าง…" : "สร้างลิงก์"}
          </button>
        </form>
      )}
    </Dialog>
  );
}
