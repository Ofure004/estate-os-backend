import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UsersService } from '../users/users.service.js';
import type { AuthenticatedUser } from '../users/users.service.js';
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(
      request.headers.authorization ?? '',
    );
    if (!match) throw new UnauthorizedException();
    let payload: { sub?: unknown; exp?: unknown };
    try {
      payload = await this.jwt.verifyAsync(match[1], { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException();
    }
    if (
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.exp !== 'number'
    )
      throw new UnauthorizedException();
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    request.user = user;
    return true;
  }
}
