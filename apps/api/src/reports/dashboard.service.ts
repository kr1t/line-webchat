import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { type Admin, admins, conversationEvents, lineUsers, messages, ticketEvents, tickets } from '../db/schema.js';
import { QuotaService } from '../tickets/quota.service.js';
import { ACTIVE_STATUSES, SEVERITIES } from '../tickets/sla.js';
import type { DashboardQuery } from './reports.schemas.js';

const DAY_MS = 86_400_000;
const n = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** Numbers for the dashboard. Everything is computed straight from the tables (small data, no rollups). */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly quota: QuotaService,
  ) {}

  async summary(query: DashboardQuery, me: Admin) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 7 * DAY_MS);
    const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
    const inRange = and(gte(tickets.createdAt, from), lt(tickets.createdAt, to));

    const [totals] = await this.db
      .select({
        created: sql`count(*)`,
        answered: sql`count(*) filter (where ${tickets.firstResponseAt} is not null)`,
        answeredInTime: sql`count(*) filter (where ${tickets.firstResponseAt} is not null and not ${tickets.responseBreached})`,
        // Still unanswered after the deadline also counts as a miss
        unansweredLate: sql`count(*) filter (where ${tickets.firstResponseAt} is null and ${tickets.responseDueAt} + ${tickets.pausedSeconds} * interval '1 second' < now())`,
        resolved: sql`count(*) filter (where ${tickets.resolvedAt} is not null and ${tickets.resolveDueAt} is not null)`,
        resolvedInTime: sql`count(*) filter (where ${tickets.resolvedAt} is not null and ${tickets.resolveDueAt} is not null and not ${tickets.resolveBreached})`,
        downgraded: sql`count(*) filter (where ${tickets.severity} > ${tickets.reportedSeverity})`,
        rated: sql`count(${tickets.rating})`,
        ratingAvg: sql`avg(${tickets.rating})`,
        ratingGood: sql`count(*) filter (where ${tickets.rating} >= 4)`,
      })
      .from(tickets)
      .where(inRange);

    const [previous] = await this.db
      .select({ created: sql`count(*)` })
      .from(tickets)
      .where(and(gte(tickets.createdAt, prevFrom), lt(tickets.createdAt, from)));

    const firstResponseBySeverity = await this.db
      .select({
        severity: tickets.severity,
        minutes: sql`avg(extract(epoch from ${tickets.firstResponseAt} - ${tickets.createdAt}) / 60)`,
      })
      .from(tickets)
      .where(and(inRange, sql`${tickets.firstResponseAt} is not null`))
      .groupBy(tickets.severity);

    const openBySeverity = await this.db
      .select({ severity: tickets.severity, count: sql`count(*)` })
      .from(tickets)
      .where(inArray(tickets.status, ACTIVE_STATUSES))
      .groupBy(tickets.severity);

    const [breachedNow] = await this.db
      .select({ count: sql`count(*)` })
      .from(tickets)
      .where(
        and(
          inArray(tickets.status, ['open', 'acknowledged', 'in_progress', 'waiting_customer']),
          sql`(case when ${tickets.firstResponseAt} is null then ${tickets.responseDueAt} else ${tickets.resolveDueAt} end)
              + (${tickets.pausedSeconds} + coalesce(extract(epoch from now() - ${tickets.pausedAt}), 0)) * interval '1 second' < now()`,
        ),
      );

    const [chats] = await this.db
      .select({ unclaimed: sql`count(*) filter (where ${lineUsers.status} = 'open')` })
      .from(lineUsers);

    const bangkokDay = sql<string>`to_char(${tickets.createdAt} at time zone 'Asia/Bangkok', 'YYYY-MM-DD')`;
    const daily = await this.db
      .select({ day: bangkokDay, severity: tickets.severity, count: sql`count(*)` })
      .from(tickets)
      .where(inRange)
      .groupBy(bangkokDay, tickets.severity)
      .orderBy(bangkokDay);

    const byCategory = await this.db
      .select({ category: tickets.category, count: sql`count(*)` })
      .from(tickets)
      .where(inRange)
      .groupBy(tickets.category);

    const byStatus = await this.db
      .select({ status: tickets.status, count: sql`count(*)` })
      .from(tickets)
      .where(inArray(tickets.status, ACTIVE_STATUSES))
      .groupBy(tickets.status);

    const topReporters = await this.db
      .select({
        userId: tickets.reporterId,
        displayName: lineUsers.displayName,
        pictureUrl: lineUsers.pictureUrl,
        count: sql`count(*)`,
      })
      .from(tickets)
      .innerJoin(lineUsers, eq(lineUsers.userId, tickets.reporterId))
      .where(inRange)
      .groupBy(tickets.reporterId, lineUsers.displayName, lineUsers.pictureUrl)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    const answered = Number(totals.answered) + Number(totals.unansweredLate);
    const pct = (part: unknown, whole: number) => (whole > 0 ? Math.round((Number(part) / whole) * 1000) / 10 : null);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      cards: {
        newTickets: Number(totals.created),
        previousNewTickets: Number(previous.created),
        openBySeverity: Object.fromEntries(SEVERITIES.map((s) => [s, Number(openBySeverity.find((r) => r.severity === s)?.count ?? 0)])),
        breachedNow: Number(breachedNow.count),
        responseMetPct: pct(totals.answeredInTime, answered),
        resolveMetPct: pct(totals.resolvedInTime, Number(totals.resolved)),
        firstResponseMinutes: Object.fromEntries(
          SEVERITIES.map((s) => [s, n(firstResponseBySeverity.find((r) => r.severity === s)?.minutes)]),
        ),
        unclaimedChats: Number(chats.unclaimed),
        downgradedPct: pct(totals.downgraded, Number(totals.created)),
        csat: {
          average: totals.ratingAvg === null ? null : Math.round(Number(totals.ratingAvg) * 10) / 10,
          count: Number(totals.rated),
          positivePct: pct(totals.ratingGood, Number(totals.rated)),
        },
      },
      daily: this.fillDays(from, to, daily.map((d) => ({ day: d.day, severity: d.severity, count: Number(d.count) }))),
      byCategory: byCategory.map((r) => ({ category: r.category, count: Number(r.count) })),
      byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
      topReporters: topReporters.map((r) => ({ ...r, count: Number(r.count) })),
      staff: me.role === 'SUPER_ADMIN' ? await this.staff(from, to) : null,
    };
  }

  quotaInfo() {
    return this.quota.get();
  }

  /** Per teammate: chats taken, messages sent, tickets resolved, speed, SLA and ratings. */
  private async staff(from: Date, to: Date) {
    const team = await this.db.select({ id: admins.id, displayName: admins.displayName }).from(admins).where(eq(admins.isActive, true));
    const ids = team.map((a) => a.id);
    if (ids.length === 0) return [];

    const claimed = await this.db
      .select({ id: conversationEvents.actorId, count: sql`count(*)` })
      .from(conversationEvents)
      .where(and(eq(conversationEvents.type, 'claimed'), gte(conversationEvents.createdAt, from), lt(conversationEvents.createdAt, to)))
      .groupBy(conversationEvents.actorId);

    const sent = await this.db
      .select({ id: messages.sentByAdminId, count: sql`count(*)` })
      .from(messages)
      .where(and(eq(messages.direction, 'out'), eq(messages.status, 'sent'), gte(messages.createdAt, from), lt(messages.createdAt, to)))
      .groupBy(messages.sentByAdminId);

    const closed = await this.db
      .select({ id: ticketEvents.actorId, count: sql`count(distinct ${ticketEvents.ticketId})` })
      .from(ticketEvents)
      .where(
        and(
          eq(ticketEvents.type, 'status'),
          inArray(ticketEvents.toValue, ['resolved', 'closed']),
          gte(ticketEvents.createdAt, from),
          lt(ticketEvents.createdAt, to),
        ),
      )
      .groupBy(ticketEvents.actorId);

    const assigned = await this.db
      .select({
        id: tickets.assigneeId,
        firstResponseMinutes: sql`avg(extract(epoch from ${tickets.firstResponseAt} - ${tickets.createdAt}) / 60)`,
        answered: sql`count(${tickets.firstResponseAt})`,
        inTime: sql`count(*) filter (where ${tickets.firstResponseAt} is not null and not ${tickets.responseBreached})`,
        ratingAvg: sql`avg(${tickets.rating})`,
      })
      .from(tickets)
      .where(and(gte(tickets.createdAt, from), lt(tickets.createdAt, to)))
      .groupBy(tickets.assigneeId);

    const find = <T extends { id: string | null }>(rows: T[], id: string) => rows.find((r) => r.id === id);
    return team
      .map((a) => {
        const mine = find(assigned, a.id);
        const answered = Number(mine?.answered ?? 0);
        return {
          id: a.id,
          displayName: a.displayName,
          chatsClaimed: Number(find(claimed, a.id)?.count ?? 0),
          messagesSent: Number(find(sent, a.id)?.count ?? 0),
          ticketsResolved: Number(find(closed, a.id)?.count ?? 0),
          firstResponseMinutes: n(mine?.firstResponseMinutes),
          responseMetPct: answered > 0 ? Math.round((Number(mine?.inTime) / answered) * 1000) / 10 : null,
          ratingAvg: mine?.ratingAvg === null || mine?.ratingAvg === undefined ? null : Math.round(Number(mine.ratingAvg) * 10) / 10,
        };
      })
      .sort((x, y) => y.messagesSent + y.ticketsResolved - (x.messagesSent + x.ticketsResolved));
  }

  /** One row per Bangkok day in the range, with zeros where nothing was reported. */
  private fillDays(from: Date, to: Date, rows: { day: string; severity: string; count: number }[]) {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });
    const days: Record<string, number | string>[] = [];
    const seen = new Set<string>();
    for (let t = from.getTime(); t < to.getTime() + DAY_MS && days.length < 370; t += DAY_MS) {
      const day = fmt.format(new Date(Math.min(t, to.getTime() - 1)));
      if (seen.has(day)) continue;
      seen.add(day);
      days.push({ day, ...Object.fromEntries(SEVERITIES.map((s) => [s, 0])) });
    }
    for (const row of rows) {
      const bucket = days.find((d) => d.day === row.day);
      if (bucket) bucket[row.severity] = row.count;
    }
    return days;
  }
}
