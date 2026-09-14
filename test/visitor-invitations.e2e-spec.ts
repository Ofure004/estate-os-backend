import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { VisitorInvitationsModule } from '../src/visitor-invitations/visitor-invitations.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const residence = (id = 'r1', estateId = 'a') => ({
  id,
  unitId: `unit-${id}`,
  type: 'TENANT',
  status: 'ACTIVE',
  startedAt: null as Date | null,
  endedAt: null as Date | null,
  unit: { estateId },
});
const body = () => ({
  visitorFirstName: ' Jane ',
  visitorLastName: ' Doe ',
  validFrom: new Date(Date.now() - 1000).toISOString(),
  validUntil: new Date(Date.now() + 3600000).toISOString(),
});
type Invitation = {
  id: string;
  estateId: string;
  owner: string;
  status: string;
  validUntil: Date;
  createdAt: Date;
  [key: string]: unknown;
};

describe('Resident visitor invitations HTTP flow', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let residencies: ReturnType<typeof residence>[];
  let invitations: Invitation[];
  let concurrentStatus: string | undefined;
  const matches = (row: Invitation, where: any) =>
    row.estateId === where.estateId &&
    row.owner === where.hostResidency.userId &&
    (!where.id || row.id === where.id);
  const publicRow = (row: Invitation) => {
    const { owner: _owner, ...rest } = row;
    return rest;
  };
  const model = {
    create: vi.fn(async ({ data }) => {
      const row = {
        ...data,
        id: 'created',
        owner: 'resident',
        createdAt: new Date(),
        hostResidency: {
          id: data.hostResidencyId,
          unit: {
            id: `unit-${data.hostResidencyId}`,
            name: 'Unit',
            code: 'U1',
          },
        },
      };
      invitations.push(row);
      return publicRow(row);
    }),
    findMany: vi.fn(async ({ where }) =>
      invitations
        .filter((r) => matches(r, where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(publicRow),
    ),
    findFirst: vi.fn(async ({ where }) => {
      const row = invitations.find((r) => matches(r, where));
      return row ? publicRow(row) : null;
    }),
    findFirstOrThrow: vi.fn(async ({ where }) =>
      publicRow(invitations.find((r) => matches(r, where))!),
    ),
    updateMany: vi.fn(async ({ where, data }) => {
      const row = invitations.find((r) => matches(r, where));
      if (row && concurrentStatus) row.status = concurrentStatus;
      if (
        !row ||
        !where.status.in.includes(row.status) ||
        row.validUntil <= where.validUntil.gt
      )
        return { count: 0 };
      row.status = data.status;
      return { count: 1 };
    }),
  };
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where, select }) =>
        select.memberships
          ? {
              memberships: [],
              staffAssignments: [],
              residencies: where.id === 'resident' ? residencies : [],
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
    estate: {
      findUnique: vi.fn(async ({ where }) =>
        ['a', 'b'].includes(where.id) ? { organizationId: 'org' } : null,
      ),
    },
    visitorInvitation: model,
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        visitorInvitation: model,
        accessPass: {
          create: async () => ({}),
          updateMany: async () => ({ count: 0 }),
        },
      }),
  };
  async function call(
    method: 'get' | 'post' | 'patch',
    suffix = '',
    payload?: object,
    user = 'resident',
    estate = 'a',
  ) {
    const req = request(app.getHttpServer())
      [method](`/estates/${estate}/visitor-invitations${suffix}`)
      .set('Authorization', `Bearer ${await jwt.signAsync({ sub: user })}`);
    return payload === undefined ? req : req.send(payload);
  }
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'visitor-test-secret-with-at-least-32-bytes');
    const module = await Test.createTestingModule({
      imports: [VisitorInvitationsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    jwt = module.get(JwtService);
    await app.init();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    concurrentStatus = undefined;
    residencies = [residence()];
    invitations = [
      {
        id: 'mine',
        estateId: 'a',
        owner: 'resident',
        status: 'PENDING',
        validUntil: new Date(Date.now() + 3600000),
        createdAt: new Date(1000),
      },
      {
        id: 'other',
        estateId: 'a',
        owner: 'someone-else',
        status: 'ACTIVE',
        validUntil: new Date(Date.now() + 3600000),
        createdAt: new Date(2000),
      },
      {
        id: 'cross-estate',
        estateId: 'b',
        owner: 'resident',
        status: 'PENDING',
        validUntil: new Date(Date.now() + 3600000),
        createdAt: new Date(3000),
      },
    ];
  });
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('creates PENDING invitation with server-resolved host and trimmed fields', async () => {
    const response = await call('post', '', body());
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: 'PENDING',
      visitorFirstName: 'Jane',
      visitorLastName: 'Doe',
      hostResidency: { id: 'r1' },
    });
    expect(model.create.mock.calls[0][0].data).toMatchObject({
      estateId: 'a',
      hostResidencyId: 'r1',
      createdByUserId: 'resident',
      status: 'PENDING',
      visitorPhone: null,
    });
  });
  it('requires explicit selection with multiple active residencies', async () => {
    residencies.push(residence('r2'));
    const response = await call('post', '', body());
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      statusCode: 400,
      code: 'HOST_RESIDENCY_REQUIRED',
      message:
        'You have multiple active residencies in this estate. Provide hostResidencyId to select the unit you are hosting the visitor from.',
    });
    expect(model.create).not.toHaveBeenCalled();
    const selected = await call('post', '', {
      ...body(),
      hostResidencyId: 'r2',
    });
    expect(selected.status).toBe(201);
    expect(model.create.mock.calls[0][0].data.hostResidencyId).toBe('r2');
  });
  it.each(['someone-elses-residency', 'wrong-estate', 'ended'])(
    'rejects invalid selected host %s',
    async (hostResidencyId) => {
      residencies.push(residence('wrong-estate', 'b'), {
        ...residence('ended'),
        status: 'ENDED',
      });
      expect(
        (await call('post', '', { ...body(), hostResidencyId })).status,
      ).toBe(403);
      expect(model.create).not.toHaveBeenCalled();
    },
  );
  it('accepts a supplied valid sole residency', async () => {
    expect(
      (await call('post', '', { ...body(), hostResidencyId: 'r1' })).status,
    ).toBe(201);
  });
  it.each(['no-residency', 'inactive', 'future', 'ended', 'wrong-estate'])(
    'blocks all operations for %s residency',
    async (state) => {
      if (state === 'no-residency') residencies = [];
      if (state === 'inactive') residencies[0].status = 'PENDING';
      if (state === 'future')
        residencies[0].startedAt = new Date(Date.now() + 60000);
      if (state === 'ended')
        residencies[0].endedAt = new Date(Date.now() - 1000);
      if (state === 'wrong-estate') residencies[0].unit.estateId = 'b';
      expect((await call('post', '', body())).status).toBe(403);
      expect((await call('get')).status).toBe(403);
      expect((await call('get', '/mine')).status).toBe(403);
      expect((await call('patch', '/mine/cancel')).status).toBe(403);
    },
  );
  it.each(['estateId', 'createdByUserId', 'userId', 'status'])(
    'rejects client controlled %s',
    async (key) => {
      expect(
        (await call('post', '', { ...body(), [key]: 'injected' })).status,
      ).toBe(400);
      expect(model.create).not.toHaveBeenCalled();
    },
  );
  it.each([
    { visitorFirstName: '  ' },
    { visitorLastName: '' },
    { visitorPhone: 123 },
    { validFrom: '2026-01-01' },
    { validFrom: '2026-01-01T12:00:00' },
    { validFrom: 'not-a-date' },
    { validUntil: '2026-02-30T12:00:00Z' },
    { hostResidencyId: '' },
    { hostResidencyId: null },
  ])('rejects invalid DTO %j', async (fields) => {
    expect((await call('post', '', { ...body(), ...fields })).status).toBe(400);
  });
  it.each(['equal', 'reversed', 'past'])(
    'rejects %s validity window',
    async (state) => {
      const dto = body();
      if (state === 'equal') dto.validFrom = dto.validUntil;
      if (state === 'reversed')
        dto.validFrom = new Date(Date.now() + 7200000).toISOString();
      if (state === 'past') {
        dto.validFrom = '2020-01-01T00:00:00Z';
        dto.validUntil = '2020-01-02T00:00:00Z';
      }
      expect((await call('post', '', dto)).status).toBe(400);
      expect(model.create).not.toHaveBeenCalled();
    },
  );
  it('lists only own invitations in requested estate, newest first', async () => {
    invitations.push({
      ...invitations[0],
      id: 'newer',
      createdAt: new Date(4000),
    });
    const response = await call('get');
    expect(response.status).toBe(200);
    expect(response.body.map((i: Invitation) => i.id)).toEqual([
      'newer',
      'mine',
    ]);
  });
  it('views own detail', async () => {
    expect((await call('get', '/mine')).status).toBe(200);
  });
  it.each(['other', 'missing', 'cross-estate'])(
    'returns 404 for inaccessible invitation %s',
    async (id) => {
      expect((await call('get', `/${id}`)).status).toBe(404);
      expect((await call('patch', `/${id}/cancel`)).status).toBe(404);
      expect(model.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each(['PENDING', 'ACTIVE'])(
    'cancels own %s invitation',
    async (status) => {
      invitations[0].status = status;
      const response = await call('patch', '/mine/cancel');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('CANCELLED');
    },
  );
  it.each(['CANCELLED', 'COMPLETED', 'EXPIRED', 'effectively-expired'])(
    'rejects cancellation for %s',
    async (status) => {
      if (status === 'effectively-expired')
        invitations[0].validUntil = new Date(Date.now() - 1);
      else invitations[0].status = status;
      expect((await call('patch', '/mine/cancel')).status).toBe(409);
    },
  );
  it('does not overwrite a concurrent lifecycle change', async () => {
    concurrentStatus = 'COMPLETED';
    expect((await call('patch', '/mine/cancel')).status).toBe(409);
    expect(invitations[0].status).toBe('COMPLETED');
  });
  it('does not trust body status on the cancellation action', async () => {
    const response = await call('patch', '/mine/cancel', {
      status: 'ACTIVE',
      estateId: 'b',
    });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('CANCELLED');
  });
  it('requires authentication on every endpoint', async () => {
    const base = '/estates/a/visitor-invitations';
    await request(app.getHttpServer()).post(base).send(body()).expect(401);
    await request(app.getHttpServer()).get(base).expect(401);
    await request(app.getHttpServer()).get(`${base}/mine`).expect(401);
    await request(app.getHttpServer()).patch(`${base}/mine/cancel`).expect(401);
  });
});
