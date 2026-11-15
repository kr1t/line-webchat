import type { messagingApi } from '@line/bot-sdk';
import type { BotMessage } from './bot-messenger.service.js';
import { durationText, SEVERITIES, type Severity, SLA, severityName, STATUS_LABELS, type TicketStatus, ticketCode } from './sla.js';

// tickget brand colours
const RED = '#F2483A';
const INK = '#1A1A1A';
const CREAM = '#FBF8F1';
const MUTED = '#8A857C';

/**
 * น้องติ๊ก pictures live in the web app (apps/web/public/brand/mascot). LINE only loads https
 * images, so on a local http origin cards simply go without them.
 */
let mascotBase: string | null = null;
let helpUrl: string | null = null;
export function setMascotBase(webOrigin: string, liffId?: string) {
  const origin = webOrigin.replace(/\/$/, '');
  mascotBase = origin.startsWith('https://') ? `${origin}/brand/mascot` : null;
  helpUrl = guideUrl(origin, liffId);
}

/** The customer guide opens inside LINE through LIFF when there is one, otherwise as a web page. */
export function guideUrl(webOrigin: string, liffId?: string): string | null {
  if (liffId) return `https://liff.line.me/${liffId}/help`;
  const origin = webOrigin.replace(/\/$/, '');
  return origin.startsWith('https://') ? `${origin}/help` : null;
}
export const mascotUrl = (name: 'greet' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5') => (mascotBase ? `${mascotBase}/${name}.png` : null);

// Mood colours behind each น้องติ๊ก picture
const MOOD_BG: Record<Severity, string> = { P1: '#FDD5D0', P2: '#FDE2C6', P3: '#FBEFB7', P4: '#D3EFDC', P5: '#D3E3FB' };

type Flex = messagingApi.FlexMessage;
type Bubble = messagingApi.FlexBubble;
type QuickReply = messagingApi.QuickReply;

export interface TicketCard {
  id: string;
  number: number;
  title: string;
  severity: Severity;
  status: TicketStatus;
  createdAt: Date;
}

const postback = (label: string, data: string, displayText?: string): messagingApi.PostbackAction => ({
  type: 'postback',
  label,
  data,
  ...(displayText ? { displayText } : {}),
});

const quickReply = (...actions: messagingApi.Action[]): QuickReply => ({
  items: actions.map((action) => ({ type: 'action', action })),
});

const text = (body: string, summary = body, qr?: QuickReply): BotMessage => ({
  message: { type: 'text', text: body, ...(qr ? { quickReply: qr } : {}) },
  summary,
});

const brandHeader = (): messagingApi.FlexBox => ({
  type: 'box',
  layout: 'horizontal',
  paddingBottom: 'none',
  contents: [
    {
      type: 'text',
      size: 'xs',
      weight: 'bold',
      color: INK,
      contents: [
        { type: 'span', text: 't' },
        { type: 'span', text: 'i', color: RED },
        { type: 'span', text: 'ckget' },
      ],
    },
  ],
});

const thaiTime = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Bangkok',
});

// ── Reporting a problem ───────────────────────────────────────────────

