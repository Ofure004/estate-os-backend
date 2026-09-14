import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthorizationService } from './authorization.service.js';
import { AuthorizationGuard } from './authorization.guard.js';
@Module({
  imports: [AuthModule, PrismaModule],
  providers: [AuthorizationService, AuthorizationGuard],
  exports: [AuthorizationService, AuthorizationGuard, AuthModule],
})
export class AuthorizationModule {}
