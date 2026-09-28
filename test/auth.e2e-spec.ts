import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'argon2';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const user = {
  id: 'user-1',
  email: 'owner@example.com',
  firstName: 'Ada',
  lastName: 'Okafor',
  phone: null,
};

describe('Authentication HTTP flow', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let passwordHash: string;
  const findUnique = vi.fn();
  const sessions = new Map<
    string,
    { id: string; userId: string; tokenHash: string; expiresAt: Date }
  >();
  const refreshSession = {
    create: vi.fn(async ({ data }) => {
      const session = { id: String(sessions.size + 1), ...data };
      sessions.set(session.id, session);
      return session;
    }),
    findUnique: vi.fn(async ({ where }) => {
      const session = [...sessions.values()].find(
        (s) => s.tokenHash === where.tokenHash,
      );
      return session ? { ...session } : null;
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      const session = sessions.get(where.id);
      if (
        !session ||
        session.tokenHash !== where.tokenHash ||
        session.expiresAt <= where.expiresAt.gt
      )
        return { count: 0 };
      Object.assign(session, data);
      return { count: 1 };
    }),
    deleteMany: vi.fn(async ({ where }) => {
      const session = [...sessions.values()].find(
        (s) => s.tokenHash === where.tokenHash,
      );
      if (session) sessions.delete(session.id);
      return { count: session ? 1 : 0 };
    }),
  };
  const prisma = {
    user: { findUnique },
    refreshSession,
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
  };

  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'test-only-secret-with-at-least-32-bytes');
    passwordHash = await hash('EstateDemo123!');
    const module = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    jwt = module.get(JwtService);
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => {
    sessions.clear();
    findUnique.mockReset();
    findUnique.mockImplementation(async ({ where, select }) => {
      if (where.email === user.email || where.id === user.id) {
        return select.passwordHash
          ? { ...user, passwordHash }
          : select.residencies
            ? {
                ...user,
                memberships: [],
                residencies: [],
                staffAssignments: [],
              }
            : { ...user };
      }
      return null;
    });
  });
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('logs in, issues a 15-minute JWT, and resolves request.user on /me', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ' OWNER@EXAMPLE.COM ', password: 'EstateDemo123!' })
      .expect(200);
    expect(login.body.user).toEqual(user);
    expect(login.body.expiresIn).toBe(900);
    expect(JSON.stringify(login.body)).not.toContain('passwordHash');
    const payload = await jwt.verifyAsync(login.body.accessToken);
    expect(payload.sub).toBe(user.id);
    expect(payload.exp - payload.iat).toBe(900);
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body).toEqual({
      ...user,
      memberships: [],
      residencies: [],
      staffAssignments: [],
    });
    expect(me.headers['cache-control']).toBe('no-store');
    expect(findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: user.id },
        select: expect.objectContaining({
          id: true,
          email: true,
          memberships: expect.any(Object),
          residencies: expect.any(Object),
          staffAssignments: expect.any(Object),
        }),
      }),
    );
  });

  async function login() {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'EstateDemo123!' })
      .expect(200);
  }

  it('stores only a hash and rotates the token without extending the 30-day session', async () => {
    const initial = await login();
    expect(initial.headers['cache-control']).toBe('no-store');
    expect(initial.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...sessions.values()][0].tokenHash).not.toBe(
      initial.body.refreshToken,
    );
    expect(
      Date.parse(initial.body.refreshExpiresAt) - Date.now(),
    ).toBeGreaterThan(29 * 86400_000);
    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: initial.body.refreshToken })
      .expect(200);
    expect(refreshed.headers['cache-control']).toBe('no-store');
    expect(refreshed.body.refreshToken).not.toBe(initial.body.refreshToken);
    expect(refreshed.body.accessToken).not.toBe(initial.body.accessToken);
    expect(refreshed.body.refreshExpiresAt).toBe(initial.body.refreshExpiresAt);
    const payload = await jwt.verifyAsync(refreshed.body.accessToken);
    expect(payload.exp - payload.iat).toBe(900);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: initial.body.refreshToken })
      .expect(401);
  });

  it('allows only one simultaneous refresh with the same token', async () => {
    const initial = await login();
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/auth/refresh')
          .send({ refreshToken: initial.body.refreshToken }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('rejects expired sessions and deleted users', async () => {
    const initial = await login();
    const session = [...sessions.values()][0];
    session.expiresAt = new Date(Date.now() - 1);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: initial.body.refreshToken })
      .expect(401);
    session.expiresAt = new Date(Date.now() + 86400_000);
    findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: initial.body.refreshToken })
      .expect(401);
  });

  it('revokes only the logged-out session and makes logout idempotent', async () => {
    const first = await login();
    const second = await login();
    for (let i = 0; i < 2; i++) {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: first.body.refreshToken })
        .expect(204);
    }
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: first.body.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: second.body.refreshToken })
      .expect(200);
  });

  it.each([
    {},
    { refreshToken: 42 },
    { refreshToken: '' },
    { refreshToken: 'a'.repeat(43), extra: true },
  ])('rejects invalid refresh and logout bodies %j', async (body) => {
    for (const endpoint of ['refresh', 'logout']) {
      await request(app.getHttpServer())
        .post(`/auth/${endpoint}`)
        .send(body)
        .expect(400);
    }
  });

  it('rejects unknown refresh tokens', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'a'.repeat(43) })
      .expect(401);
  });

  it('returns the same error for unknown users and incorrect passwords', async () => {
    const wrong = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'wrong' })
      .expect(401);
    const unknown = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'missing@example.com', password: 'wrong' })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it.each([null, 'invalid-hash'])(
    'rejects an account with hash %s',
    async (storedHash) => {
      findUnique.mockResolvedValue({ ...user, passwordHash: storedHash });
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: 'EstateDemo123!' })
        .expect(401);
    },
  );

  it.each([
    {},
    { email: 'invalid', password: 'pass' },
    { email: user.email },
    { email: user.email, password: '' },
    { email: user.email, password: 123 },
    { email: user.email, password: 'pass', role: 'ADMIN' },
    { email: ['owner@example.com'], password: 'pass' },
  ])('rejects invalid login input %j', async (body) => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send(body)
      .expect(400);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each(['', 'Basic abc', 'Bearer invalid', 'Bearer a b'])(
    'rejects invalid authorization %s',
    async (authorization) => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', authorization)
        .expect(401);
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('rejects expired, incorrectly signed, and invalid-claim tokens', async () => {
    const tokens = [
      await jwt.signAsync({ sub: user.id }, { expiresIn: -1 }),
      await jwt.signAsync({ sub: user.id }, { secret: 'different-secret' }),
      await jwt.signAsync({ sub: 123 }),
      await jwt.signAsync({ sub: user.id }, { algorithm: 'HS384' }),
    ];
    for (const token of tokens) {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    }
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects a deleted user even with a valid JWT', async () => {
    const token = await jwt.signAsync({ sub: 'deleted-user' });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('returns fresh profile data from the database', async () => {
    const token = await jwt.signAsync({ sub: user.id });
    findUnique.mockResolvedValue({ ...user, firstName: 'Updated' });
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.firstName).toBe('Updated');
  });
});
