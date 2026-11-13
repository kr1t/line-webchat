"use client";

import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from "react";
import { authErrorText } from "@/lib/auth";
import { post, RequestError } from "@/lib/fetcher";
import { buttonClass, FormError } from "@/components/auth/auth-card";
import { CodeInput } from "@/components/auth/code-input";
import { Dialog } from "@/components/ui/dialog";

type WithStepUp = <T>(action: () => Promise<T>) => Promise<T>;

const StepUpContext = createContext<WithStepUp | null>(null);

/**
 * Runs an action; if the API asks for a fresh 2FA code (step_up_required),
 * asks for one and retries the action once.
 */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef<{ resolve: () => void; reject: (e: unknown) => void } | null>(null);

  const askForCode = () =>
    new Promise<void>((resolve, reject) => {
      pending.current = { resolve, reject };
      setCode("");
      setError(null);
      setOpen(true);
    });

  const withStepUp = useCallback<WithStepUp>(async (action) => {
    try {
      return await action();
    } catch (err) {
      if (!(err instanceof RequestError && err.code === "step_up_required")) throw err;
      await askForCode();
      return action();
    }
  }, []);

  const cancel = () => {
    setOpen(false);
    pending.current?.reject(new RequestError(403, "step_up_cancelled"));
    pending.current = null;
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await post("/auth/step-up", { code });
      setOpen(false);
      pending.current?.resolve();
      pending.current = null;
    } catch (err) {
      setError(authErrorText(err instanceof RequestError ? err.code : undefined));
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StepUpContext.Provider value={withStepUp}>
      {children}
      <Dialog open={open} onClose={cancel} title="ยืนยันตัวตนอีกครั้ง">
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-muted">กรอกรหัส 6 หลักจากแอป Authenticator เพื่อทำรายการนี้ (มีผล 5 นาที)</p>
          <CodeInput value={code} onChange={setCode} />
          <FormError message={error} />
          <button type="submit" disabled={submitting || code.length !== 6} className={buttonClass}>
            {submitting ? "กำลังตรวจสอบ…" : "ยืนยัน"}
          </button>
        </form>
      </Dialog>
    </StepUpContext.Provider>
  );
}

export function useStepUp(): WithStepUp {
  const ctx = useContext(StepUpContext);
  if (!ctx) throw new Error("useStepUp must be used inside StepUpProvider");
  return ctx;
}
