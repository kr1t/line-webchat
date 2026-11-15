import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import { BusinessHoursService } from '../settings/business-hours.service.js';
import { DB, type Database } from '../db/database.module.js';
import { type ChatState, chatStates, lineUsers, type Ticket } from '../db/schema.js';
import { AttachmentsService } from './attachments.service.js';
import { BotMessengerService, type BotMessage } from './bot-messenger.service.js';
import { isSeverity, parseTicketCode, type Severity } from './sla.js';
import * as say from './ticket-messages.js';
import { TicketsService } from './tickets.service.js';

// A started report waits this long for the next step before it is dropped
const STATE_TTL_MS = 10 * 60_000;

export interface IncomingMessage {
  /** Our stored message row; its reply token answers this event */
  messageId: string;
  type: string;
  text: string | null;
  /** LINE's id for pictures we can download (sent from the LINE app, not an external link) */
  lineImageId?: string | null;
}

/** Labels shown in the admin chat for each button the customer pressed. */
const POSTBACK_LABELS: Record<string, string> = {
  report: 'แจ้งปัญหา',
  status: 'ติดตามสถานะ',
  talk: 'คุยกับทีม',
  cancel: 'ยกเลิก',
  confirm: 'ยืนยัน P1',
  more: 'เพิ่มข้อมูล',
  done: 'หายแล้ว ปิดได้เลย',
  reopen: 'ยังไม่หาย',
  skip: 'ข้าม',
  finish: 'เสร็จแล้ว',
  hello: 'น้องติ๊ก',
};

/**
 * Reporting and following up on tickets inside the LINE chat.
 * Buttons send postbacks (data like "a=sev&v=P2"); typed text only counts
 * when a step is waiting for it. Everything else stays a normal chat with the team.
 * Postback data is never trusted: the role, the step and ticket ownership are checked every time.
 */
