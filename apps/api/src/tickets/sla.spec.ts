import { deadlineState, dueDates, durationText, parseTicketCode, ticketCode } from './sla.js';

const at = (iso: string) => new Date(iso);

describe('ticket codes', () => {
  it('formats and parses codes the way customers type them', () => {
    expect(ticketCode(123)).toBe('TK-000123');
    expect(parseTicketCode('TK-000123')).toBe(123);
    expect(parseTicketCode(' tk123 ')).toBe(123);
    expect(parseTicketCode('TK 45')).toBe(45);
    expect(parseTicketCode('ticket 45')).toBeNull();
    expect(parseTicketCode('TK-')).toBeNull();
  });
});

describe('SLA', () => {
  it('sets due dates from the severity, with no resolve target for P5', () => {
    const created = at('2026-11-15T10:00:00Z');
    expect(dueDates(created, 'P1')).toEqual({
      responseDueAt: at('2026-11-15T10:15:00Z'),
      resolveDueAt: at('2026-11-15T14:00:00Z'),
    });
    expect(dueDates(created, 'P5').resolveDueAt).toBeNull();
  });

  it('is at risk in the last quarter, breached after the deadline, and met when done in time', () => {
    const clock = { createdAt: at('2026-11-15T10:00:00Z'), pausedAt: null, pausedSeconds: 0 };
    const due = at('2026-11-15T11:00:00Z');
    expect(deadlineState(clock, due, null, at('2026-11-15T10:30:00Z'))).toBe('ok');
    expect(deadlineState(clock, due, null, at('2026-11-15T10:50:00Z'))).toBe('at_risk');
    expect(deadlineState(clock, due, null, at('2026-11-15T11:01:00Z'))).toBe('breached');
    expect(deadlineState(clock, due, at('2026-11-15T10:59:00Z'), at('2026-11-15T12:00:00Z'))).toBe('met');
    expect(deadlineState(clock, null, null, at('2026-11-15T12:00:00Z'))).toBe('none');
  });

  it('does not count time spent waiting for the customer', () => {
    const due = at('2026-11-15T11:00:00Z');
    const paused = { createdAt: at('2026-11-15T10:00:00Z'), pausedAt: at('2026-11-15T10:30:00Z'), pausedSeconds: 600 };
    // 10 minutes paused earlier + 40 minutes paused now → deadline moves to 11:50
    expect(deadlineState(paused, due, null, at('2026-11-15T11:10:00Z'))).toBe('ok');
  });

  it('describes durations in Thai', () => {
    expect(durationText(15)).toBe('15 นาที');
    expect(durationText(240)).toBe('4 ชม.');
    expect(durationText(2880)).toBe('2 วัน');
  });
});
