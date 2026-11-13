"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, Copy, Download } from "lucide-react";
import { authErrorText } from "@/lib/auth";
import { post, RequestError } from "@/lib/fetcher";
import { buttonClass, FormError } from "./auth-card";
import { CodeInput } from "./code-input";

interface Enrolment {
  qrDataUrl: string;
  secret: string;
}

export function SetupTotp({ username }: { username: string }) {
  const router = useRouter();
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const started = useRef(false);

  // Each call issues a new secret, so request it only once (effects run twice in dev)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    post<Enrolment>("/auth/2fa/setup")
      .then(setEnrolment)
      .catch((err) => setError(authErrorText(err instanceof RequestError ? err.code : undefined)));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await post<{ recoveryCodes: string[] }>("/auth/2fa/enable", { code });
      setRecoveryCodes(result.recoveryCodes);
    } catch (err) {
      setError(authErrorText(err instanceof RequestError ? err.code : undefined));
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  if (recoveryCodes) {
    return (
      <RecoveryCodes
        codes={recoveryCodes}
        username={username}
        onDone={() => {
          router.replace("/inbox");
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <ol className="space-y-1 text-sm text-muted">
        <li>1. เปิดแอป Google Authenticator, Microsoft Authenticator หรือ 1Password</li>
        <li>2. สแกน QR code ด้านล่าง</li>
        <li>3. กรอกรหัส 6 หลักที่แอปแสดง</li>
      </ol>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-5">
        {enrolment ? (
          <Image src={enrolment.qrDataUrl} alt="QR code สำหรับตั้งค่า 2FA" width={200} height={200} unoptimized />
        ) : (
          <div className="size-[200px] animate-pulse rounded-lg bg-zinc-100" />
        )}
        {enrolment && (
          <details className="w-full text-center text-xs text-muted">
            <summary className="cursor-pointer">สแกนไม่ได้? กรอก key เอง</summary>
            <code className="mt-2 block break-all rounded-lg bg-zinc-100 px-2 py-1.5 font-mono text-foreground">
              {enrolment.secret}
            </code>
          </details>
        )}
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <CodeInput value={code} onChange={setCode} />
        <FormError message={error} />
        <button type="submit" disabled={!enrolment || submitting || code.length !== 6} className={buttonClass}>
          {submitting ? "กำลังตรวจสอบ…" : "เปิดใช้ 2FA"}
        </button>
      </form>
    </div>
  );
}

function RecoveryCodes({ codes, username, onDone }: { codes: string[]; username: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  const download = () => {
    const blob = new Blob([`LineChatbot recovery codes (${username})\n\n${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: "linechatbot-recovery-codes.txt" });
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
        เก็บรหัสชุดนี้ไว้ในที่ปลอดภัย ใช้เข้าสู่ระบบแทนแอปได้ถ้าโทรศัพท์หาย แต่ละรหัสใช้ได้ครั้งเดียว และจะไม่แสดงอีก
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code} className="text-center">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-sm hover:bg-zinc-50">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
        <button type="button" onClick={download} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-sm hover:bg-zinc-50">
          <Download className="size-4" />
          ดาวน์โหลด
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4 accent-accent" />
        ฉันเก็บ recovery codes ไว้แล้ว
      </label>
      <button type="button" onClick={onDone} disabled={!saved} className={buttonClass}>
        เข้าสู่ระบบ
      </button>
    </div>
  );
}
