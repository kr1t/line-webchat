"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import clsx from "clsx";
import { CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { formatFullDate, formatTime } from "@/lib/format";
import { ImagePicker, MAX_IMAGES, uploadImage } from "./image-picker";
import { LiffCard, primaryButton, secondaryButton } from "./brand";
import { CUSTOMER_STATUS, levelOf, type LiffTicketDetail } from "./liff-data";
import { liffFetch } from "./liff-provider";

export function LiffTicket({ id }: { id: string }) {
  const params = useSearchParams();
  const key = `/tickets/${id}`;
  const { data: t, error, mutate } = useSWR<LiffTicketDetail>(key, liffFetch, { refreshInterval: 10_000 });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [picked, setPicked] = useState<File[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  if (error) return <p className="py-16 text-center text-sm text-zinc-600">ไม่พบเรื่องนี้</p>;
  if (!t) return <div className="mt-4 h-40 animate-pulse rounded-3xl bg-white/70" />;
  const level = levelOf(t.severity);

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    try {
      await mutate(await liffFetch<LiffTicketDetail>(`${key}${path}`, { method: "POST", body }), { revalidate: false });
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };

  const uploadPicked = async () => {
    let failed = 0;
    for (const [i, file] of picked.entries()) {
      setUploading(`กำลังส่งรูป ${i + 1}/${picked.length}`);
      await uploadImage(id, file).catch(() => failed++);
    }
    setUploading(failed ? `ส่งไม่สำเร็จ ${failed} รูป (รูปละไม่เกิน 5 MB, ไม่เกิน ${MAX_IMAGES} รูป)` : null);
    setPicked([]);
    void mutate();
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() && (await act("/messages", { body: text.trim() }))) setText("");
  };

  return (
    <div className="space-y-4 pt-2">
      {params.get("created") && (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="size-4" /> รับเรื่องแล้ว {t.expectedResponse}
        </p>
      )}
      {params.get("failed") && (
        <p className="rounded-2xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          ส่งรูปไม่สำเร็จ {params.get("failed")} รูป เพิ่มใหม่ได้ด้านล่าง
        </p>
      )}

      <LiffCard>
        <div className="flex items-center gap-2">
          <span className="rounded-lg px-2 py-0.5 text-xs font-extrabold text-white" style={{ background: level.color }}>
            {t.severity} {level.label}
          </span>
          <span className="font-mono text-xs text-zinc-500">{t.code}</span>
        </div>
        <h1 className="mt-2 text-lg font-extrabold">{t.title}</h1>
        <p className="mt-1 inline-block rounded-full bg-[#FBF8F1] px-2.5 py-0.5 text-sm font-semibold">{CUSTOMER_STATUS[t.status]}</p>
      </LiffCard>

      {t.status === "resolved" && (
        <LiffCard className="space-y-2">
          <p className="font-bold">ทีมแก้ไขแล้ว ปัญหาหายหรือยังครับ?</p>
          <button disabled={busy} onClick={() => act("/confirm-resolved")} className={primaryButton}>
            หายแล้ว ปิดเรื่องได้เลย
          </button>
          <button disabled={busy} onClick={() => act("/reopen")} className={secondaryButton}>
            ยังไม่หาย
          </button>
        </LiffCard>
      )}

      {t.status === "closed" && t.rating === null && (
        <LiffCard className="space-y-3">
          <p className="font-bold">พอใจกับการแก้ปัญหาไหมครับ?</p>
          <div className="flex justify-between">
            {["😞", "🙁", "😐", "🙂", "😄"].map((face, i) => (
              <button
                key={face}
                onClick={() => setRating(i + 1)}
                aria-label={`${i + 1} คะแนน`}
                className={clsx("rounded-2xl p-2 text-3xl", rating === i + 1 ? "bg-[#FBF8F1] ring-2 ring-[#F2483A]" : "opacity-70")}
              >
                {face}
              </button>
            ))}
          </div>
          {rating !== null && rating <= 2 && (
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="บอกเราได้ไหมว่าตรงไหนควรปรับ (ไม่บังคับ)"
              maxLength={1000}
              className="w-full rounded-2xl border-2 border-[#1A1A1A] px-3 py-2 text-sm"
            />
          )}
          <button
            disabled={busy || rating === null}
            onClick={() => act("/rate", { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) })}
            className={primaryButton}
          >
            ส่งคะแนน
          </button>
        </LiffCard>
      )}
      {t.rating !== null && <p className="text-center text-sm text-zinc-600">ขอบคุณสำหรับคะแนน {t.rating}/5 ครับ 🙏</p>}

      {t.attachments.length > 0 && (
        <section className="grid grid-cols-3 gap-2">
          {t.attachments.map((a, i) => (
            <a
              key={a.id}
              href={`/api/liff/tickets/${t.id}/attachments/${a.id}`}
              target="_blank"
              rel="noreferrer"
              className="relative aspect-square overflow-hidden rounded-2xl border-2 border-[#1A1A1A] bg-white"
            >
              <Image src={`/api/liff/tickets/${t.id}/attachments/${a.id}`} alt={`รูปที่ ${i + 1}`} fill sizes="33vw" className="object-cover" unoptimized />
            </a>
          ))}
        </section>
      )}

      <section className="space-y-3">
        {t.messages.map((m) => {
          const mine = m.from === "customer";
          return (
            <div key={m.id} className={clsx("flex flex-col", mine ? "items-end" : "items-start")}>
              <div
                className={clsx(
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-[15px]",
                  mine ? "rounded-br-lg bg-[#1A1A1A] text-white" : "rounded-bl-lg border-2 border-[#1A1A1A] bg-white",
                )}
              >
                {m.body}
              </div>
              <span className="mt-1 px-2 text-[11px] text-zinc-500" suppressHydrationWarning>
                {mine ? "คุณ" : m.authorName} · {formatFullDate(m.createdAt)} {formatTime(m.createdAt)}
              </span>
            </div>
          );
        })}
      </section>

      {t.status !== "closed" && t.attachments.length < MAX_IMAGES && (
        <LiffCard className="space-y-3">
          <p className="text-sm font-semibold">แนบรูปเพิ่ม</p>
          <ImagePicker files={picked} onChange={setPicked} max={MAX_IMAGES - t.attachments.length} />
          {picked.length > 0 && (
            <button disabled={!!uploading} onClick={uploadPicked} className={primaryButton}>
              {uploading ?? `ส่ง ${picked.length} รูป`}
            </button>
          )}
          {uploading && picked.length === 0 && <p className="text-sm text-amber-700">{uploading}</p>}
        </LiffCard>
      )}

      {t.status !== "closed" && (
        <form onSubmit={send} className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={5000}
            placeholder="เพิ่มข้อมูลให้ทีม"
            className="min-w-0 flex-1 resize-none rounded-2xl border-2 border-[#1A1A1A] bg-white px-3 py-2 text-[15px] outline-none focus:border-[#F2483A]"
          />
          <button disabled={busy || !text.trim()} className="rounded-2xl bg-[#F2483A] px-4 py-3 text-sm font-bold text-white disabled:opacity-40">
            ส่ง
          </button>
        </form>
      )}
    </div>
  );
}
