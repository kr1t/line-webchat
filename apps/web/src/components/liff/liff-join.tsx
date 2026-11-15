"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLiff, liffFetch } from "./liff-provider";
import { LiffCard, primaryButton } from "./brand";
import { Mascot } from "./mascot";

type Result = "granted" | "pending" | "already" | "invalid" | "expired" | "used" | "revoked" | "wrong_user" | "blocked";

const MESSAGES: Record<Result, { title: string; body: string; ok: boolean }> = {
  granted: { title: "เปิดสิทธิ์เรียบร้อย 🎉", body: "แจ้งปัญหาได้จากเมนูในห้องแชท หรือจากหน้านี้ได้เลย", ok: true },
  already: { title: "บัญชีนี้มีสิทธิ์อยู่แล้ว", body: "แจ้งปัญหาได้ตามปกติครับ", ok: true },
  pending: { title: "ได้รับคำขอแล้ว", body: "รอทีมงานอนุมัติสักครู่ แล้วเมนูแจ้งปัญหาจะขึ้นในห้องแชท", ok: true },
  used: { title: "ลิงก์นี้ถูกใช้ไปแล้ว", body: "ลิงก์เชิญใช้ได้ครั้งเดียว ขอลิงก์ใหม่จากทีมงานได้ครับ", ok: false },
  expired: { title: "ลิงก์หมดอายุแล้ว", body: "ขอลิงก์ใหม่จากทีมงานได้ครับ", ok: false },
  revoked: { title: "ลิงก์นี้ถูกยกเลิกแล้ว", body: "ขอลิงก์ใหม่จากทีมงานได้ครับ", ok: false },
  wrong_user: { title: "ลิงก์นี้ทำไว้ให้บัญชีอื่น", body: "เปิดด้วยบัญชี LINE ที่ทีมงานส่งลิงก์ให้นะครับ", ok: false },
  invalid: { title: "ลิงก์ไม่ถูกต้อง", body: "ตรวจว่าคัดลอกลิงก์มาครบ หรือขอลิงก์ใหม่จากทีมงาน", ok: false },
  blocked: { title: "ลองหลายครั้งเกินไป", body: "รอ 15 นาทีแล้วลองใหม่อีกครั้ง", ok: false },
};

const OA_URL = process.env.NEXT_PUBLIC_LINE_OA_URL;

export function LiffJoin() {
  const { liff, refresh } = useLiff();
  const [result, setResult] = useState<Result | null>(null);
  const [notFriend, setNotFriend] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get("invite");
    // Drop the token from the address bar and history right away
    window.history.replaceState(null, "", "/liff/join");
    const request = token
      ? liffFetch<{ result: Result }>("/invites/redeem", { method: "POST", body: { token } })
      : Promise.resolve({ result: "invalid" as Result });
    request
      .then(({ result: r }) => {
        setResult(r);
        if (r === "granted" || r === "already" || r === "pending") void refresh();
      })
      .catch(() => setResult("invalid"));
  }, [refresh]);

  useEffect(() => {
    if (!liff || !result || !MESSAGES[result].ok) return;
    liff
      .getFriendship()
      .then((f) => setNotFriend(!f.friendFlag))
      .catch(() => undefined);
  }, [liff, result]);

  if (!result) return <p className="py-20 text-center text-sm text-zinc-500">กำลังตรวจลิงก์…</p>;
  const message = MESSAGES[result];

  return (
    <div className="space-y-4 pt-6">
      <LiffCard className="flex flex-col items-center text-center">
        <Mascot mood={message.ok ? (result === "pending" ? "p3" : "greet") : "p2"} size={120} className="mb-3" />
        <p className="text-xl font-extrabold">{message.title}</p>
        <p className="mt-2 text-sm text-zinc-600">{message.body}</p>
      </LiffCard>
      {notFriend && (
        <LiffCard className="text-center">
          <p className="font-bold">เพิ่มเพื่อนกับ OA ก่อนนะครับ</p>
          <p className="mt-1 text-sm text-zinc-600">ไม่อย่างนั้นจะไม่ได้รับแจ้งเตือนเมื่อทีมตอบกลับ</p>
          {OA_URL && (
            <a href={OA_URL} className={`${primaryButton} mt-3`}>
              เพิ่มเพื่อน
            </a>
          )}
        </LiffCard>
      )}
      {(result === "granted" || result === "already") && (
        <Link href="/liff/new" className={primaryButton}>
          แจ้งปัญหาเลย
        </Link>
      )}
    </div>
  );
}
