import { AccessPassModule } from '../access-passes/access-passes.module.js';
import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { VisitorInvitationsController } from './visitor-invitations.controller.js';
import { VisitorInvitationsService } from './visitor-invitations.service.js';
@Module({
  imports: [AuthorizationModule, PrismaModule, AccessPassModule],
  controllers: [VisitorInvitationsController],
  providers: [VisitorInvitationsService],
})
export class VisitorInvitationsModule {}
