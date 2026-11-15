"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { buttonClass, FormError, inputClass } from "@/components/auth/auth-card";
import { StepUpProvider } from "@/components/admins/step-up";
import { Dialog } from "@/components/ui/dialog";
import { InvitesSection } from "./invites";
import { del, fetcher, patch, post, put, RequestError } from "@/lib/fetcher";
import type { AdminProfile, BusinessHours, CannedResponse } from "@/lib/types";

const DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const timeClass = "rounded-lg border border-border bg-surface px-2 py-1 text-sm tabular-nums disabled:opacity-40";

export function SettingsView({
  me,
  initialHours,
  initialCanned,
}: {
  me: AdminProfile;
  initialHours: BusinessHours;
  initialCanned: CannedResponse[];
}) {
  return (
    <StepUpProvider>
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 md:px-8 md:py-8">
        <header>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted">เวลาทำการ ลิงก์เชิญลูกค้า และข้อความที่ทีมใช้บ่อย</p>
        </header>
        <BusinessHoursForm initial={initialHours} canEdit={me.role === "SUPER_ADMIN"} />
        <InvitesSection />
        <CannedList initial={initialCanned} />
      </div>
    </StepUpProvider>
  );
}

function BusinessHoursForm({ initial, canEdit }: { initial: BusinessHours; canEdit: boolean }) {
  const [hours, setHours] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const setDay = (i: number, value: BusinessHours["days"][number]) =>
    setHours((h) => ({ ...h, days: h.days.map((d, j) => (j === i ? value : d)) }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      setHours(await put<BusinessHours>("/settings/business-hours", hours));
      setNotice({ ok: true, text: "บันทึกแล้ว" });
    } catch {
      setNotice({ ok: false, text: "บันทึกไม่สำเร็จ ตรวจเวลาเปิดให้มาก่อนเวลาปิด" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">เวลาทำการ</h2>
          <p className="text-sm text-muted">นอกเวลานี้ ลูกค้าที่ทักมาจะได้ข้อความตอบอัตโนมัติ (ไม่เกินชั่วโมงละครั้งต่อคน) เวลาไทย</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hours.enabled}
            disabled={!canEdit}
            onChange={(e) => setHours({ ...hours, enabled: e.target.checked })}
            className="size-4 accent-foreground"
          />
          เปิดใช้
        </label>
      </div>

      <fieldset disabled={!canEdit || !hours.enabled} className="space-y-2 disabled:opacity-60">
        {DAYS.map((name, i) => {
          const day = hours.days[i];
          return (
            <div key={name} className="flex items-center gap-3 text-sm">
              <label className="flex w-28 items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!day}
                  onChange={(e) => setDay(i, e.target.checked ? { open: "09:00", close: "18:00" } : null)}
                  className="size-4 accent-foreground"
                />
                {name}
              </label>
              {day ? (
                <>
                  <input type="time" value={day.open} onChange={(e) => setDay(i, { ...day, open: e.target.value })} className={timeClass} />
                  <span className="text-muted">–</span>
                  <input type="time" value={day.close} onChange={(e) => setDay(i, { ...day, close: e.target.value })} className={timeClass} />
                </>
              ) : (
                <span className="text-muted">ปิด</span>
              )}
            </div>
          );
        })}
        <label className="block pt-2 text-sm">
          <span className="mb-1 block font-medium">ข้อความตอบนอกเวลา</span>
          <textarea
            value={hours.message}
            onChange={(e) => setHours({ ...hours, message: e.target.value })}
            rows={2}
            maxLength={500}
            className={clsx(inputClass, "resize-y")}
          />
          <span className="mt-1 block text-xs text-muted">{"{next}"} จะถูกแทนด้วยเวลาที่ทีมกลับมา เช่น &quot;วันจันทร์ 09:00 น.&quot;</span>
        </label>
      </fieldset>

      <div className="mt-4 flex items-center gap-3">
        {canEdit ? (
          <button type="submit" disabled={saving} className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        ) : (
          <p className="text-xs text-muted">เฉพาะ Super admin ที่แก้เวลาทำการได้</p>
        )}
        {notice && <span className={clsx("text-sm", notice.ok ? "text-emerald-700" : "text-red-600")}>{notice.text}</span>}
      </div>
    </form>
  );
}

type Draft = { id?: string; shortcut: string; title: string; body: string };

function CannedList({ initial }: { initial: CannedResponse[] }) {
  const { data: items = initial, mutate } = useSWR<CannedResponse[]>("/canned-responses", fetcher, { fallbackData: initial });
  const [draft, setDraft] = useState<Draft | null>(null);

  const remove = async (item: CannedResponse) => {
    if (!window.confirm(`ลบ "${item.title}"?`)) return;
    await del(`/canned-responses/${item.id}`);
    void mutate();
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">ข้อความสำเร็จรูป</h2>
          <p className="text-sm text-muted">
            พิมพ์ <span className="font-mono">/ชื่อย่อ</span> ในช่องแชท หรือกด ⚡ · ใช้ {"{name}"} {"{ticket}"} {"{agent}"} ได้
          </p>
        </div>
        <button
          onClick={() => setDraft({ shortcut: "", title: "", body: "" })}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="size-4" /> เพิ่ม
        </button>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">ยังไม่มีข้อความสำเร็จรูป</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {item.title} <span className="font-mono text-xs text-muted">/{item.shortcut}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{item.body}</p>
              </div>
              <span className="shrink-0 text-xs text-muted">ใช้ {item.useCount} ครั้ง</span>
              <button onClick={() => setDraft(item)} className="rounded-lg p-1.5 text-muted hover:bg-zinc-100" aria-label="แก้ไข">
                <Pencil className="size-4" />
              </button>
              <button onClick={() => remove(item)} className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-600" aria-label="ลบ">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <CannedDialog
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          void mutate();
        }}
      />
    </section>
  );
}

function CannedDialog({ draft, onClose, onSaved }: { draft: Draft | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Draft>({ shortcut: "", title: "", body: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastDraft, setLastDraft] = useState<Draft | null>(null);
  if (draft !== lastDraft) {
    setLastDraft(draft);
    if (draft) setForm({ shortcut: draft.shortcut, title: draft.title, body: draft.body, id: draft.id });
    setError(null);
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body = { shortcut: form.shortcut, title: form.title, body: form.body };
    try {
      if (form.id) await patch(`/canned-responses/${form.id}`, body);
      else await post("/canned-responses", body);
      onSaved();
    } catch (err) {
      setError(err instanceof RequestError && err.code === "shortcut_taken" ? "ชื่อย่อนี้มีอยู่แล้ว" : "บันทึกไม่สำเร็จ ชื่อย่อใช้ได้แค่ตัวอักษร ตัวเลข - และ _");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={draft !== null} onClose={onClose} title={form.id ? "แก้ไขข้อความ" : "เพิ่มข้อความสำเร็จรูป"}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">ชื่อ</span>
          <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={80} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">ชื่อย่อ (พิมพ์ /ชื่อย่อ)</span>
          <input
            className={inputClass}
            value={form.shortcut}
            onChange={(e) => setForm({ ...form, shortcut: e.target.value.replace(/\s/g, "") })}
            required
            maxLength={30}
            placeholder="thanks"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">ข้อความ</span>
          <textarea
            className={clsx(inputClass, "resize-y")}
            rows={4}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            required
            maxLength={2000}
            placeholder="สวัสดีครับคุณ{name} รับเรื่อง {ticket} แล้วครับ"
          />
        </label>
        <FormError message={error} />
        <button type="submit" disabled={saving} className={buttonClass}>
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </form>
    </Dialog>
  );
}
