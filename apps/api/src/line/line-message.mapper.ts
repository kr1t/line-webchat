import type { webhook } from '@line/bot-sdk';

export interface StoredMessageContent {
  type: string;
  text: string | null;
  payload: Record<string, unknown> | null;
}

/** Converts a LINE message into what we store; tokens LINE attaches are dropped. */
export function toStoredContent(message: webhook.MessageContent): StoredMessageContent {
  switch (message.type) {
    case 'text':
      return { type: 'text', text: message.text, payload: null };
    case 'sticker':
      return {
        type: 'sticker',
        text: null,
        payload: {
          packageId: message.packageId,
          stickerId: message.stickerId,
          stickerResourceType: message.stickerResourceType,
        },
      };
    case 'location':
      return {
        type: 'location',
        text: message.address ?? message.title ?? null,
        payload: {
          title: message.title,
          address: message.address,
          latitude: message.latitude,
          longitude: message.longitude,
        },
      };
    case 'file':
      return {
        type: 'file',
        text: message.fileName,
        payload: { fileName: message.fileName, fileSize: message.fileSize },
      };
    case 'image':
    case 'video':
    case 'audio':
      return {
        type: message.type,
        text: null,
        payload: { contentProvider: message.contentProvider },
      };
    default:
      return { type: (message as { type: string }).type ?? 'unknown', text: null, payload: null };
  }
}
