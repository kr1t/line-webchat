import Image from "next/image";
import clsx from "clsx";

export type Mood = "greet" | "p1" | "p2" | "p3" | "p4" | "p5";

/** น้องติ๊ก, the tickget mascot, in one of its moods. */
export function Mascot({ mood, size = 56, className }: { mood: Mood; size?: number; className?: string }) {
  return (
    <Image
      src={`/brand/mascot/${mood}.png`}
      alt="น้องติ๊ก"
      width={size}
      height={size}
      className={clsx("shrink-0 rounded-2xl border-2 border-[#1A1A1A]", className)}
    />
  );
}
