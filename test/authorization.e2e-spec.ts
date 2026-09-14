import 'reflect-metadata';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AuthorizationModule } from '../src/authorization/authorization.module.js';
import { Authorize } from '../src/authorization/authorize.decorator.js';
import { AuthorizationGuard } from '../src/authorization/authorization.guard.js';
import { AuthorizationService } from '../src/authorization/authorization.service.js';
import type { AuthorizedRequest } from '../src/authorization/authorization.types.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type {
  OrganizationRole,
  StaffRole,
} from '../src/generated/prisma/enums.js';

@Controller('test')
class ScopeController {
  @Get('estates/:estateId/resident')
  @Authorize({ scope: 'estate', roles: ['RESIDENT'] })
  resident(@Req() req: AuthorizedRequest) {
    return req.authorization;
  }

  @Get('estates/:estateId/guard')
  @Authorize({ scope: 'estate', roles: ['GUARD'] })
  guard(@Req() req: AuthorizedRequest) {
    return req.authorization;
  }

  @Get('estates/:estateId/manage')
  @Authorize({
    scope: 'estate',
    roles: ['ESTATE_MANAGER', 'ORG_ADMIN', 'ORG_OWNER'],
  })
  manage(@Req() req: AuthorizedRequest) {
    return req.authorization;
  }

  @Get('organizations/:organizationId/admin')
  @Authorize({ scope: 'organization', roles: ['ORG_ADMIN', 'ORG_OWNER'] })
  admin(@Req() req: AuthorizedRequest) {
    return req.authorization;
  }

  @Get('organizations/:organizationId/member')
  @Authorize({ scope: 'organization', roles: ['ORG_MEMBER'] })
  member(@Req() req: AuthorizedRequest) {
    return req.authorization;
  }

  @Get('organizations/:organizationId/estates/:estateId/manage')
  @Authorize({
    scope: 'estate',
    roles: ['ESTATE_MANAGER', 'ORG_ADMIN'],
    organizationParam: 'organizationId',
  })
  nested(@Req() req: AuthorizedRequest) {
    return req.authorization;
  }

  @Get('estates/:estateId/units/:unitId')
  @Authorize({
    scope: 'estate',
    roles: ['RESIDENT', 'ORG_ADMIN'],
    resource: { kind: 'unit', param: 'unitId' },
  })
  unit() {
    return { allowed: true };
  }

  @Get('organizations/:organizationId/units/:unitId')
  @Authorize({
    scope: 'organization',
    roles: ['ORG_ADMIN'],
    resource: { kind: 'unit', param: 'unitId' },
  })
  organizationUnit() {
    return { allowed: true };
  }

  @Get('missing-scope')
  @Authorize({ scope: 'estate', roles: ['RESIDENT'] })
  missingScope() {
    return {};
  }

  @Get('no-roles/:estateId')
  @Authorize({ scope: 'estate', roles: [] })
  noRoles() {
    return {};
  }

  @Get('missing-policy')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  missingPolicy() {
    return {};
  }
}

const estates: Record<string, string> = { a: 'org-a', b: 'org-a', c: 'org-b' };
const membership = (
  role: OrganizationRole,
  organizationId = 'org-a',
  status = 'ACTIVE',
) => ({ id: `membership-${organizationId}`, role, organizationId, status });
const staff = (role: StaffRole, estateId = 'a') => ({
  id: `staff-${estateId}`,
  role,
  estateId,
  status: 'ACTIVE',
  startedAt: null as Date | null,
  endedAt: null as Date | null,
});
const residency = (estateId = 'a') => ({
  id: `residency-${estateId}`,
  unitId: `unit-${estateId}`,
  type: 'OWNER' as const,
  status: 'ACTIVE',
  startedAt: null as Date | null,
  endedAt: null as Date | null,
  unit: { estateId },
});
type Relationships = {
  memberships: ReturnType<typeof membership>[];
  staffAssignments: ReturnType<typeof staff>[];
  residencies: ReturnType<typeof residency>[];
};
const empty = (): Relationships => ({
  memberships: [],
  staffAssignments: [],
  residencies: [],
});

