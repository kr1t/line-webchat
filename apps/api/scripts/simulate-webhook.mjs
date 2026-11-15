// Sends a signed fake LINE webhook to the local API, so chat flows can be tried without a phone.
//
//   pnpm webhook:sim <userId> text "สวัสดีครับ"
//   pnpm webhook:sim <userId> postback "a=report" "แจ้งปัญหา"
//   pnpm webhook:sim <userId> sticker | image | follow | unfollow
//
// Replies to the fake reply token will fail at LINE (expected); use a real userId to see push fallbacks.
import { createHmac, randomUUID } from 'node:crypto';

const [userId, kind = 'text', value = '', displayText] = process.argv.slice(2);
const secret = process.env.LINE_CHANNEL_SECRET;
const url = process.env.WEBHOOK_URL ?? 'http://localhost:4000/line/webhook';

if (!userId || !/^U[0-9a-f]{32}$/.test(userId)) {
  console.error('Usage: simulate-webhook <U + 32 hex userId> <text|postback|sticker|image|follow|unfollow> [value] [displayText]');
  process.exit(1);
}
if (!secret) {
  console.error('LINE_CHANNEL_SECRET is not set (add it to apps/api/.env)');
  process.exit(1);
}

const base = {
  webhookEventId: randomUUID().replace(/-/g, '').toUpperCase().slice(0, 26),
  timestamp: Date.now(),
  mode: 'active',
  source: { type: 'user', userId },
  deliveryContext: { isRedelivery: false },
};
const replyToken = randomUUID().replace(/-/g, '');
const messageId = String(Date.now()) + String(Math.floor(Math.random() * 1000));

const events = {
  text: { ...base, type: 'message', replyToken, message: { id: messageId, type: 'text', text: value, quoteToken: 'q' } },
  sticker: {
    ...base,
    type: 'message',
    replyToken,
    message: { id: messageId, type: 'sticker', packageId: '446', stickerId: '1988', stickerResourceType: 'STATIC' },
  },
  image: {
    ...base,
    type: 'message',
    replyToken,
    message: { id: messageId, type: 'image', contentProvider: { type: 'line' } },
  },
  postback: {
    ...base,
    type: 'postback',
    replyToken,
    postback: { data: value },
    ...(displayText ? { _displayText: displayText } : {}),
  },
  follow: { ...base, type: 'follow', replyToken, follow: { isUnblocked: false } },
  unfollow: { ...base, type: 'unfollow' },
};

const event = events[kind];
if (!event) {
  console.error(`Unknown event kind: ${kind}`);
  process.exit(1);
}
// LINE does not send displayText in postback events; keep it only for our own log line
delete event._displayText;

const body = JSON.stringify({ destination: 'Usimulator', events: [event] });
const signature = createHmac('sha256', secret).update(body).digest('base64');

const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-line-signature': signature },
  body,
});
console.log(`${kind}${value ? ` "${value}"` : ''} → ${res.status} ${await res.text()}`);
