import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { Public } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DB, type Database } from '../db/database.module.js';
import { lineUsers } from '../db/schema.js';
import { ticketIdSchema } from '../tickets/tickets.schemas.js';
import { InvitesService } from './invites.service.js';
import { LiffGuard, type LiffRequest } from './liff.guard.js';
import { LINE_ID_TOKEN_VERIFIER, type LineIdTokenVerifier } from './liff.constants.js';
import {
  type CreateTicketBody,
  createTicketBody,
  type CustomerMessageBody,
  customerMessageBody,
  type LiffSessionBody,
  liffSessionBody,
  type RateBody,
  rateBody,
  type RedeemBody,
  redeemBody,
} from './liff.schemas.js';
import { LiffSessionService } from './liff-session.service.js';
import { LiffTicketsService } from './liff-tickets.service.js';

const TicketIdPipe = new ZodValidationPipe(ticketIdSchema);
const uid = (req: LiffRequest) => req.lineUserId!;

/**
 * Customer pages opened inside LINE. Not admin routes (@Public skips the admin session),
 * but every route except /session needs the LIFF cookie, and the origin check still applies.
 */
@Public()
@Controller('liff')
export class LiffController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(LINE_ID_TOKEN_VERIFIER) private readonly verifyIdToken: LineIdTokenVerifier,
    private readonly sessions: LiffSessionService,
    private readonly invites: InvitesService,
    private readonly tickets: LiffTicketsService,
  ) {}

  /** Exchanges a LIFF ID token (checked with LINE) for a one-hour cookie. */
  @Post('session')
  @HttpCode(HttpStatus.OK)
  async session(@Body(new ZodValidationPipe(liffSessionBody)) body: LiffSessionBody, @Res({ passthrough: true }) reply: FastifyReply) {
    const identity = await this.verifyIdToken(body.idToken);
    if (!identity) throw new UnauthorizedException({ code: 'invalid_id_token' });

    // People who open the LIFF before ever chatting still need a row (invites, tickets)
    await this.db
      .insert(lineUsers)
      .values({ userId: identity.userId, displayName: identity.displayName, pictureUrl: identity.pictureUrl, isFollowing: false })
      .onConflictDoNothing();
    await this.sessions.set(reply, identity.userId);
    return this.me(identity.userId);
  }

  @UseGuards(LiffGuard)
  @Get('me')
  getMe(@Req() req: LiffRequest) {
    return this.me(uid(req));
  }

  @UseGuards(LiffGuard)
  @Post('invites/redeem')
  @HttpCode(HttpStatus.OK)
  redeem(@Req() req: LiffRequest, @Body(new ZodValidationPipe(redeemBody)) body: RedeemBody) {
    return this.invites.redeem(body.token, uid(req), req.ip);
  }

  @UseGuards(LiffGuard)
  @Get('tickets')
  list(@Req() req: LiffRequest) {
    return this.tickets.list(uid(req));
  }

  @UseGuards(LiffGuard)
  @Post('tickets')
  create(@Req() req: LiffRequest, @Body(new ZodValidationPipe(createTicketBody)) body: CreateTicketBody) {
    return this.tickets.create(uid(req), body);
  }

  @UseGuards(LiffGuard)
  @Get('tickets/:id')
  detail(@Req() req: LiffRequest, @Param('id', TicketIdPipe) id: string) {
    return this.tickets.detail(uid(req), id);
  }

  @UseGuards(LiffGuard)
  @Post('tickets/:id/messages')
  addMessage(
    @Req() req: LiffRequest,
    @Param('id', TicketIdPipe) id: string,
    @Body(new ZodValidationPipe(customerMessageBody)) body: CustomerMessageBody,
  ) {
    return this.tickets.addMessage(uid(req), id, body.body);
  }

  @UseGuards(LiffGuard)
  @Post('tickets/:id/confirm-resolved')
  @HttpCode(HttpStatus.OK)
  confirm(@Req() req: LiffRequest, @Param('id', TicketIdPipe) id: string) {
    return this.tickets.confirmResolved(uid(req), id);
  }

  @UseGuards(LiffGuard)
  @Post('tickets/:id/reopen')
  @HttpCode(HttpStatus.OK)
  reopen(@Req() req: LiffRequest, @Param('id', TicketIdPipe) id: string) {
    return this.tickets.reopen(uid(req), id);
  }

  @UseGuards(LiffGuard)
  @Post('tickets/:id/rate')
  @HttpCode(HttpStatus.OK)
  rate(@Req() req: LiffRequest, @Param('id', TicketIdPipe) id: string, @Body(new ZodValidationPipe(rateBody)) body: RateBody) {
    return this.tickets.rate(uid(req), id, body.rating, body.comment);
  }

  private async me(userId: string) {
    const [user] = await this.db
      .select({ userId: lineUsers.userId, displayName: lineUsers.displayName, pictureUrl: lineUsers.pictureUrl, role: lineUsers.role })
      .from(lineUsers)
      .where(eq(lineUsers.userId, userId))
      .limit(1);
    return { ...user, pendingApproval: user.role ? false : await this.invites.hasPending(userId) };
  }
}
