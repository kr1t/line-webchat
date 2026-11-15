"use client";

import { useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { ArrowRightLeft, CheckCircle2, Hand } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { buttonClass, FormError } from "@/components/auth/auth-card";
import { fetcher, post } from "@/lib/fetcher";
import type { AdminProfile, ConversationDetail, TeamMember } from "@/lib/types";

const actionClass =
  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted ring-1 ring-border hover:bg-zinc-50 hover:text-foreground disabled:opacity-50";

interface StatusActionsProps {
  conversation: ConversationDetail;
  me: AdminProfile;
  onChanged: () => void;
}

export function StatusActions({ conversation: c, me, onChanged }: StatusActionsProps) {
  const [busy, setBusy] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const mine = c.status === "handling" && c.assignedAdminId === me.id;

  const run = async (path: string, body?: unknown) => {
    setBusy(true);
    try {
      await post(`/conversations/${c.userId}/${path}`, body);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {!mine && (
        <button onClick={() => run("claim")} disabled={busy} className={actionClass} title="รับแชทนี้">
          <Hand className="size-4" />
          <span className="max-sm:hidden">{c.status === "handling" ? "รับแทน" : "รับแชท"}</span>
        </button>
      )}
      {c.status !== "closed" && (
        <button onClick={() => setTransferring(true)} disabled={busy} className={actionClass} title="โอนแชท">
          <ArrowRightLeft className="size-4" />
          <span className="max-sm:hidden">โอน</span>
        </button>
      )}
      {c.status !== "closed" && (
        <button onClick={() => run("close")} disabled={busy} className={actionClass} title="ปิดแชท">
          <CheckCircle2 className="size-4" />
          <span className="max-sm:hidden">ปิดแชท</span>
        </button>
      )}
      <TransferDialog
        open={transferring}
        currentId={c.assignedAdminId}
        onClose={() => setTransferring(false)}
        onPick={async (adminId) => {
          await run("transfer", { adminId });
          setTransferring(false);
        }}
      />
    </div>
  );
}

function TransferDialog({
  open,
  currentId,
  onClose,
  onPick,
}: {
  open: boolean;
  currentId: string | null;
  onClose: () => void;
  onPick: (adminId: string) => Promise<void>;
}) {
  const { data: team } = useSWR<TeamMember[]>(open ? "/team" : null, fetcher);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await onPick(selected);
      setSelected(null);
    } catch {
      setError("โอนแชทไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="โอนแชทให้">
      <div className="space-y-4">
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {(team ?? []).map((member) => (
            <li key={member.id}>
              <button
                onClick={() => setSelected(member.id)}
                disabled={member.id === currentId}
                className={clsx(
                  "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm",
                  selected === member.id ? "bg-foreground text-white" : "hover:bg-zinc-100",
                  member.id === currentId && "opacity-50",
                )}
              >
                {member.displayName}
                {member.id === currentId && <span className="text-xs">กำลังดูแลอยู่</span>}
              </button>
            </li>
          ))}
          {!team && <li className="py-4 text-center text-sm text-muted">กำลังโหลด…</li>}
        </ul>
        <FormError message={error} />
        <button onClick={submit} disabled={!selected || submitting} className={buttonClass}>
          {submitting ? "กำลังโอน…" : "โอนแชท"}
        </button>
      </div>
    </Dialog>
  );
}
