"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { POSTER_H, POSTER_W, QrPoster } from "./qr-poster";

const OA_URL = process.env.NEXT_PUBLIC_LINE_OA_URL || "https://line.me/R/ti/p/@609bjmyl";
const HANDLE = /\/(@[\w.-]+)$/.exec(OA_URL)?.[1] ?? "OA";

/** The mascot is inlined as a data URL so the exported PNG carries it (no external image in the SVG). */
function useDataUrl(src: string) {
  const [data, setData] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          }),
      )
      .then((url) => !cancelled && setData(url))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [src]);
  return data;
}

export function ShareView() {
  const svgRef = useRef<SVGSVGElement>(null);
  const mascot = useDataUrl("/brand/mascot/greet.png");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const download = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    setSaving(true);
    try {
      const xml = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = POSTER_W;
      canvas.height = POSTER_H;
      canvas.getContext("2d")!.drawImage(img, 0, 0, POSTER_W, POSTER_H);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `tickget-line-${HANDLE.replace("@", "")}.png`;
      a.click();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:flex-row md:px-8 md:py-8">
      <div className="w-full max-w-md shrink-0 overflow-hidden rounded-3xl border border-border shadow-sm">
        {mascot ? <QrPoster ref={svgRef} url={OA_URL} handle={HANDLE} mascotSrc={mascot} /> : <div className="aspect-[4/5] animate-pulse bg-zinc-100" />}
      </div>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">แชร์ QR</h1>
          <p className="text-sm text-muted">รูปสำหรับโพสต์ แปะหน้าร้าน หรือส่งให้ลูกค้า สแกนแล้วแอดเพื่อน LINE OA ได้ทันที</p>
        </div>
        <div className="rounded-2xl bg-surface p-4 text-sm ring-1 ring-border">
          <p className="text-muted">ลิงก์</p>
          <p className="mt-1 break-all font-mono text-xs">{OA_URL}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={download}
            disabled={!mascot || saving}
            className="flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Download className="size-4" /> {saving ? "กำลังสร้างรูป…" : "ดาวน์โหลด PNG"}
          </button>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(OA_URL);
              setCopied(true);
            }}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium ring-1 ring-border hover:bg-surface"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
          </button>
        </div>
        <p className="text-xs text-muted">ขนาด 1080×1350 px เหมาะกับโพสต์ Facebook / Instagram ลองสแกนด้วยมือถือก่อนพิมพ์ทุกครั้ง</p>
      </div>
    </div>
  );
}
