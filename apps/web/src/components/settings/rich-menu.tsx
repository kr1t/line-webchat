"use client";

import { useState } from "react";
import useSWR from "swr";
import { useStepUp } from "@/components/admins/step-up";
import { fetcher, post, RequestError } from "@/lib/fetcher";

interface RichMenuStatus {
  id: string | null;
  source: "env" | "auto" | null;
}

/** Shows whether the customer menu exists and lets a super admin re-create it and re-link every customer. */
export function RichMenuSection({ canEdit }: { canEdit: boolean }) {
  const { data, mutate } = useSWR<RichMenuStatus>("/settings/rich-menu", fetcher);
  const withStepUp = useStepUp();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const rebuild = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = await withStepUp(() => post<RichMenuStatus & { linked: number }>("/settings/rich-menu/rebuild"));
      setNote(`พร้อมใช้ ผูกให้ลูกค้า ${result.linked} คนแล้ว`);
      void mutate();
    } catch (err) {
      if (!(err instanceof RequestError && err.code === "step_up_cancelled")) setNote("ทำไม่สำเร็จ ตรวจ Channel access token ของ LINE");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Rich menu ลูกค้า</h2>
          <p className="text-sm text-muted">
            เมนู แจ้งปัญหา / ติดตามสถานะ / คุยกับทีม ขึ้นเฉพาะคนที่มีสิทธิ์ลูกค้า ระบบสร้างให้เองตอนให้สิทธิ์ครั้งแรก
          </p>
          <p className="mt-2 text-sm">
            {!data ? (
              "กำลังตรวจ…"
            ) : data.id ? (
              <>
                <span className="font-medium text-emerald-700">พร้อมใช้</span>{" "}
                <span className="font-mono text-xs text-muted">
                  {data.id} {data.source === "env" ? "(จาก CUSTOMER_RICH_MENU_ID)" : ""}
                </span>
              </>
            ) : (
              <span className="text-muted">ยังไม่ได้สร้าง จะสร้างเองเมื่อให้สิทธิ์ลูกค้าคนแรก</span>
            )}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={rebuild}
            disabled={busy}
            className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium ring-1 ring-border hover:bg-zinc-50 disabled:opacity-50"
          >
            {busy ? "กำลังทำ…" : data?.source === "env" ? "ผูกเมนูให้ลูกค้าทุกคน" : "สร้างใหม่และผูกให้ทุกคน"}
          </button>
        )}
      </div>
      {note && <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm">{note}</p>}
    </section>
  );
}
