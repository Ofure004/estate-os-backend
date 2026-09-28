import {
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify, argon2id } from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ACCESS_TOKEN_SECONDS,
  REFRESH_SESSION_SECONDS,
} from './auth.constants.js';
import { UsersService } from '../users/users.service.js';
import type { AuthenticatedUser } from '../users/users.service.js';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash!: string;
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}
  async onModuleInit() {
    this.dummyHash = await hash(randomBytes(32), { type: argon2id });
  }
  async validateCredentials(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    let valid = false;
    try {
      valid = await verify(user?.passwordHash ?? this.dummyHash, password);
    } catch {
      /* Invalid stored hashes cannot authenticate. */
    }
    if (!user?.passwordHash || !valid)
      throw new UnauthorizedException('Invalid email or password');
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
    };
  }
  async login(email: string, password: string) {
    const user = await this.validateCredentials(email, password);
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_SESSION_SECONDS * 1000);
    const response = await this.tokens(user, refreshToken, expiresAt);
    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: this.digest(refreshToken),
        expiresAt,
      },
    });
    return response;
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.digest(refreshToken);
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.refreshSession.findUnique({
        where: { tokenHash },
      });
      if (!session || session.expiresAt <= new Date())
        throw new UnauthorizedException('Invalid or expired refresh token');
      const user = await tx.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      });
      if (!user) throw new UnauthorizedException();
      const replacement = randomBytes(32).toString('base64url');
      // Compare-and-swap prevents two requests from spending the same token.
      const changed = await tx.refreshSession.updateMany({
        where: { id: session.id, tokenHash, expiresAt: { gt: new Date() } },
        data: { tokenHash: this.digest(replacement) },
      });
      if (changed.count !== 1)
        throw new UnauthorizedException('Invalid refresh token');
      return this.tokens(user, replacement, session.expiresAt);
    });
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshSession.deleteMany({
      where: { tokenHash: this.digest(refreshToken) },
    });
  }

  private digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async tokens(
    user: AuthenticatedUser,
    refreshToken: string,
    expiresAt: Date,
  ) {
    return {
      accessToken: await this.jwt.signAsync({
        sub: user.id,
        jti: randomUUID(),
      }),
      expiresIn: ACCESS_TOKEN_SECONDS,
      refreshToken,
      refreshExpiresAt: expiresAt.toISOString(),
      user,
    };
  }
}