// Only Prisma is replaced; JWT verification, guards, role resolution and HTTP routing are real.
describe('Role and scope enforcement', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let service: AuthorizationService;
  let users: Record<string, Relationships>;
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where, select }) => {
        if (!users[where.id]) return null;
        return select.memberships
          ? users[where.id]
          : {
              id: where.id,
              email: `${where.id}@example.com`,
              firstName: null,
              lastName: null,
              phone: null,
            };
      }),
    },
    estate: {
      findUnique: vi.fn(async ({ where }) =>
        estates[where.id] ? { organizationId: estates[where.id] } : null,
      ),
    },
    unit: {
      findFirst: vi.fn(async ({ where }) => {
        const estateId = where.id.replace('unit-', '');
        return estates[estateId] &&
          estates[estateId] === where.estate.organizationId &&
          (!where.estate.id || estateId === where.estate.id)
          ? { id: where.id }
          : null;
      }),
    },
  };
  const get = async (path: string, userId = 'resident') =>
    request(app.getHttpServer())
      .get(`/test/${path}`)
      .set('Authorization', `Bearer ${await jwt.signAsync({ sub: userId })}`);

  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'authorization-test-secret-at-least-32-bytes');
    const module = await Test.createTestingModule({
      imports: [AuthorizationModule],
      controllers: [ScopeController],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    jwt = module.get(JwtService);
    service = module.get(AuthorizationService);
    await app.init();
  });
  beforeEach(() => {
    users = {
      resident: { ...empty(), residencies: [residency()] },
      guard: { ...empty(), staffAssignments: [staff('GUARD')] },
      manager: { ...empty(), staffAssignments: [staff('ESTATE_MANAGER')] },
      admin: { ...empty(), memberships: [membership('ADMIN')] },
      owner: { ...empty(), memberships: [membership('OWNER')] },
      member: { ...empty(), memberships: [membership('MEMBER')] },
      outsider: empty(),
    };
  });
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it.each([
    ['resident', 'resident', 200],
    ['resident', 'guard', 403],
    ['resident', 'manage', 403],
    ['guard', 'resident', 403],
    ['guard', 'guard', 200],
    ['guard', 'manage', 403],
    ['manager', 'resident', 403],
    ['manager', 'guard', 403],
    ['manager', 'manage', 200],
    ['admin', 'resident', 403],
    ['admin', 'guard', 403],
    ['admin', 'manage', 200],
    ['owner', 'manage', 200],
    ['member', 'manage', 403],
    ['outsider', 'resident', 403],
  ])(
    '%s accessing estate route %s returns %i',
    async (userId, route, status) => {
      expect((await get(`estates/a/${route}`, userId)).status).toBe(status);
    },
  );

  it.each(['resident', 'guard', 'manager'])(
    'blocks %s in other estates even in the same organization',
    async (userId) => {
      const route = { resident: 'resident', guard: 'guard', manager: 'manage' }[
        userId
      ];
      for (const estateId of ['b', 'c'])
        expect((await get(`estates/${estateId}/${route}`, userId)).status).toBe(
          403,
        );
    },
  );

  it.each(['admin', 'owner'])(
    'allows %s throughout its organization only',
    async (userId) => {
      expect((await get('estates/b/manage', userId)).status).toBe(200);
      expect((await get('estates/c/manage', userId)).status).toBe(403);
      expect((await get('organizations/org-a/admin', userId)).status).toBe(200);
      expect((await get('organizations/org-b/admin', userId)).status).toBe(403);
    },
  );

  it.each(['resident', 'guard', 'manager', 'member'])(
    'does not promote %s to organization admin',
    async (userId) => {
      expect((await get('organizations/org-a/admin', userId)).status).toBe(403);
    },
  );

  it('allows an organization member only in the matching organization', async () => {
    expect((await get('organizations/org-a/member', 'member')).status).toBe(
      200,
    );
    expect((await get('organizations/org-b/member', 'member')).status).toBe(
      403,
    );
  });

  it('keeps resident ownership separate from organization ownership', async () => {
    const response = await get('estates/a/resident');
    expect(response.body.roles).toEqual(['RESIDENT']);
    expect(response.body.residencies).toEqual([
      { id: 'residency-a', unitId: 'unit-a', type: 'OWNER' },
    ]);
  });

  it.each(['INVITED', 'SUSPENDED'])(
    'rejects %s organization membership',
    async (status) => {
      users.admin.memberships[0].status = status;
      expect((await get('estates/a/manage', 'admin')).status).toBe(403);
      expect((await get('organizations/org-a/admin', 'admin')).status).toBe(
        403,
      );
    },
  );

  it.each(['PENDING', 'ENDED', 'SUSPENDED'])(
    'rejects inactive relationships: %s',
    async (status) => {
      users.resident.residencies[0].status = status;
      users.guard.staffAssignments[0].status = status;
      expect((await get('estates/a/resident')).status).toBe(403);
      expect((await get('estates/a/guard', 'guard')).status).toBe(403);
    },
  );

  it.each(['future', 'ended'])(
    'rejects %s staff assignments and residencies',
    async (state) => {
      const dates =
        state === 'future'
          ? { startedAt: new Date(Date.now() + 60_000) }
          : { endedAt: new Date(Date.now() - 60_000) };
      Object.assign(users.resident.residencies[0], dates);
      Object.assign(users.guard.staffAssignments[0], dates);
      expect((await get('estates/a/resident')).status).toBe(403);
      expect((await get('estates/a/guard', 'guard')).status).toBe(403);
    },
  );

  it('accepts relationships within their effective dates', async () => {
    const dates = {
      startedAt: new Date(Date.now() - 60_000),
      endedAt: new Date(Date.now() + 60_000),
    };
    Object.assign(users.resident.residencies[0], dates);
    Object.assign(users.guard.staffAssignments[0], dates);
    expect((await get('estates/a/resident')).status).toBe(200);
    expect((await get('estates/a/guard', 'guard')).status).toBe(200);
  });

  it('does not combine roles from unrelated estates or organizations', async () => {
    users.resident.staffAssignments.push(staff('GUARD', 'b'));
    users.resident.memberships.push(membership('ADMIN', 'org-b'));
    expect((await get('estates/a/guard')).status).toBe(403);
    expect((await get('estates/b/guard')).status).toBe(200);
    expect((await get('estates/b/resident')).status).toBe(403);
    expect((await get('estates/a/manage')).status).toBe(403);
    expect((await get('estates/c/manage')).status).toBe(200);
  });

  it('accepts any allowed role in the same estate', async () => {
    users.resident.staffAssignments.push(staff('GUARD'));
    expect((await get('estates/a/guard')).body.roles).toEqual([
      'GUARD',
      'RESIDENT',
    ]);
  });

  it('rejects mismatched nested organization and estate IDs', async () => {
    expect(
      (await get('organizations/org-a/estates/a/manage', 'admin')).status,
    ).toBe(200);
    expect(
      (await get('organizations/org-b/estates/a/manage', 'admin')).status,
    ).toBe(403);
    expect(
      (await get('organizations/org-a/estates/c/manage', 'admin')).status,
    ).toBe(403);
  });

  it('rejects resources from another estate or organization', async () => {
    expect((await get('estates/a/units/unit-a')).status).toBe(200);
    for (const id of ['unit-b', 'unit-c', 'missing'])
      expect((await get(`estates/a/units/${id}`)).status).toBe(403);
    expect(
      (await get('organizations/org-a/units/unit-b', 'admin')).status,
    ).toBe(200);
    expect(
      (await get('organizations/org-a/units/unit-c', 'admin')).status,
    ).toBe(403);
  });

  it('rechecks relationships after revocation with the same token', async () => {
    const token = await jwt.signAsync({ sub: 'guard' });
    const call = () =>
      request(app.getHttpServer())
        .get('/test/estates/a/guard')
        .set('Authorization', `Bearer ${token}`);
    expect((await call()).status).toBe(200);
    users.guard.staffAssignments[0].status = 'SUSPENDED';
    expect((await call()).status).toBe(403);
  });

  it.each([
    'missing-scope',
    'missing-policy',
    'no-roles/a',
    'estates/missing/resident',
  ])('fails closed on %s', async (path) => {
    expect((await get(path)).status).toBe(403);
  });

  it('rejects unauthenticated requests before resolving authorization', async () => {
    await request(app.getHttpServer())
      .get('/test/estates/a/resident')
      .expect(401);
  });

  it('scope filters cannot be overridden by caller filters', async () => {
    const context = await service.authorize(
      'resident',
      { estateId: 'a' },
      { scope: 'estate', roles: ['RESIDENT'] },
    );
    expect(service.estateWhere(context, { estateId: 'b' })).toEqual({
      AND: [{ estateId: 'a' }, { estateId: 'b' }],
    });
    expect(() => service.organizationWhere(context, {})).toThrow();
    const org = await service.authorize(
      'admin',
      { organizationId: 'org-a' },
      { scope: 'organization', roles: ['ORG_ADMIN'] },
    );
    expect(() => service.estateWhere(org, {})).toThrow();
    expect(service.organizationWhere(org, { organizationId: 'org-b' })).toEqual(
      { AND: [{ organizationId: 'org-a' }, { organizationId: 'org-b' }] },
    );
  });
});
