import {
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify, argon2id } from 'argon2';
import { randomBytes } from 'node:crypto';
import { UsersService } from '../users/users.service.js';
import type { AuthenticatedUser } from '../users/users.service.js';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash!: string;
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(JwtService) private readonly jwt: JwtService,
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
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      expiresIn: 900,
      user,
    };
  }
}
