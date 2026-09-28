import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UsersService } from '../src/users/users.service.js';

describe.skipIf(process.env.RUN_AUTH_DATABASE_TESTS !== '1')(
  'Refresh sessions with PostgreSQL',
  () => {
    let prisma: PrismaService;
    let auth: AuthService;
    const userId = `refresh-test-${randomUUID()}`;
    const email = `${userId}@example.com`;

    beforeAll(async () => {
      prisma = new PrismaService();
      await prisma.$connect();
      await prisma.user.create({
        data: {
          id: userId,
          email,
          passwordHash: await hash('TestPassword123!'),
        },
      });
      auth = new AuthService(
        new UsersService(prisma),
        new JwtService({
          secret: 'test-only-secret-with-at-least-32-bytes',
          signOptions: { algorithm: 'HS256', expiresIn: 900 },
        }),
        prisma,
      );
      await auth.onModuleInit();
    });

    afterAll(async () => {
      if (prisma) {
        try {
          await prisma.user.deleteMany({ where: { id: userId } });
        } finally {
          await prisma.$disconnect();
        }
      }
    });

    it('atomically rotates concurrent refreshes and persists logout', async () => {
      const login = await auth.login(email, 'TestPassword123!');
      const results = await Promise.allSettled([
        auth.refresh(login.refreshToken),
        auth.refresh(login.refreshToken),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const failure = results.find((result) => result.status === 'rejected');
      expect(failure?.status === 'rejected' && failure.reason.getStatus()).toBe(
        401,
      );
      const success = results.find((result) => result.status === 'fulfilled');
      if (!success || success.status !== 'fulfilled')
        throw new Error('No successful refresh');
      await expect(auth.refresh(login.refreshToken)).rejects.toMatchObject({
        status: 401,
      });
      await auth.logout(success.value.refreshToken);
      await expect(
        auth.refresh(success.value.refreshToken),
      ).rejects.toMatchObject({ status: 401 });
      expect(await prisma.refreshSession.count({ where: { userId } })).toBe(0);
    });
  },
);
