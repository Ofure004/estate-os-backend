import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export const publicUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
} as const;
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { ...publicUserSelect, passwordHash: true },
    });
  }
  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }
}
