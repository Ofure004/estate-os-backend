import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  AUTHORIZATION_POLICY,
  AuthorizationGuard,
} from './authorization.guard.js';
import type { AuthorizationPolicy } from './authorization.types.js';
export function Authorize(policy: AuthorizationPolicy) {
  return applyDecorators(
    SetMetadata(AUTHORIZATION_POLICY, policy),
    UseGuards(JwtAuthGuard, AuthorizationGuard),
  );
}
