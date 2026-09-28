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
  findContextById(id: string) {
    const estate = { id: true, name: true, organizationId: true } as const;
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        ...publicUserSelect,
        memberships: { select: {
          id: true, role: true, status: true,
          organization: { select: { id: true, name: true } },
        } },
        residencies: { select: {
          id: true, status: true, startedAt: true, endedAt: true,
          unit: { select: { id: true, name: true, code: true, estate: { select: estate } } },
        } },
        staffAssignments: { select: {
          id: true, role: true, status: true, startedAt: true, endedAt: true,
          estate: { select: estate },
        } },
      },
    });
  }
  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }
}
