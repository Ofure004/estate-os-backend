import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import {
  EstateOnboardingController,
  InvitationAcceptanceController,
} from './onboarding.controller.js';
import { OnboardingService } from './onboarding.service.js';
import { OptionalJwtGuard } from './optional-jwt.guard.js';

@Module({
  imports: [AuthorizationModule, PrismaModule],
  controllers: [EstateOnboardingController, InvitationAcceptanceController],
  providers: [OnboardingService, OptionalJwtGuard],
})
export class OnboardingModule {}
