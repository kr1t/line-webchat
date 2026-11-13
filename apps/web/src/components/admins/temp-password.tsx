"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass } from "@/components/auth/auth-card";

/** Shows a temporary password exactly once, with copy. */
export function TempPassword({ username, password, onDone }: { username: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(`ชื่อผู้ใช้: ${username}\nรหัสผ่านชั่วคราว: ${password}`);
    setCopied(true);
  };

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
        ส่งข้อมูลนี้ให้เจ้าของบัญชีทางช่องทางที่ปลอดภัย รหัสจะแสดงครั้งเดียวและหมดอายุใน 24 ชั่วโมง เมื่อเข้าสู่ระบบครั้งแรกระบบจะให้ตั้งรหัสผ่านใหม่และตั้งค่า 2FA
      </p>
      <dl className="space-y-2 rounded-xl border border-border p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">ชื่อผู้ใช้</dt>
          <dd className="font-mono">{username}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">รหัสผ่านชั่วคราว</dt>
          <dd className="font-mono">{password}</dd>
        </div>
      </dl>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm hover:bg-zinc-50">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
        <button type="button" onClick={onDone} className={`${buttonClass} flex-1`}>
          เสร็จแล้ว
        </button>
      </div>
    </div>
  );
}