export function severityPicker(): BotMessage[] {
  const bubbles: Bubble[] = SEVERITIES.map((severity) => {
    const info = SLA[severity];
    const picture = mascotUrl(severity.toLowerCase() as 'p1');
    return {
      type: 'bubble',
      size: 'micro',
      ...(picture
        ? {
            hero: {
              type: 'image' as const,
              url: picture,
              size: 'full',
              aspectRatio: '1:1',
              aspectMode: 'cover' as const,
              backgroundColor: MOOD_BG[severity],
            },
          }
        : {}),
      styles: { body: { backgroundColor: CREAM }, footer: { backgroundColor: CREAM } },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: `${info.emoji} ${severity}`, size: 'xs', color: info.color, weight: 'bold' },
          { type: 'text', text: info.label, size: 'md', weight: 'bold', color: INK, wrap: true },
          { type: 'text', text: info.hint, size: 'xs', color: INK, wrap: true },
          { type: 'text', text: info.examples, size: 'xxs', color: MUTED, wrap: true },
          {
            type: 'text',
            text: `ตอบภายใน ${durationText(info.responseMinutes)}`,
            size: 'xxs',
            color: info.color,
            weight: 'bold',
            margin: 'md',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: severity === 'P1' ? RED : INK,
            action: postback('เลือก', `a=sev&v=${severity}`, severityName(severity)),
          },
        ],
      },
    };
  });

  const flex: Flex = {
    type: 'flex',
    altText: 'ปัญหารุนแรงแค่ไหน? เลือกระดับได้เลย',
    contents: { type: 'carousel', contents: bubbles },
    quickReply: quickReply(postback('ยกเลิก', 'a=cancel', 'ยกเลิก')),
  };
  return [
    text('น้องติ๊กพร้อมช่วยครับ ปัญหารุนแรงแค่ไหนครับ? เลื่อนดูแล้วเลือกระดับได้เลย (เรียงจากมากไปน้อย)', 'ถามระดับความรุนแรง'),
    { message: flex, summary: '[การ์ดเลือกระดับ P1–P5]' },
  ];
}

export function confirmCritical(): BotMessage {
  return text(
    `ยืนยันว่าเป็นเรื่องวิกฤต (P1)?\n${SLA.P1.hint}\nทีมจะถูกเรียกให้ดูทันที`,
    'ขอยืนยันระดับ P1',
    quickReply(postback('ยืนยัน', 'a=confirm&v=P1', 'ยืนยัน P1'), postback('เลือกใหม่', 'a=report', 'เลือกระดับใหม่')),
  );
}

export function askDescription(severity: Severity): BotMessage {
  return text(
    `${SLA[severity].emoji} ${severityName(severity)}\nพิมพ์อธิบายปัญหาได้เลยครับ\n• เกิดที่หน้าไหน\n• ทำอะไรแล้วเป็นอะไร`,
    `ขอรายละเอียด (${severity})`,
    quickReply(postback('ยกเลิก', 'a=cancel', 'ยกเลิก')),
  );
}

export function textOnlyPlease(): BotMessage {
  return text('รับข้อความกับรูปภาพครับ พิมพ์อธิบายปัญหาได้เลย', 'ขอให้พิมพ์เป็นข้อความ', quickReply(postback('ยกเลิก', 'a=cancel', 'ยกเลิก')));
}

export const imageReceived = () =>
  text(
    '📎 ได้รับรูปแล้ว ส่งเพิ่มได้ (สูงสุด 10 รูป รูปละไม่เกิน 5 MB)\nแล้วพิมพ์อธิบายปัญหาเพื่อส่งเรื่องได้เลยครับ',
    'ได้รับรูป',
    quickReply(postback('ยกเลิก', 'a=cancel', 'ยกเลิก')),
  );

export const imageRejected = () =>
  text('รับรูปนี้ไม่ได้ครับ (รูปละไม่เกิน 5 MB และไม่เกิน 10 รูปต่อเรื่อง)', 'รับรูปไม่ได้');

export const imagesAdded = (ticket: TicketCard) =>
  text(
    `📎 แนบรูปใน ${ticketCode(ticket.number)} แล้ว ส่งเพิ่มได้ หรือกด "เสร็จแล้ว"`,
    `แนบรูปใน ${ticketCode(ticket.number)}`,
    addingReplies(),
  );

export function pickFromCards(): BotMessage {
  return text(
    'เลือกระดับจากการ์ดด้านบนได้เลยครับ หรือกดยกเลิกถ้าจะคุยกับทีมแทน',
    'เตือนให้เลือกระดับ',
    quickReply(postback('ดูการ์ดอีกครั้ง', 'a=report', 'แจ้งปัญหา'), postback('ยกเลิก', 'a=cancel', 'ยกเลิก')),
  );
}

/** Quick replies while the customer can still add pictures or details to a ticket. */
const addingReplies = () =>
  quickReply(postback('เสร็จแล้ว', 'a=finish', 'เสร็จแล้ว'), postback('ติดตามสถานะ', 'a=status', 'ติดตามสถานะ'));

