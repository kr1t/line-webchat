import { isOpenAt, nextOpenText } from './business-hours.service.js';
import { DEFAULT_BUSINESS_HOURS } from './settings.schemas.js';

const hours = { ...DEFAULT_BUSINESS_HOURS, enabled: true };
// Bangkok is UTC+7
const bkk = (iso: string) => new Date(`${iso}+07:00`);

describe('business hours (Asia/Bangkok)', () => {
  it('is open Monday to Friday 09:00–18:00 by default', () => {
    expect(isOpenAt(hours, bkk('2026-11-16T09:00:00'))).toBe(true); // Monday
    expect(isOpenAt(hours, bkk('2026-11-16T17:59:00'))).toBe(true);
    expect(isOpenAt(hours, bkk('2026-11-16T18:00:00'))).toBe(false);
    expect(isOpenAt(hours, bkk('2026-11-15T12:00:00'))).toBe(false); // Sunday
  });

  it('is always open when the schedule is off', () => {
    expect(isOpenAt(DEFAULT_BUSINESS_HOURS, bkk('2026-11-15T03:00:00'))).toBe(true);
  });

  it('says when the team is next in', () => {
    expect(nextOpenText(hours, bkk('2026-11-16T07:00:00'))).toBe(' วันนี้ 09:00 น.');
    expect(nextOpenText(hours, bkk('2026-11-16T20:00:00'))).toBe(' พรุ่งนี้ 09:00 น.');
    expect(nextOpenText(hours, bkk('2026-11-14T12:00:00'))).toBe(' วันจันทร์ 09:00 น.'); // Saturday
  });
});
