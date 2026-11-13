// Fills the local database with sample conversations. Refuses to run outside development.
import { randomBytes } from 'node:crypto';
import pg from 'pg';

if (process.env.NODE_ENV !== 'development') {
  console.error('seed-dev only runs with NODE_ENV=development');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const minutesAgo = (m) => new Date(Date.now() - m * 60_000);
const userId = () => 'U' + randomBytes(16).toString('hex');

const conversations = [
  {
    name: 'สมชาย ใจดี',
    status: 'ขอบคุณที่แวะมา',
    unread: 2,
    messages: [
      ['in', 'สวัสดีครับ สอบถามเรื่องคอร์สเรียนครับ', 42],
      ['out', 'สวัสดีครับ ยินดีให้ข้อมูลครับ สนใจคอร์สไหนครับ', 40],
      ['in', 'คอร์สสำหรับเด็ก 8 ขวบครับ มีวันเสาร์ไหม', 3],
      ['in', 'ถ้ามีรอบเช้าจะดีมากครับ 🙏', 2],
    ],
  },
  {
    name: 'Manee S.',
    status: null,
    unread: 0,
    messages: [
      ['in', 'Hi, is there parking available?', 180],
      ['out', 'Yes, free parking on the ground floor.', 175],
      ['in', 'Great, thanks!', 170],
    ],
  },
  {
    name: 'ปิติ',
    status: 'busy',
    unread: 1,
    sticker: true,
    messages: [['in', 'โอเคครับ', 1500]],
  },
];

const client = await pool.connect();
try {
  await client.query('begin');
  for (const c of conversations) {
    const id = userId();
    const times = c.messages.map(([, , m]) => m);
    await client.query(
      `insert into line_users (user_id, display_name, status_message, unread_count, last_message_at, profile_updated_at)
       values ($1, $2, $3, $4, $5, now())`,
      [id, c.name, c.status, c.unread + (c.sticker ? 1 : 0), minutesAgo(c.sticker ? 1440 : Math.min(...times))],
    );
    for (const [direction, text, m] of c.messages) {
      await client.query(
        `insert into messages (user_id, direction, type, text, created_at) values ($1, $2, 'text', $3, $4)`,
        [id, direction, text, minutesAgo(m)],
      );
    }
    if (c.sticker) {
      await client.query(
        `insert into messages (user_id, direction, type, payload, created_at) values ($1, 'in', 'sticker', $2, $3)`,
        [id, { packageId: '446', stickerId: '1988', stickerResourceType: 'STATIC' }, minutesAgo(1440)],
      );
    }
  }
  await client.query('commit');
  console.log(`Seeded ${conversations.length} conversations`);
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  client.release();
  await pool.end();
}
