import { AccessVisibilityService } from './access-visibility.service.js';
import { AccessVisibilityController } from './access-visibility.controller.js';
import { AccessVisitService } from './access-visit.service.js';
import { AccessVisitController } from './access-visit.controller.js';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { AccessPassModule } from '../access-passes/access-passes.module.js';
import { AccessVerificationController } from './access-verification.controller.js';
import { AccessVerificationService } from './access-verification.service.js';
@Module({
  imports: [PrismaModule, AuthorizationModule, AccessPassModule],
  controllers: [
    AccessVerificationController,
    AccessVisitController,
    AccessVisibilityController,
  ],
  providers: [
    AccessVerificationService,
    AccessVisitService,
    AccessVisibilityService,
  ],
})
export class AccessManagementModule {}
