// Creates the customer rich menu on LINE and uploads its image. Run once per channel,
// then put the printed id in CUSTOMER_RICH_MENU_ID. Customers get it when the role is granted.
//
//   pnpm rich-menu:create
//
// The image (assets/rich-menu-customer.png) is rendered from assets/rich-menu-customer.svg.
import { readFile } from 'node:fs/promises';

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN is not set');
  process.exit(1);
}

// น้องติ๊ก on the left (says hello), then four buttons of equal width
const MASCOT = 760;
const BUTTON = (2500 - MASCOT) / 4;
const area = (x, width, data, label) => ({
  bounds: { x, y: 0, width, height: 843 },
  action: { type: 'postback', data, displayText: label, label },
});

// The guide opens inside LINE through LIFF when LIFF_ID is set
const helpUrl = process.env.LIFF_ID
  ? `https://liff.line.me/${process.env.LIFF_ID}/help`
  : `${(process.env.WEB_ORIGIN ?? '').replace(/\/$/, '')}/help`;

const menu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: 'tickget customer',
  chatBarText: 'เมนู',
  areas: [
    area(0, MASCOT, 'a=hello', 'น้องติ๊ก'),
    area(MASCOT, BUTTON, 'a=report', 'แจ้งปัญหา'),
    area(MASCOT + BUTTON, BUTTON, 'a=status', 'ติดตามสถานะ'),
    area(MASCOT + BUTTON * 2, BUTTON, 'a=talk', 'คุยกับทีม'),
    { bounds: { x: MASCOT + BUTTON * 3, y: 0, width: BUTTON, height: 843 }, action: { type: 'uri', label: 'คู่มือ', uri: helpUrl } },
  ],
};

async function call(url, init) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });
  const body = await res.text();
  if (!res.ok) throw new Error(`${init.method} ${url} → ${res.status} ${body}`);
  return body ? JSON.parse(body) : {};
}

const { richMenuId } = await call('https://api.line.me/v2/bot/richmenu', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(menu),
});

const image = await readFile(new URL('../assets/rich-menu-customer.png', import.meta.url));
await call(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
  method: 'POST',
  headers: { 'content-type': 'image/png' },
  body: image,
});

console.log(`Created ${richMenuId}`);
console.log(`Add to apps/api/.env (and Vercel): CUSTOMER_RICH_MENU_ID=${richMenuId}`);
