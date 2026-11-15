import { MessageCircle } from "lucide-react";

export default function InboxPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-zinc-100">
        <MessageCircle className="size-6" strokeWidth={1.75} />
      </span>
      <p className="text-sm">เลือกแชทจากรายการด้านซ้าย</p>
    </div>
  );
}
