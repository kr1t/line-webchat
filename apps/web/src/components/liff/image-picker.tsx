"use client";

import { useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { ImagePlus, X } from "lucide-react";
import { RequestError } from "@/lib/fetcher";
import { resizeImage } from "@/lib/resize-image";

export const MAX_IMAGES = 10;

/** Uploads one picture to a ticket (raw JPEG body, already resized). */
export async function uploadImage(ticketId: string, file: File) {
  const body = await resizeImage(file);
  const res = await fetch(`/api/liff/tickets/${ticketId}/attachments`, {
    method: "POST",
    headers: { "content-type": "image/jpeg" },
    body,
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new RequestError(res.status, typeof data?.code === "string" ? data.code : undefined);
  }
}

/** Thumbnails of picked files with remove buttons, plus an "add pictures" tile. */
export function ImagePicker({ files, onChange, max = MAX_IMAGES }: { files: File[]; onChange: (files: File[]) => void; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  // Release the preview URLs when the list changes or the picker goes away
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  return (
    <div className="grid grid-cols-4 gap-2">
      {files.map((file, i) => (
        <div key={`${file.name}-${i}`} className="relative aspect-square overflow-hidden rounded-2xl border-2 border-[#1A1A1A] bg-white">
          <Image src={previews[i]} alt={`รูปที่ ${i + 1}`} fill sizes="25vw" className="object-cover" unoptimized />
          <button
            type="button"
            onClick={() => onChange(files.filter((f) => f !== file))}
            aria-label="เอารูปออก"
            className="absolute right-1 top-1 rounded-full bg-[#1A1A1A]/80 p-0.5 text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {files.length < max && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[#1A1A1A] bg-white/60 text-xs font-semibold"
        >
          <ImagePlus className="size-5" />
          เพิ่มรูป
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
          onChange([...files, ...picked].slice(0, max));
          e.target.value = "";
        }}
      />
    </div>
  );
}
