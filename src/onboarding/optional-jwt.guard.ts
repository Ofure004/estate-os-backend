import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../users/users.service.js';

export interface OptionalAuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<OptionalAuthenticatedRequest>();
    if (!request.headers.authorization) return true;
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization);
    if (!match) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync<{
        sub?: unknown;
        exp?: unknown;
      }>(match[1], { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number')
        throw new Error('Invalid payload');
      const user = await this.users.findById(payload.sub);
      if (!user) throw new Error('Unknown user');
      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
