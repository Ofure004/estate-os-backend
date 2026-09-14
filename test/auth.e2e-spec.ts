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

  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'test-only-secret-with-at-least-32-bytes');
    passwordHash = await hash('EstateDemo123!');
    const module = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService)
      .useValue({ user: { findUnique } })
      .compile();
    app = module.createNestApplication();
    jwt = module.get(JwtService);
    await app.init();
  });
  beforeEach(() => {
    findUnique.mockReset();
    findUnique.mockImplementation(async ({ where, select }) => {
      if (where.email === user.email || where.id === user.id) {
        return select.passwordHash ? { ...user, passwordHash } : { ...user };
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
    expect(me.body).toEqual(user);
    expect(findUnique).toHaveBeenLastCalledWith({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
      },
    });
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
