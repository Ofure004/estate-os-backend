import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AccessManagementModule } from '../src/access-management/access-management.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const manual = 'ABCD2345';
const token = 'CaseSensitive_0123456789abcdefghijklmnopqrst';
const base = '/estates/a/gates/gate-a/access/verify';
const from = new Date('2020-01-01T00:00:00Z');
const until = new Date('2099-01-01T00:00:00Z');
const fixture = () => ({
  code: manual,
  token,
  status: 'ACTIVE',
  revokedAt: null as Date | null,
  validFrom: from,
  validUntil: until,
  invitation: {
    estateId: 'a',
    status: 'PENDING',
    validFrom: from,
    validUntil: until,
    visitorFirstName: 'Jane',
    visitorLastName: 'Doe',
    purpose: 'Visit',
    hostResidency: {
      unit: { id: 'unit-a', estateId: 'a', name: 'Flat A', code: 'A' },
    },
  },
});
describe('Gate verification HTTP', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let pass: ReturnType<typeof fixture>;
  let gateStatus: string;
  let assignmentStatus: string;
  let assignmentEnd: Date | null;
  const mutate = vi.fn();
  const lookup = vi.fn(async ({ where }) =>
    where.OR.some(
      (filter: { code?: string; token?: string }) =>
        filter.code === pass.code || filter.token === pass.token,
    )
      ? [pass]
      : [],
  );
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where, select }) =>
        select.memberships
          ? {
              memberships: [],
              residencies: [],
              staffAssignments: [
                'guard',
                'supervisor',
                'elsewhere',
                'manager',
              ].includes(where.id)
                ? [
                    {
                      id: 'assignment',
                      role:
                        where.id === 'supervisor'
                          ? 'SECURITY_SUPERVISOR'
                          : where.id === 'manager'
                            ? 'ESTATE_MANAGER'
                            : 'GUARD',
                      estateId: where.id === 'elsewhere' ? 'b' : 'a',
                      status: assignmentStatus,
                      startedAt: null,
                      endedAt: assignmentEnd,
                    },
                  ]
                : [],
            }
          : {
              id: where.id,
              email: `${where.id}@example.com`,
              firstName: null,
              lastName: null,
              phone: null,
            },
      ),
    },
    estate: { findUnique: async () => ({ organizationId: 'org' }) },
    gate: {
      findFirst: vi.fn(async ({ where }) =>
        where.id === 'gate-a' && where.estateId === 'a'
          ? { status: gateStatus }
          : null,
      ),
    },
    accessPass: { findMany: lookup, update: mutate, updateMany: mutate },
    visitorInvitation: { update: mutate, updateMany: mutate },
    accessEvent: { create: mutate, createMany: mutate },
  };
  async function verify(
    credential: unknown = manual,
    user = 'guard',
    path = base,
  ) {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${await jwt.signAsync({ sub: user })}`)
      .send({ credential });
  }
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'verification-test-secret-with-at-least-32-bytes');
    const module = await Test.createTestingModule({
      imports: [AccessManagementModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    jwt = module.get(JwtService);
    await app.init();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    pass = fixture();
    gateStatus = 'ACTIVE';
    assignmentStatus = 'ACTIVE';
    assignmentEnd = null;
  });
  afterEach(() => {
    expect(mutate).not.toHaveBeenCalled();
  });
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it.each([manual, manual.toLowerCase(), ` ${manual} `, token, ` ${token} `])(
    'accepts manual and opaque token credentials: %s',
    async (credential) => {
      const before = structuredClone(pass);
      const response = await verify(credential);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        valid: true,
        status: 'VALID',
        visitor: { firstName: 'Jane', lastName: 'Doe' },
        host: { unit: { id: 'unit-a', name: 'Flat A', code: 'A' } },
        invitation: {
          purpose: 'Visit',
          validFrom: from.toISOString(),
          validUntil: until.toISOString(),
        },
      });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(pass).toEqual(before);
      expect(JSON.stringify(response.body).includes(token)).toBe(false);
      expect(JSON.stringify(response.body).includes(manual)).toBe(false);
    },
  );
  it('allows security supervisor', async () => {
    expect((await verify(manual, 'supervisor')).body.status).toBe('VALID');
  });
  it.each(['resident', 'elsewhere', 'manager'])(
    'rejects role/scope for %s before credential lookup',
    async (user) => {
      expect((await verify(manual, user)).status).toBe(403);
      expect(lookup).not.toHaveBeenCalled();
    },
  );
  it('rejects inactive or ended staff assignment', async () => {
    assignmentStatus = 'SUSPENDED';
    expect((await verify()).status).toBe(403);
    assignmentStatus = 'ACTIVE';
    assignmentEnd = new Date(0);
    expect((await verify()).status).toBe(403);
  });
  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post(base)
      .send({ credential: manual })
      .expect(401);
  });
  it.each(['missing', 'gate-b'])(
    'rejects nonexistent or wrong-estate gate %s',
    async (gateId) => {
      expect(
        (
          await verify(
            manual,
            'guard',
            `/estates/a/gates/${gateId}/access/verify`,
          )
        ).status,
      ).toBe(404);
      expect(lookup).not.toHaveBeenCalled();
    },
  );
  it('returns inactive gate without looking up credentials', async () => {
    gateStatus = 'INACTIVE';
    expect((await verify()).body).toEqual({
      valid: false,
      status: 'INACTIVE_GATE',
    });
    expect(lookup).not.toHaveBeenCalled();
  });
  it.each([
    'UNKNOWN1',
    'unknown-token',
    token.toLowerCase(),
    'pass-id',
    'invitation-id',
  ])('rejects unknown or altered credential %s', async (credential) => {
    expect((await verify(credential)).body).toEqual({
      valid: false,
      status: 'INVALID_CREDENTIAL',
    });
  });
  it.each([manual, token])(
    'uses the same state checks for %s',
    async (credential) => {
      const states = [
        'REVOKED',
        'EXPIRED',
        'NOT_YET_VALID',
        'CANCELLED',
        'COMPLETED',
        'USED',
        'WRONG_ESTATE',
      ];
      for (const status of states) {
        pass = fixture();
        if (status === 'REVOKED') pass.revokedAt = new Date();
        if (status === 'USED') pass.status = 'USED';
        if (status === 'EXPIRED')
          pass.validUntil = new Date('2021-01-01T00:00:00Z');
        if (status === 'NOT_YET_VALID')
          pass.validFrom = new Date('2098-01-01T00:00:00Z');
        if (status === 'CANCELLED' || status === 'COMPLETED')
          pass.invitation.status = status;
        if (status === 'WRONG_ESTATE') pass.invitation.estateId = 'b';
        const response = await verify(credential);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ valid: false, status });
      }
    },
  );
  it('rechecks current state on repeated verification', async () => {
    expect((await verify()).body.status).toBe('VALID');
    pass.invitation.status = 'CANCELLED';
    expect((await verify()).body.status).toBe('CANCELLED');
  });
  it('rejects inconsistent host-unit estate', async () => {
    pass.invitation.hostResidency.unit.estateId = 'b';
    expect((await verify()).body).toEqual({
      valid: false,
      status: 'WRONG_ESTATE',
    });
  });
  it.each([null, 123, [], {}, '', '   ', 'a'.repeat(257)])(
    'rejects malformed credential %j',
    async (credential) => {
      expect((await verify(credential)).status).toBe(400);
      expect(lookup).not.toHaveBeenCalled();
    },
  );
  it.each(['passId', 'invitationId', 'visitorId', 'estateId', 'gateId'])(
    'rejects extra body field %s',
    async (field) => {
      await request(app.getHttpServer())
        .post(base)
        .set('Authorization', `Bearer ${await jwt.signAsync({ sub: 'guard' })}`)
        .send({ credential: manual, [field]: 'injected' })
        .expect(400);
    },
  );
  it('fails closed on ambiguous credentials', async () => {
    lookup.mockResolvedValueOnce([pass, pass]);
    expect((await verify()).body).toEqual({
      valid: false,
      status: 'INVALID_CREDENTIAL',
    });
  });
  it('does not expose credential-bearing database errors', async () => {
    lookup.mockRejectedValueOnce(new Error(`Failure with secret ${token}`));
    const response = await verify(token);
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body).includes(token)).toBe(false);
  });
});
