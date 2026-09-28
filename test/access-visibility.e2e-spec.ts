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
  let role = 'GUARD';
  let assignmentEstate = 'a';
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
                      estateId: assignmentEstate,
                      role,
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
    await app.listen(0, '127.0.0.1');
    token = await module.get(JwtService).signAsync({ sub: 'guard' });
  });
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    transaction.mockReset();
    role = 'GUARD';
    assignmentEstate = 'a';
  });
  it.each(['GUARD', 'SECURITY_SUPERVISOR', 'ESTATE_MANAGER'])(
    'allows %s to read the staff list with safe fields',
    async (staffRole) => {
      role = staffRole;
      const raw = vi
        .fn()
        .mockResolvedValueOnce([{ total: 1n }])
        .mockResolvedValueOnce([
          {
            invitationId: 'i',
            visitorFirstName: 'Jane',
            visitorLastName: 'Doe',
            unitId: 'u',
            unitName: 'Flat A',
            unitCode: 'A',
            purpose: 'Visit',
            validFrom: new Date(0),
            validUntil: new Date('2035-01-01'),
            status: 'expected',
            checkedInAt: null,
            checkedOutAt: null,
            token: 'must-not-leak',
            code: 'must-not-leak',
            email: 'private@example.com',
          },
        ]);
      transaction.mockImplementation((fn) => fn({ $queryRaw: raw }));
      const response = await request(app.getHttpServer())
        .get('/estates/a/access/visitors')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        data: [
          {
            invitationId: 'i',
            visitor: { firstName: 'Jane', lastName: 'Doe' },
            hostUnit: { id: 'u', name: 'Flat A', code: 'A' },
            purpose: 'Visit',
            validFrom: new Date(0).toISOString(),
            validUntil: new Date('2035-01-01').toISOString(),
            status: 'expected',
            checkedInAt: null,
            checkedOutAt: null,
          },
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    },
  );
  it.each(['expected', 'onsite', 'departed'])(
    'accepts %s and empty paginated results',
    async (status) => {
      transaction.mockImplementation((fn) =>
        fn({
          $queryRaw: vi
            .fn()
            .mockResolvedValueOnce([{ total: 0n }])
            .mockResolvedValueOnce([]),
        }),
      );
      const response = await request(app.getHttpServer())
        .get(`/estates/a/access/visitors?status=${status}&page=2&limit=5`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body).toEqual({
        data: [],
        meta: { page: 2, limit: 5, total: 0, totalPages: 0 },
      });
    },
  );
  it.each([
    'status=invalid',
    'status=',
    'status=expected&status=onsite',
    'page=0',
    'page=1.5',
    'page=1e2',
    'page=',
    'page=1&page=2',
    'limit=0',
    'limit=101',
    'limit=abc',
    'unknown=x',
    'page=2147483647&limit=100',
  ])('rejects invalid visitor query %s', async (query) => {
    await request(app.getHttpServer())
      .get(`/estates/a/access/visitors?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('requires authentication and an operational staff role in the requested estate', async () => {
    await request(app.getHttpServer())
      .get('/estates/a/access/visitors')
      .expect(401);
    role = 'RESIDENT';
    await request(app.getHttpServer())
      .get('/estates/a/access/visitors')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    role = 'GUARD';
    assignmentEstate = 'b';
    await request(app.getHttpServer())
      .get('/estates/a/access/visitors')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(transaction).not.toHaveBeenCalled();
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
