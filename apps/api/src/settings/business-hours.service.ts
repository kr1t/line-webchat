import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { settings } from '../db/schema.js';
import { type BusinessHours, businessHoursSchema, DEFAULT_BUSINESS_HOURS } from './settings.schemas.js';

const KEY = 'business_hours';
const DAY_NAMES = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

const bangkokParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Day of week (0 = Sunday) and "HH:mm" in Bangkok time. */
export function bangkokClock(at: Date): { day: number; time: string } {
  const parts = Object.fromEntries(bangkokParts.formatToParts(at).map((p) => [p.type, p.value]));
  return { day: WEEKDAYS.indexOf(parts.weekday), time: `${parts.hour}:${parts.minute}` };
}

export function isOpenAt(hours: BusinessHours, at: Date): boolean {
  if (!hours.enabled) return true;
  const { day, time } = bangkokClock(at);
  const today = hours.days[day];
  return !!today && time >= today.open && time < today.close;
}

/** When the team is next in, e.g. " วันจันทร์ 09:00 น." or " วันนี้ 13:00 น." */
export function nextOpenText(hours: BusinessHours, at: Date): string {
  const { day, time } = bangkokClock(at);
  for (let offset = 0; offset < 8; offset++) {
    const d = (day + offset) % 7;
    const slot = hours.days[d];
    if (!slot || (offset === 0 && time >= slot.open)) continue;
    const when = offset === 0 ? 'วันนี้' : offset === 1 ? 'พรุ่งนี้' : DAY_NAMES[d];
    return ` ${when} ${slot.open} น.`;
  }
  return 'ในเวลาทำการถัดไป';
}

@Injectable()
export class BusinessHoursService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(): Promise<BusinessHours> {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
    const parsed = businessHoursSchema.safeParse(row?.value);
    return parsed.success ? parsed.data : DEFAULT_BUSINESS_HOURS;
  }

  async set(value: BusinessHours, adminId: string) {
    await this.db
      .insert(settings)
      .values({ key: KEY, value, updatedById: adminId })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedById: adminId } });
    return value;
  }

  /** Line for the "ticket received" card outside business hours. */
  async awayTicketNote(at = new Date()): Promise<string | null> {
    const hours = await this.get();
    if (isOpenAt(hours, at)) return null;
    return `ตอนนี้อยู่นอกเวลาทำการ ทีมจะเริ่มดูเรื่องนี้${nextOpenText(hours, at)}`;
  }

  /** The auto-reply text when the team is away right now, otherwise null. */
  async awayMessage(at = new Date()): Promise<string | null> {
    const hours = await this.get();
    if (isOpenAt(hours, at)) return null;
    return hours.message.replace('{next}', nextOpenText(hours, at));
  }
}
