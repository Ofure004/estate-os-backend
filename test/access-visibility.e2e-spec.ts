import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AccessManagementModule } from '../src/access-management/access-management.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Activity query validation HTTP', () => {
  let app: INestApplication;
  let token: string;
  const transaction = vi.fn();
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'visibility-http-test-secret-at-least-32-bytes');
    const module = await Test.createTestingModule({
      imports: [AccessManagementModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        estate: { findUnique: async () => ({ organizationId: 'org' }) },
        user: {
          findUnique: async ({
            select,
          }: {
            select: { memberships?: unknown };
          }) =>
            select.memberships
              ? {
                  memberships: [],
                  residencies: [],
                  staffAssignments: [
                    {
                      id: 's',
                      estateId: 'a',
                      role: 'GUARD',
                      status: 'ACTIVE',
                      startedAt: null,
                      endedAt: null,
                    },
                  ],
                }
              : { id: 'guard' },
        },
        $transaction: transaction,
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
    token = await module.get(JwtService).signAsync({ sub: 'guard' });
  });
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  it.each([
    'page=0',
    'page=-1',
    'page=1.5',
    'page=abc',
    'page=',
    'page=1e2',
    'page=1&page=2',
    'limit=0',
    'limit=101',
    'limit=-1',
    'limit=1.5',
    'limit=abc',
    'limit=',
    'type=DENIED',
    'gateId=',
    'unknown=x',
    'page=2147483647&limit=100',
  ])('rejects %s', async (query) => {
    await request(app.getHttpServer())
      .get(`/estates/a/access/activity?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(transaction).not.toHaveBeenCalled();
  });
});
