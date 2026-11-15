import Image from "next/image";
import clsx from "clsx";
import { AlertCircle, Bot, File, Image as ImageIcon, LayoutGrid, MapPin, Mic, MousePointerClick, Video } from "lucide-react";
import { formatTime, messagePreview, sendErrorText } from "@/lib/format";
import type { ChatMessage } from "@/lib/types";

const ICONS: Record<string, typeof File> = {
  image: ImageIcon,
  video: Video,
  audio: Mic,
  file: File,
  location: MapPin,
  flex: LayoutGrid,
  postback: MousePointerClick,
};

function StickerContent({ message }: { message: ChatMessage }) {
  const stickerId = message.payload?.stickerId;
  if (typeof stickerId !== "string" || !/^\d+$/.test(stickerId)) return <span>[สติกเกอร์]</span>;
  return (
    <Image
      src={`https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`}
      alt="สติกเกอร์"
      width={120}
      height={120}
      className="h-28 w-auto"
      unoptimized
    />
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  showTime: boolean;
  onRetry?: (message: ChatMessage) => void;
}

export function MessageBubble({ message, showTime, onRetry }: MessageBubbleProps) {
  const outgoing = message.direction === "out";
  const isSticker = message.type === "sticker";
  // Automatic replies from the ticket flow (cards, prompts) look different from what the team typed
  const isBot = outgoing && message.payload?.bot === true;
  const Icon = ICONS[message.type];

  return (
    <div className={clsx("flex flex-col", outgoing ? "items-end" : "items-start")}>
      <div
        className={clsx(
          "max-w-[min(75%,32rem)] text-[15px] transition-opacity",
          message.status === "sending" && "opacity-60",
          !isSticker && "rounded-2xl px-3.5 py-2",
          !isSticker &&
            (isBot
              ? "rounded-br-md bg-zinc-100 text-foreground ring-1 ring-border"
              : outgoing
                ? "rounded-br-md bg-accent text-accent-foreground"
                : "rounded-bl-md bg-surface ring-1 ring-border"),
        )}
      >
        {message.type === "text" ? (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        ) : isSticker ? (
          <StickerContent message={message} />
        ) : (
          <p className="flex items-center gap-2">
            {Icon && <Icon className="size-4 shrink-0 opacity-70" aria-hidden />}
            <span className="break-words">{message.type === "flex" || message.type === "postback" ? message.text : messagePreview(message)}</span>
          </p>
        )}
      </div>
      {message.status === "failed" ? (
        <span className="mt-1 flex items-center gap-1 px-1 text-[11px] text-red-500">
          <AlertCircle className="size-3" aria-hidden />
          {sendErrorText(message.error)}
          {onRetry && !isBot && message.error !== "user_blocked" && (
            <button onClick={() => onRetry(message)} className="ml-1 font-medium underline underline-offset-2">
              ลองใหม่
            </button>
          )}
        </span>
      ) : message.status === "sending" ? (
        <span className="mt-1 px-1 text-[11px] text-muted">กำลังส่ง…</span>
      ) : (
        showTime && (
          <span className="mt-1 px-1 text-[11px] text-muted">
            {isBot ? (
              <span className="inline-flex items-center gap-0.5">
                <Bot className="size-3" aria-hidden /> ตอบอัตโนมัติ ·{" "}
              </span>
            ) : (
              outgoing && message.sentByName && <>{message.sentByName} · </>
            )}
            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          </span>
        )
      )}
    </div>
  );
}
