"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authErrorText, STAGE_PATHS } from "@/lib/auth";
import { post, RequestError } from "@/lib/fetcher";
import type { LoginStage } from "@/lib/types";
import { buttonClass, Field, FormError, inputClass } from "./auth-card";

const MIN_LENGTH = 12;

export function ChangePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_LENGTH || password !== confirm) return;
    setSubmitting(true);
    setError(null);
    try {
      const { next } = await post<{ next: LoginStage }>("/auth/password", { newPassword: password });
      router.push(STAGE_PATHS[next]);
    } catch (err) {
      setError(authErrorText(err instanceof RequestError ? err.code : undefined));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="รหัสผ่านใหม่">
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
          maxLength={128}
          className={inputClass}
        />
        <span className={tooShort ? "mt-1 block text-xs text-red-500" : "mt-1 block text-xs text-muted"}>
          อย่างน้อย {MIN_LENGTH} ตัวอักษร
        </span>
      </Field>
      <Field label="ยืนยันรหัสผ่านใหม่">
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          maxLength={128}
          className={inputClass}
        />
        {mismatch && <span className="mt-1 block text-xs text-red-500">รหัสผ่านไม่ตรงกัน</span>}
      </Field>
      <FormError message={error} />
      <button type="submit" disabled={submitting || password.length < MIN_LENGTH || password !== confirm} className={buttonClass}>
        {submitting ? "กำลังบันทึก…" : "ตั้งรหัสผ่าน"}
      </button>
    </form>
  );
}
