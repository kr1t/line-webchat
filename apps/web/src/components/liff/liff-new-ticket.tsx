"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check } from "lucide-react";
import type { Severity, TicketCategory } from "@/lib/types";
import { primaryButton } from "./brand";
import { ImagePicker, uploadImage } from "./image-picker";
import { LEVELS, type LiffTicket } from "./liff-data";
import { liffFetch, useLiff } from "./liff-provider";

const CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: "login", label: "เข้าสู่ระบบ" },
  { value: "payment", label: "ชำระเงิน" },
  { value: "data", label: "ข้อมูล" },
  { value: "ui", label: "หน้าตา" },
  { value: "other", label: "อื่นๆ" },
];

const fieldClass = "w-full rounded-2xl border-2 border-[#1A1A1A] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#F2483A]";

export function LiffNewTicket() {
  const router = useRouter();
  const { me } = useLiff();
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [category, setCategory] = useState<TicketCategory>("other");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (me?.role !== "CUSTOMER") return <p className="py-16 text-center text-sm text-zinc-600">บัญชีนี้ยังแจ้งปัญหาไม่ได้</p>;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!severity) return setError("เลือกระดับความรุนแรงก่อนนะครับ");
    if (severity === "P1" && !window.confirm("ยืนยันว่าเป็นเรื่องวิกฤต? ใช้งานไม่ได้เลย และกระทบเงินหรือข้อมูล")) return;
    setSending(true);
    setError(null);
    try {
      const ticket = await liffFetch<LiffTicket>("/tickets", { method: "POST", body: { severity, category, title, description } });
      let failed = 0;
      for (const [i, file] of images.entries()) {
        setProgress(`กำลังส่งรูป ${i + 1}/${images.length}`);
        // The ticket exists already; a picture that fails can be added again from the ticket page
        await uploadImage(ticket.id, file).catch(() => failed++);
      }
      router.replace(`/liff/tickets/${ticket.id}?created=1${failed ? `&failed=${failed}` : ""}`);
    } catch {
      setError("ส่งไม่สำเร็จ ตรวจว่ากรอกหัวข้ออย่างน้อย 3 ตัวอักษร และรายละเอียดอย่างน้อย 5 ตัวอักษร");
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6 pt-2">
      <section>
        <h1 className="mb-1 text-xl font-extrabold">ปัญหารุนแรงแค่ไหน?</h1>
        <p className="mb-3 text-sm text-zinc-600">เลือกให้ตรงที่สุด ทีมจะตอบตามลำดับความเร่งด่วน</p>
        <div className="space-y-2" role="radiogroup">
          {LEVELS.map((level) => {
            const selected = severity === level.severity;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                key={level.severity}
                onClick={() => setSeverity(level.severity)}
                className={clsx(
                  "flex w-full items-start gap-3 rounded-3xl border-2 bg-white p-3.5 text-left",
                  selected ? "border-[#F2483A] ring-2 ring-[#F2483A]/30" : "border-[#1A1A1A]",
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-xs font-extrabold text-white" style={{ background: level.color }}>
                  {level.severity}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{level.label}</span>
                  <span className="block text-sm">{level.hint}</span>
                  <span className="block text-xs text-zinc-500">{level.examples}</span>
                  <span className="mt-1 block text-xs font-semibold" style={{ color: level.color }}>
                    ตอบภายใน {level.response}
                  </span>
                </span>
                {selected && <Check className="size-5 shrink-0 text-[#F2483A]" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={clsx(
                "rounded-full border-2 border-[#1A1A1A] px-3 py-1 text-sm font-semibold",
                category === c.value ? "bg-[#1A1A1A] text-white" : "bg-white",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="หัวข้อสั้นๆ เช่น กดจ่ายเงินไม่ได้" maxLength={80} required minLength={3} />
        <textarea
          className={clsx(fieldClass, "min-h-32 resize-y")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={"เกิดที่หน้าไหน · ทำอะไรแล้วเป็นอะไร · เกิดตั้งแต่เมื่อไหร่"}
          maxLength={5000}
          required
          minLength={5}
        />
        <div>
          <p className="mb-2 text-sm font-semibold">
            รูปหน้าจอ <span className="font-normal text-zinc-500">(ไม่บังคับ สูงสุด 10 รูป)</span>
          </p>
          <ImagePicker files={images} onChange={setImages} />
        </div>
      </section>

      {error && <p className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={sending} className={primaryButton}>
        {sending ? (progress ?? "กำลังส่ง…") : "ส่งเรื่อง"}
      </button>
    </form>
  );
}
