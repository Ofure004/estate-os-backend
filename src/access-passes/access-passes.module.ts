import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AccessPassService } from './access-passes.service.js';
import { AccessPassController } from './access-passes.controller.js';
@Module({
  imports: [AuthorizationModule, PrismaModule],
  controllers: [AccessPassController],
  providers: [AccessPassService],
  exports: [AccessPassService],
})
export class AccessPassModule {}