export function ticketCreated(ticket: TicketCard, afterHoursNote?: string | null, imageCount = 0): BotMessage {
  const info = SLA[ticket.severity];
  const flex: Flex = {
    type: 'flex',
    altText: `รับเรื่องแล้ว ${ticketCode(ticket.number)}`,
    quickReply: addingReplies(),
    contents: {
      type: 'bubble',
      size: 'kilo',
      styles: { header: { backgroundColor: CREAM }, body: { backgroundColor: CREAM }, footer: { backgroundColor: CREAM } },
      header: brandHeader(),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: '✅ รับเรื่องแล้ว', size: 'sm', color: MUTED },
          { type: 'text', text: ticketCode(ticket.number), size: 'xl', weight: 'bold', color: INK },
          { type: 'text', text: ticket.title, size: 'sm', color: INK, wrap: true, maxLines: 3 },
          { type: 'separator', margin: 'md' },
          row('ระดับ', `${info.emoji} ${severityName(ticket.severity)}`, info.color),
          row('สถานะ', STATUS_LABELS[ticket.status]),
          ...(imageCount > 0 ? [row('รูปแนบ', `${imageCount} รูป`)] : []),
          {
            type: 'text',
            text: afterHoursNote ?? `ทีมจะตอบกลับภายใน ${durationText(info.responseMinutes)}`,
            size: 'xs',
            color: MUTED,
            wrap: true,
            margin: 'md',
          },
          {
            type: 'text',
            text: '📎 ส่งรูปหน้าจอหรือข้อมูลเพิ่มในแชทนี้ได้เลย แล้วกด "เสร็จแล้ว"',
            size: 'xs',
            color: RED,
            weight: 'bold',
            wrap: true,
            margin: 'md',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'button', style: 'secondary', height: 'sm', action: postback('ติดตามสถานะ', 'a=status', 'ติดตามสถานะ') }],
      },
    },
  };
  return { message: flex, summary: `[การ์ดรับเรื่อง ${ticketCode(ticket.number)} · ${ticket.severity}]` };
}

function row(label: string, value: string, color = INK): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'baseline',
    contents: [
      { type: 'text', text: label, size: 'xs', color: MUTED, flex: 2 },
      { type: 'text', text: value, size: 'xs', color, flex: 5, wrap: true, weight: 'bold' },
    ],
  };
}

// ── Following up ──────────────────────────────────────────────────────

export function ticketList(tickets: TicketCard[], counts: { active: number; closed: number }, liffUrl: (id: string) => string | null): BotMessage {
  if (tickets.length === 0) {
    return text(
      counts.closed > 0 ? `ไม่มีเรื่องที่ยังเปิดอยู่ (ปิดแล้ว ${counts.closed} เรื่อง)` : 'ยังไม่มีเรื่องที่แจ้งไว้ครับ',
      'ไม่มี ticket ที่เปิดอยู่',
      quickReply(postback('แจ้งปัญหา', 'a=report', 'แจ้งปัญหา')),
    );
  }
  const flex: Flex = {
    type: 'flex',
    altText: `เรื่องที่ยังเปิดอยู่ ${counts.active} เรื่อง`,
    contents: { type: 'carousel', contents: tickets.map((t) => ticketBubble(t, liffUrl(t.id))) },
  };
  return { message: flex, summary: `[รายการ ticket ${tickets.length} เรื่อง]` };
}