@Injectable()
export class CustomerFlowService {
  private readonly liffId: string | undefined;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tickets: TicketsService,
    private readonly bot: BotMessengerService,
    private readonly hours: BusinessHoursService,
    private readonly attachments: AttachmentsService,
    config: ConfigService<Env, true>,
  ) {
    this.liffId = config.get('LIFF_ID', { infer: true });
  }

  describePostback(data: string): string {
    const params = new URLSearchParams(data);
    const action = params.get('a') ?? '';
    if (action === 'sev') return `เลือกระดับ ${params.get('v') ?? ''}`.trim();
    if (action === 'rate') return `ให้คะแนน ${params.get('v') ?? ''}`.trim();
    return POSTBACK_LABELS[action] ?? 'กดปุ่ม';
  }

  async onPostback(userId: string, data: string, source: IncomingMessage): Promise<void> {
    const params = new URLSearchParams(data);
    const action = params.get('a');
    const reply = (items: BotMessage | BotMessage[]) => this.bot.reply(userId, source.messageId, [items].flat());

    if (action === 'hello') {
      return reply(say.greeting(await this.isCustomer(userId)));
    }
    if (action === 'finish') {
      await this.clearState(userId);
      return reply(say.doneAdding());
    }
    if (action === 'talk') {
      await this.clearState(userId);
      return reply(say.talkToTeam());
    }
    if (action === 'cancel' || action === 'skip') {
      await this.clearState(userId);
      if (action === 'cancel') await this.attachments.discardDrafts(userId);
      return reply(action === 'skip' ? say.thanksForRating() : say.cancelled());
    }

    const isCustomer = await this.isCustomer(userId);
    if (action === 'rate') return this.rate(userId, params, reply);
    if (!isCustomer) return reply(say.noPermission());

    switch (action) {
      case 'report':
        await this.setState(userId, { step: 'choose_severity' });
        return reply(say.severityPicker());

      case 'sev': {
        const severity = params.get('v');
        const state = await this.getState(userId);
        if (!isSeverity(severity) || !state || !['choose_severity', 'confirm_severity'].includes(state.step)) {
          return reply(say.staleAction());
        }
        if (severity === 'P1') {
          await this.setState(userId, { step: 'confirm_severity', severity });
          return reply(say.confirmCritical());
        }
        await this.setState(userId, { step: 'await_description', severity });
        return reply(say.askDescription(severity));
      }

      case 'confirm': {
        const state = await this.getState(userId);
        if (state?.step !== 'confirm_severity' || state.severity !== 'P1') return reply(say.staleAction());
        await this.setState(userId, { step: 'await_description', severity: 'P1' });
        return reply(say.askDescription('P1'));
      }

      case 'status': {
        await this.clearState(userId);
        const [active, counts] = await Promise.all([
          this.tickets.listOwn(userId, { active: true, limit: 10 }),
          this.tickets.countOwn(userId),
        ]);
        return reply(say.ticketList(active.map(card), counts, (id) => this.liffUrl(id)));
      }

      case 'more': {
        const ticket = await this.ownTicket(userId, params);
        if (!ticket || ticket.status === 'closed') return reply(say.staleAction());
        await this.setState(userId, { step: 'await_more_info', ticketId: ticket.id });
        return reply(say.askMoreInfo(card(ticket)));
      }

      case 'done': {
        const ticket = await this.ownTicket(userId, params);
        if (!ticket || ticket.status !== 'resolved') return reply(say.staleAction());
        await this.tickets.customerConfirmResolved(ticket);
        return reply(say.askRating(card(ticket)));
      }

      case 'reopen': {
        const ticket = await this.ownTicket(userId, params);
        if (!ticket || ticket.status !== 'resolved') return reply(say.staleAction());
        await this.tickets.customerReopen(ticket);
        // What is still wrong is the most useful thing the team can get now
        await this.setState(userId, { step: 'await_more_info', ticketId: ticket.id });
        return reply(say.reopened(card(ticket)));
      }

      default:
        return reply(say.staleAction());
    }
  }

  /**
   * Returns true when the message was part of the ticket flow (and already answered),
   * false when it is a normal chat message for the team.
   */
  async onMessage(userId: string, message: IncomingMessage): Promise<boolean> {
    const reply = (items: BotMessage | BotMessage[]) => this.bot.reply(userId, message.messageId, [items].flat());
    const state = await this.getState(userId);
    const text = message.type === 'text' ? (message.text ?? '').trim() : null;

    if (!state) {
      const number = text ? parseTicketCode(text) : null;
      if (number === null || !(await this.isCustomer(userId))) return false;
      const ticket = await this.tickets.findOwn(userId, { number });
      await reply(ticket ? say.singleTicket(card(ticket), this.liffUrl(ticket.id)) : say.ticketNotFound());
      return true;
    }

    switch (state.step) {
      case 'choose_severity':
      case 'confirm_severity':
        await reply(say.pickFromCards());
        return true;

      case 'await_description': {
        if (message.lineImageId) {
          const count = await this.attachments.saveFromLine(userId, message.lineImageId, null);
          await this.touchState(userId);
          // Several pictures arrive as separate events; answer the first one only
          if (count === null) await reply(say.imageRejected());
          else if (count === 1) await reply(say.imageReceived());
          return true;
        }
        if (!text) {
          await reply(say.textOnlyPlease());
          return true;
        }
        await this.clearState(userId);
        const ticket = await this.tickets.create({
          reporterId: userId,
          severity: state.severity as Severity,
          description: text,
          messageId: message.messageId,
        });
        const images = await this.attachments.claimDrafts(userId, ticket.id);
        // Keep listening: screenshots usually come right after the description
        await this.setState(userId, { step: 'await_more_info', ticketId: ticket.id });
        await reply(say.ticketCreated(card(ticket), await this.hours.awayTicketNote(), images));
        return true;
      }

      case 'await_more_info': {
        if (message.lineImageId && state.ticketId) {
          const ticket = await this.tickets.findOwn(userId, { id: state.ticketId });
          if (!ticket || ticket.status === 'closed') {
            await this.clearState(userId);
            await reply(say.staleAction());
            return true;
          }
          const firstOfBatch = (await this.attachments.addedSince(ticket.id, 15_000)) === 0;
          const count = await this.attachments.saveFromLine(userId, message.lineImageId, ticket.id);
          await this.touchState(userId);
          if (count === null) await reply(say.imageRejected());
          else if (firstOfBatch) {
            // First picture of this batch: note it on the ticket (restarts the clock if it was waiting) and confirm
            await this.tickets.addCustomerMessage(ticket, '📎 แนบรูปเพิ่ม', message.messageId);
            await reply(say.imagesAdded(card(ticket)));
          }
          return true;
        }
        if (!text) {
          await reply(say.textOnlyPlease());
          return true;
        }
        const ticket = state.ticketId ? await this.tickets.findOwn(userId, { id: state.ticketId }) : null;
        if (!ticket || ticket.status === 'closed') {
          await this.clearState(userId);
          await reply(say.staleAction());
          return true;
        }
        // Stays open for more text or pictures until "เสร็จแล้ว" or 10 quiet minutes
        await this.touchState(userId);
        await this.tickets.addCustomerMessage(ticket, text, message.messageId);
        await reply(say.moreInfoSaved(card(ticket)));
        return true;
      }

      case 'await_rating_comment': {
        await this.clearState(userId);
        if (!text || !state.ticketId) return false;
        await this.tickets.rateComment(state.ticketId, text);
        await reply(say.thanksForRating());
        return true;
      }
    }
  }

  /**
   * Normal chat outside business hours gets one automatic note per hour,
   * so the customer knows when to expect an answer.
   */
  async replyIfAway(userId: string, sourceMessageId: string): Promise<void> {
    const message = await this.hours.awayMessage();
    if (!message) return;
    const hourAgo = new Date(Date.now() - 60 * 60_000);
    const claimed = await this.db
      .update(lineUsers)
      .set({ lastAutoReplyAt: new Date() })
      .where(and(eq(lineUsers.userId, userId), or(isNull(lineUsers.lastAutoReplyAt), lt(lineUsers.lastAutoReplyAt, hourAgo))))
      .returning({ userId: lineUsers.userId });
    if (claimed.length === 0) return;
    await this.bot.reply(userId, sourceMessageId, [{ message: { type: 'text', text: message }, summary: 'ตอบนอกเวลาทำการ' }]);
  }

  async greet(userId: string, replyToken: string): Promise<void> {
    await this.bot.replyToEvent(userId, replyToken, [say.greeting(await this.isCustomer(userId))]);
  }

  liffUrl(ticketId: string): string | null {
    return this.liffId ? `https://liff.line.me/${this.liffId}/tickets/${ticketId}` : null;
  }

  private async rate(userId: string, params: URLSearchParams, reply: (m: BotMessage) => Promise<void>) {
    const ticket = await this.ownTicket(userId, params);
    const value = Number(params.get('v'));
    if (!ticket || ticket.status !== 'closed' || !Number.isInteger(value) || value < 1 || value > 5) {
      return reply(say.staleAction());
    }
    if (!(await this.tickets.rate(ticket, value))) return reply(say.alreadyRated());
    if (value <= 2) {
      await this.setState(userId, { step: 'await_rating_comment', ticketId: ticket.id });
      return reply(say.askRatingComment());
    }
    return reply(say.thanksForRating());
  }

  private ownTicket(userId: string, params: URLSearchParams) {
    const id = params.get('t') ?? '';
    // Ticket ids are UUIDs; anything else is a tampered or broken postback
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.resolve(null);
    return this.tickets.findOwn(userId, { id });
  }

  private async isCustomer(userId: string) {
    const [user] = await this.db
      .select({ role: lineUsers.role })
      .from(lineUsers)
      .where(eq(lineUsers.userId, userId))
      .limit(1);
    return user?.role === 'CUSTOMER';
  }

  private async getState(userId: string): Promise<ChatState | null> {
    const [state] = await this.db.select().from(chatStates).where(eq(chatStates.userId, userId)).limit(1);
    if (!state) return null;
    if (state.expiresAt.getTime() < Date.now()) {
      await this.clearState(userId);
      return null;
    }
    return state;
  }

  private async setState(
    userId: string,
    state: { step: ChatState['step']; severity?: Severity | null; ticketId?: string | null },
  ) {
    const values = {
      step: state.step,
      severity: state.severity ?? null,
      ticketId: state.ticketId ?? null,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
      updatedAt: new Date(),
    };
    await this.db
      .insert(chatStates)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: chatStates.userId, set: values });
  }

  /** Keeps a started step alive while pictures keep coming. */
  private async touchState(userId: string) {
    await this.db
      .update(chatStates)
      .set({ expiresAt: new Date(Date.now() + STATE_TTL_MS), updatedAt: new Date() })
      .where(eq(chatStates.userId, userId));
  }

  private async clearState(userId: string) {
    await this.db.delete(chatStates).where(eq(chatStates.userId, userId));
  }
}

function card(ticket: Ticket): say.TicketCard {
  return {
    id: ticket.id,
    number: ticket.number,
    title: ticket.title,
    severity: ticket.severity,
    status: ticket.status,
    createdAt: ticket.createdAt,
  };
}
