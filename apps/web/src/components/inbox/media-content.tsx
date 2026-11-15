"use client";

import { useState } from "react";
import Image from "next/image";
import { Download, File, MapPin } from "lucide-react";
import type { ChatMessage } from "@/lib/types";

const formatSize = (bytes: unknown) =>
  typeof bytes === "number" ? (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`) : "";

const NOTES: Record<string, string> = {
  too_large: "ไฟล์ใหญ่เกินจะแสดงบนเว็บ เปิดดูได้ใน LINE Official Account Manager",
  unavailable: "ดึงไฟล์จาก LINE ไม่ได้ (อาจหมดอายุแล้ว)",
};

/**
 * Picture, video, audio, file or location sent by the customer, shown right in the chat.
 * Messages from before media was copied have no state; the API then fetches them from LINE on first view.
 */
export function MediaContent({ message, userId }: { message: ChatMessage; userId: string }) {
  const payload = message.payload ?? {};
  const src = `/api/conversations/${userId}/messages/${message.id}/media`;
  const [failed, setFailed] = useState(false);
  const state = failed ? "unavailable" : typeof payload.media === "string" ? payload.media : null;

  if (message.type === "location") {
    const { latitude, longitude, title, address } = payload as { latitude?: number; longitude?: number; title?: string; address?: string };
    const href =
      typeof latitude === "number" && typeof longitude === "number"
        ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
        : null;
    return (
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
        <div className="min-w-0">
          <p className="break-words font-medium">{title ?? "ตำแหน่ง"}</p>
          {address && <p className="break-words text-sm opacity-80">{address}</p>}
          {href && (
            <a href={href} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-2">
              เปิดแผนที่
            </a>
          )}
        </div>
      </div>
    );
  }

  if (state === "too_large" || state === "unavailable") return <p className="text-sm opacity-80">{NOTES[state]}</p>;

  switch (message.type) {
    case "image":
      return (
        <a href={src} target="_blank" rel="noreferrer" className="block">
          <Image
            src={src}
            alt="รูปจากลูกค้า"
            width={240}
            height={240}
            unoptimized
            onError={() => setFailed(true)}
            className="h-auto max-h-72 w-60 rounded-xl object-cover"
          />
        </a>
      );
    case "video":
      return <video src={src} controls preload="metadata" onError={() => setFailed(true)} className="max-h-72 w-64 rounded-xl bg-black" />;
    case "audio":
      return <audio src={src} controls preload="metadata" onError={() => setFailed(true)} className="w-60" />;
    default:
      return (
        <a href={src} download className="flex items-center gap-2">
          <File className="size-5 shrink-0 opacity-70" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate font-medium">{typeof payload.fileName === "string" ? payload.fileName : "ไฟล์"}</span>
            <span className="text-xs opacity-70">{formatSize(payload.fileSize)}</span>
          </span>
          <Download className="size-4 shrink-0 opacity-70" aria-hidden />
        </a>
      );
  }
}
