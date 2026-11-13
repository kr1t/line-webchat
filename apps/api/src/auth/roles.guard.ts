import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Admin } from '../db/schema.js';
import { type AuthedRequest, ROLES } from './decorators.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Admin['role'][] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    const admin = context.switchToHttp().getRequest<AuthedRequest>().admin;
    if (!admin || !roles.includes(admin.role)) throw new ForbiddenException();
    return true;
  }
}