export function ticketBubble(ticket: TicketCard, liffUrl: string | null): Bubble {
  const info = SLA[ticket.severity];
  const buttons: messagingApi.FlexComponent[] = [];
  const code = ticketCode(ticket.number);

  if (ticket.status === 'resolved') {
    buttons.push(
      { type: 'button', style: 'primary', color: INK, height: 'sm', action: postback('หายแล้ว ปิดได้เลย', `a=done&t=${ticket.id}`, `${code} หายแล้ว ปิดได้เลย`) },
      { type: 'button', style: 'secondary', height: 'sm', action: postback('ยังไม่หาย', `a=reopen&t=${ticket.id}`, `${code} ยังไม่หาย`) },
    );
  } else if (ticket.status !== 'closed') {
    buttons.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: postback('เพิ่มข้อมูล', `a=more&t=${ticket.id}`, `เพิ่มข้อมูล ${code}`),
    });
  }
  if (liffUrl) buttons.push({ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'ดูทั้งหมด', uri: liffUrl } });

  return {
    type: 'bubble',
    size: 'kilo',
    styles: { body: { backgroundColor: CREAM }, footer: { backgroundColor: CREAM } },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: code, size: 'sm', weight: 'bold', color: INK },
            { type: 'text', text: `${info.emoji} ${ticket.severity}`, size: 'xs', color: info.color, align: 'end', weight: 'bold' },
          ],
        },
        { type: 'text', text: ticket.title, size: 'sm', color: INK, wrap: true, maxLines: 2 },
        row('สถานะ', STATUS_LABELS[ticket.status]),
        row('แจ้งเมื่อ', thaiTime.format(ticket.createdAt)),
      ],
    },
    ...(buttons.length ? { footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: buttons } } : {}),
  };
}

export function singleTicket(ticket: TicketCard, liffUrl: string | null): BotMessage {
  return {
    message: { type: 'flex', altText: `${ticketCode(ticket.number)} ${STATUS_LABELS[ticket.status]}`, contents: ticketBubble(ticket, liffUrl) },
    summary: `[การ์ด ${ticketCode(ticket.number)}]`,
  };
}

export const ticketNotFound = () => text('ไม่พบเรื่องนี้ หรือไม่ใช่เรื่องที่คุณแจ้งไว้ครับ', 'ไม่พบ ticket');

export const askMoreInfo = (ticket: TicketCard) =>
  text(
    `ส่งข้อความหรือรูปเพิ่มสำหรับ ${ticketCode(ticket.number)} ได้เลยครับ ครบแล้วกด "เสร็จแล้ว"`,
    `ขอข้อมูลเพิ่ม ${ticketCode(ticket.number)}`,
    addingReplies(),
  );

export const moreInfoSaved = (ticket: TicketCard) =>
  text(
    `เพิ่มข้อมูลใน ${ticketCode(ticket.number)} แล้ว ส่งเพิ่มได้อีก หรือกด "เสร็จแล้ว"`,
    `บันทึกข้อมูลเพิ่ม ${ticketCode(ticket.number)}`,
    addingReplies(),
  );

export const doneAdding = () => text('เรียบร้อยครับ ทีมจะติดต่อกลับในแชทนี้ 🙏', 'จบการเพิ่มข้อมูล');

export const reopened = (ticket: TicketCard) =>
  text(
    `ส่ง ${ticketCode(ticket.number)} กลับให้ทีมแก้ต่อแล้วครับ 🙏\nบอกน้องติ๊กได้ไหมว่ายังเจออะไรอยู่ ส่งรูปหน้าจอมาได้ด้วย แล้วกด "เสร็จแล้ว"`,
    `ส่ง ${ticketCode(ticket.number)} กลับให้ทีม และถามว่ายังเจออะไร`,
    addingReplies(),
  );

export function askRating(ticket: TicketCard): BotMessage {
  const faces = ['😞', '🙁', '😐', '🙂', '😄'];
  return text(
    `${ticketCode(ticket.number)} ปิดแล้ว พอใจกับการแก้ปัญหาไหมครับ?`,
    `ขอคะแนน ${ticketCode(ticket.number)}`,
    quickReply(...faces.map((face, i) => postback(`${face} ${i + 1}`, `a=rate&t=${ticket.id}&v=${i + 1}`, `ให้คะแนน ${i + 1}`))),
  );
}

export const askRatingComment = () =>
  text(
    'ขอโทษที่ยังไม่ดีพอครับ บอกเราได้ไหมว่าตรงไหนที่ควรปรับ?',
    'ถามเหตุผลคะแนนต่ำ',
    quickReply(postback('ข้าม', 'a=skip', 'ข้าม')),
  );

