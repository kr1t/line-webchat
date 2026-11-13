import Image from "next/image";
import clsx from "clsx";

const PALETTE = ["bg-emerald-100 text-emerald-700", "bg-sky-100 text-sky-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-violet-100 text-violet-700"];

function colorFor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

interface AvatarProps {
  name: string | null;
  src: string | null;
  seed: string;
  size?: number;
}

export function Avatar({ name, src, seed, size = 40 }: AvatarProps) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={clsx("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium", !src && colorFor(seed))}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {src ? <Image src={src} alt="" fill sizes={`${size}px`} className="object-cover" /> : initial}
    </span>
  );
}
