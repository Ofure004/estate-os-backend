import 'dotenv/config';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || Buffer.byteLength(secret) < 32)
          throw new Error('JWT_SECRET must contain at least 32 bytes');
        return {
          secret,
          signOptions: { algorithm: 'HS256', expiresIn: 900 },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule, UsersModule],
})
export class AuthModule {}
