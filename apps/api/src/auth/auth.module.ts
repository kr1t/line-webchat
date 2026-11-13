import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AttemptsService } from './attempts.service.js';
import { AuditService } from './audit.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { OriginGuard } from './origin.guard.js';
import { RolesGuard } from './roles.guard.js';
import { TokenService } from './token.service.js';
import { TotpService } from './totp.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AttemptsService,
    AuditService,
    AuthService,
    TokenService,
    TotpService,
    // Order matters: origin check, then authentication, then roles
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuditService, TokenService],
})
export class AuthModule {}
