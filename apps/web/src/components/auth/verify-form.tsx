"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authErrorText } from "@/lib/auth";
import { post, RequestError } from "@/lib/fetcher";
import { buttonClass, FormError, inputClass } from "./auth-card";
import { CodeInput } from "./code-input";

export function VerifyForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await post("/auth/2fa/verify", { code });
      router.replace("/inbox");
      router.refresh();
    } catch (err) {
      const errorCode = err instanceof RequestError ? err.code : undefined;
      if (errorCode === "login_expired") return router.replace("/login");
      setError(authErrorText(errorCode));
      setCode("");
      setSubmitting(false);
    }
  }

  const switchMode = () => {
    setMode(mode === "totp" ? "recovery" : "totp");
    setCode("");
    setError(null);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "totp" ? (
        <CodeInput value={code} onChange={setCode} />
      ) : (
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="xxxx-xxxx-xxxx"
          autoComplete="off"
          autoFocus
          required
          aria-label="Recovery code"
          className={`${inputClass} text-center font-mono`}
        />
      )}
      <FormError message={error} />
      <button
        type="submit"
        disabled={submitting || (mode === "totp" ? code.length !== 6 : code.trim().length < 14)}
        className={buttonClass}
      >
        {submitting ? "กำลังตรวจสอบ…" : "ยืนยัน"}
      </button>
      <button type="button" onClick={switchMode} className="w-full text-center text-sm text-muted hover:text-foreground">
        {mode === "totp" ? "ใช้ recovery code แทน" : "ใช้รหัสจากแอป Authenticator"}
      </button>
    </form>
  );
}
