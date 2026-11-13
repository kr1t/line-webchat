"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authErrorText, STAGE_PATHS } from "@/lib/auth";
import { post, RequestError } from "@/lib/fetcher";
import type { LoginStage } from "@/lib/types";
import { buttonClass, Field, FormError, inputClass } from "./auth-card";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const { next } = await post<{ next: LoginStage }>("/auth/login", {
        username: String(form.get("username") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      router.push(STAGE_PATHS[next]);
    } catch (err) {
      setError(authErrorText(err instanceof RequestError ? err.code : undefined));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="ชื่อผู้ใช้">
        <input name="username" autoComplete="username" required autoFocus maxLength={32} className={inputClass} />
      </Field>
      <Field label="รหัสผ่าน">
        <input name="password" type="password" autoComplete="current-password" required maxLength={128} className={inputClass} />
      </Field>
      <FormError message={error} />
      <button type="submit" disabled={submitting} className={buttonClass}>
        {submitting ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
