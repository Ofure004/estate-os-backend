import { AccessManagementModule } from './access-management/access-management.module.js';
import { VisitorInvitationsModule } from './visitor-invitations/visitor-invitations.module.js';
import { AuthModule } from './auth/auth.module.js';
import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    AuthModule,
    VisitorInvitationsModule,
    AccessManagementModule,
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'estate-os-backend',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
