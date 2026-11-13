import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Admin } from '../db/schema.js';
import { AuditService } from './audit.service.js';
import {
  type ChangePasswordBody,
  changePasswordBody,
  type CodeBody,
  codeBody,
  type LoginBody,
  loginBody,
} from './auth.schemas.js';
import { AuthService, nextStage } from './auth.service.js';
import { SESSION_COOKIE } from './constants.js';
import { type AuthedRequest, CurrentAdmin, MfaStages, Public } from './decorators.js';
import { TokenService } from './token.service.js';

const toProfile = (admin: Admin) => ({
  id: admin.id,
  username: admin.username,
  displayName: admin.displayName,
  role: admin.role,
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginBody)) body: LoginBody,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const admin = await this.auth.login(body.username, body.password, req.ip);
    const next = nextStage(admin);
    await this.tokens.setMfa(reply, admin, next);
    return { next };
  }

  /** Where a pending login stands, so the web app can show the right step. */
  @MfaStages('change_password', 'setup_2fa', 'verify_2fa')
  @Get('pending')
  pending(@CurrentAdmin() admin: Admin, @Req() req: AuthedRequest) {
    return { next: req.mfaStage, username: admin.username };
  }

  @MfaStages('change_password')
  @Post('password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentAdmin() admin: Admin,
    @Body(new ZodValidationPipe(changePasswordBody)) body: ChangePasswordBody,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const updated = await this.auth.changePassword(admin, body.newPassword, req.ip);
    const next = nextStage(updated);
    await this.tokens.setMfa(reply, updated, next);
    return { next };
  }

  @MfaStages('setup_2fa')
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  setupTotp(@CurrentAdmin() admin: Admin) {
    return this.auth.startTotpSetup(admin);
  }

  @MfaStages('setup_2fa')
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  async enableTotp(
    @CurrentAdmin() admin: Admin,
    @Body(new ZodValidationPipe(codeBody)) body: CodeBody,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const recoveryCodes = await this.auth.enableTotp(admin, body.code, req.ip);
    await this.tokens.setSession(reply, admin);
    return { recoveryCodes };
  }

  @MfaStages('verify_2fa')
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @CurrentAdmin() admin: Admin,
    @Body(new ZodValidationPipe(codeBody)) body: CodeBody,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.verifySecondFactor(admin, body.code, req.ip);
    await this.tokens.setSession(reply, admin);
    return toProfile(admin);
  }

  /** Enter a 2FA code again before sensitive actions (managing admins). */
  @Post('step-up')
  @HttpCode(HttpStatus.NO_CONTENT)
  async stepUp(
    @CurrentAdmin() admin: Admin,
    @Body(new ZodValidationPipe(codeBody)) body: CodeBody,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.stepUp(admin, body.code, req.ip);
    await this.tokens.setStepUp(reply, admin);
  }

  @Get('me')
  me(@CurrentAdmin() admin: Admin) {
    return toProfile(admin);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const claims = await this.tokens.verify('session', req.cookies?.[SESSION_COOKIE]);
    if (claims) await this.audit.log('logout', { actorId: claims.sub, ip: req.ip });
    this.tokens.clearAll(reply);
  }
}