export const thanksForRating = () => text('ขอบคุณสำหรับคะแนนครับ 🙏', 'ขอบคุณสำหรับคะแนน');
export const alreadyRated = () => text('ได้รับคะแนนของเรื่องนี้แล้วครับ ขอบคุณครับ', 'ได้คะแนนแล้ว');
export const cancelled = () => text('ยกเลิกแล้วครับ', 'ยกเลิก');
export const staleAction = () =>
  text('รายการนี้ใช้ไม่ได้แล้วครับ ดูเรื่องล่าสุดได้ที่ "ติดตามสถานะ"', 'ปุ่มเก่า', quickReply(postback('ติดตามสถานะ', 'a=status', 'ติดตามสถานะ')));
export const noPermission = () =>
  text('บัญชีนี้ยังแจ้งปัญหาผ่านเมนูไม่ได้ครับ พิมพ์คุยกับทีมได้เลย หรือติดต่อแอดมินเพื่อขอสิทธิ์', 'ยังไม่มีสิทธิ์แจ้ง ticket');
export const talkToTeam = () => text('พิมพ์ข้อความถึงทีมได้เลยครับ น้องติ๊กจะส่งต่อให้ทีม แล้วทีมจะตอบกลับในแชทนี้', 'ชวนคุยกับทีม');

/** First hello from น้องติ๊ก when someone adds the OA; customers also get the main buttons. */
export function greeting(isCustomer: boolean): BotMessage {
  const help: messagingApi.URIAction[] = helpUrl ? [{ type: 'uri', label: 'วิธีใช้', uri: helpUrl }] : [];
  return text(
    'สวัสดีครับ มีอะไรให้น้องติ๊กช่วยเหลือไหมครับ 😊',
    'ทักทาย',
    isCustomer
      ? quickReply(
          postback('แจ้งปัญหา', 'a=report', 'แจ้งปัญหา'),
          postback('ติดตามสถานะ', 'a=status', 'ติดตามสถานะ'),
          postback('คุยกับทีม', 'a=talk', 'คุยกับทีม'),
          ...help,
        )
      : help.length
        ? quickReply(...help)
        : undefined,
  );
}

/** Invitation sent straight into a customer's chat; the button opens the one-time link. */
export function inviteCard(url: string, expiresAt: Date): BotMessage {
  const picture = mascotUrl('greet');
  const expires = thaiTime.format(expiresAt);
  const flex: Flex = {
    type: 'flex',
    altText: 'น้องติ๊กมีคำเชิญให้แจ้งปัญหาผ่าน LINE ได้',
    contents: {
      type: 'bubble',
      size: 'kilo',
      ...(picture
        ? { hero: { type: 'image' as const, url: picture, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' as const, backgroundColor: '#FDECE9' } }
        : {}),
      styles: { body: { backgroundColor: CREAM }, footer: { backgroundColor: CREAM } },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: 'คำเชิญจากทีมงาน', size: 'xs', color: RED, weight: 'bold' },
          { type: 'text', text: 'แจ้งปัญหาและติดตามงานได้ในแชทนี้', size: 'md', weight: 'bold', color: INK, wrap: true },
          {
            type: 'text',
            text: 'กดรับสิทธิ์ แล้วเมนูแจ้งปัญหาจะขึ้นในห้องแชท น้องติ๊กจะช่วยส่งเรื่องให้ทีมและแจ้งความคืบหน้าให้ครับ',
            size: 'xs',
            color: MUTED,
            wrap: true,
          },
          { type: 'text', text: `ลิงก์ใช้ได้ครั้งเดียว หมดอายุ ${expires}`, size: 'xxs', color: MUTED, wrap: true, margin: 'md' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'button', style: 'primary', color: RED, height: 'sm', action: { type: 'uri', label: 'รับสิทธิ์', uri: url } }],
      },
    },
  };
  return { message: flex, summary: '[การ์ดคำเชิญรับสิทธิ์ลูกค้า]' };
}

export function statusChanged(ticket: TicketCard, liffUrl: string | null): BotMessage {
  return {
    message: {
      type: 'flex',
      altText: `${ticketCode(ticket.number)}: ${STATUS_LABELS[ticket.status]}`,
      contents: ticketBubble(ticket, liffUrl),
    },
    summary: `[แจ้งสถานะ ${ticketCode(ticket.number)}: ${STATUS_LABELS[ticket.status]}]`,
  };
}
