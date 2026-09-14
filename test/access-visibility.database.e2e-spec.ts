import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AccessManagementModule } from '../src/access-management/access-management.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { AccessEventType } from '../src/generated/prisma/enums.js';

// Uses isolated estates and organizations; requires only the standard demo users.
describe.skipIf(process.env.ACCESS_PASS_DATABASE_TEST !== '1')(
  'Access visibility PostgreSQL',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let jwt: JwtService;
    const marker = `visibility-${randomUUID()}`;
    const orgs: string[] = [];
    const estates: string[] = [];
    const gates: string[] = [];
    const residences: string[] = [];
    let assignment: string;
    let sequence = 0;
    async function get(
      route: string,
      user = 'seed_user_manager',
      estate = estates[0],
    ) {
      return request(app.getHttpServer())
        .get(`/estates/${estate}/access/${route}`)
        .set('Authorization', `Bearer ${await jwt.signAsync({ sub: user })}`);
    }
    async function visit(estate = 0, host = estate) {
      const invitation = await prisma.visitorInvitation.create({
        data: {
          estateId: estates[estate],
          hostResidencyId: residences[host],
          createdByUserId: 'seed_user_tenant',
          visitorFirstName: 'Visitor',
          visitorLastName: String(++sequence),
          purpose: marker,
          validFrom: new Date(0),
          validUntil: new Date('2035-01-01'),
          pass: {
            create: {
              code: randomUUID(),
              token: randomUUID(),
              validFrom: new Date(0),
              validUntil: new Date('2035-01-01'),
            },
          },
        },
        include: { pass: true },
      });
      return invitation;
    }
    async function event(
      passId: string,
      type: AccessEventType,
      time: number,
      estate = 0,
      gate = estate,
      id?: string,
    ) {
      return prisma.accessEvent.create({
        data: {
          ...(id ? { id } : {}),
          passId,
          estateId: estates[estate],
          gateId: gates[gate],
          actorId: 'seed_user_manager',
          type,
          createdAt: new Date(time),
        },
      });
    }
    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AccessManagementModule],
      }).compile();
      app = module.createNestApplication();
      app.useLogger(false);
      prisma = module.get(PrismaService);
      jwt = module.get(JwtService);
      await app.init();
      for (let i = 0; i < 2; i++) {
        const org = await prisma.organization.create({
          data: { name: marker, slug: `${marker}-${i}` },
        });
        orgs.push(org.id);
        const estate = await prisma.estate.create({
          data: { name: marker, slug: marker, organizationId: org.id },
        });
        estates.push(estate.id);
        const gate = await prisma.gate.create({
          data: { estateId: estate.id, name: 'Main Gate', code: 'MAIN' },
        });
        gates.push(gate.id);
        const unit = await prisma.unit.create({
          data: { estateId: estate.id, name: 'Flat A', code: 'A' },
        });
        const residence = await prisma.residency.create({
          data: { userId: 'seed_user_tenant', unitId: unit.id, type: 'TENANT' },
        });
        residences.push(residence.id);
      }
      assignment = (
        await prisma.staffAssignment.create({
          data: {
            userId: 'seed_user_manager',
            estateId: estates[0],
            role: 'GUARD',
          },
        })
      ).id;
      await prisma.organizationMembership.create({
        data: {
          userId: 'seed_user_owner',
          organizationId: orgs[0],
          role: 'ADMIN',
        },
      });
    });
    beforeEach(async () => {
      await prisma.accessEvent.deleteMany({
        where: { estateId: { in: estates } },
      });
      await prisma.visitorInvitation.deleteMany({
        where: { estateId: { in: estates } },
      });
      await prisma.staffAssignment.update({
        where: { id: assignment },
        data: { role: 'GUARD', status: 'ACTIVE', endedAt: null },
      });
    });
    afterAll(async () => {
      if (prisma) {
        await prisma.accessEvent.deleteMany({
          where: { estateId: { in: estates } },
        });
        await prisma.visitorInvitation.deleteMany({
          where: { estateId: { in: estates } },
        });
        await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
      }
      await app?.close();
    });
    it('returns normal empty collections', async () => {
      expect((await get('onsite')).body).toEqual([]);
      expect((await get('activity')).body).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    });
    it('derives latest presence including historical re-entry and ignores DENIED', async () => {
      const inside = await visit();
      const outside = await visit();
      const reentry = await visit();
      await visit();
      await event(inside.pass!.id, 'CHECK_IN', 1000);
      await event(inside.pass!.id, 'DENIED', 9000);
      await event(outside.pass!.id, 'CHECK_IN', 2000);
      await event(outside.pass!.id, 'CHECK_OUT', 3000);
      await event(reentry.pass!.id, 'CHECK_IN', 1000);
      await event(reentry.pass!.id, 'CHECK_OUT', 4000);
      await event(reentry.pass!.id, 'CHECK_IN', 5000);
      const response = await get('onsite');
      expect(response.status).toBe(200);
      expect(
        response.body.map((row: { invitationId: string }) => row.invitationId),
      ).toEqual([reentry.id, inside.id]);
      expect(response.body[0]).toMatchObject({
        visitor: { firstName: 'Visitor' },
        host: { unit: { name: 'Flat A', code: 'A' } },
        entryGate: { id: gates[0], name: 'Main Gate', code: 'MAIN' },
        checkedInAt: new Date(5000).toISOString(),
      });
      expect(JSON.stringify(response.body).includes(inside.pass!.token)).toBe(
        false,
      );
      expect(JSON.stringify(response.body).includes(inside.pass!.code)).toBe(
        false,
      );
    });
    it('uses event ID to resolve timestamp ties deterministically', async () => {
      const row = await visit();
      await event(row.pass!.id, 'CHECK_IN', 1000, 0, 0, `${marker}-tie-a`);
      await event(row.pass!.id, 'CHECK_OUT', 1000, 0, 0, `${marker}-tie-b`);
      expect((await get('onsite')).body).toEqual([]);
    });
    it('keeps physically present visitors visible despite lifecycle invalidation', async () => {
      const row = await visit();
      await event(row.pass!.id, 'CHECK_IN', 1000);
      await prisma.visitorInvitation.update({
        where: { id: row.id },
        data: { status: 'CANCELLED', validUntil: new Date(0) },
      });
      await prisma.accessPass.update({
        where: { id: row.pass!.id },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          validUntil: new Date(0),
        },
      });
      expect(
        (await get('onsite')).body.map(
          (r: { invitationId: string }) => r.invitationId,
        ),
      ).toEqual([row.id]);
    });
    it('excludes foreign and inconsistent nested relationships', async () => {
      const local = await visit();
      const foreign = await visit(1);
      const badHost = await visit(0, 1);
      await event(local.pass!.id, 'CHECK_IN', 1000, 0, 1);
      await event(foreign.pass!.id, 'CHECK_IN', 2000, 1, 1);
      await event(foreign.pass!.id, 'CHECK_IN', 3000, 0, 0);
      await event(badHost.pass!.id, 'CHECK_IN', 4000);
      expect((await get('onsite')).body).toEqual([]);
      expect((await get('activity')).body.meta.total).toBe(0);
    });
    it('does not resurrect old presence when the latest event has inconsistent scope', async () => {
      const row = await visit();
      await event(row.pass!.id, 'CHECK_IN', 1000);
      await event(row.pass!.id, 'CHECK_OUT', 2000, 1, 1);
      expect((await get('onsite')).body).toEqual([]);
    });
    it('paginates activity with stable ties and accurate totals', async () => {
      const row = await visit();
      const ids = [];
      for (const suffix of ['a', 'b', 'c'])
        ids.push(
          (
            await event(
              row.pass!.id,
              suffix === 'b' ? 'CHECK_OUT' : 'CHECK_IN',
              1000,
              0,
              0,
              `${marker}-${suffix}`,
            )
          ).id,
        );
      await event(row.pass!.id, 'DENIED', 2000);
      const first = await get('activity?page=1&limit=2');
      const second = await get('activity?page=2&limit=2');
      expect(first.body.data.map((r: { id: string }) => r.id)).toEqual([
        ids[2],
        ids[1],
      ]);
      expect(second.body.data.map((r: { id: string }) => r.id)).toEqual([
        ids[0],
      ]);
      expect(first.body.meta).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
      expect((await get('activity?page=3&limit=2')).body.data).toEqual([]);
      expect(first.body.data[0]).toMatchObject({
        type: 'CHECK_IN',
        visitor: { firstName: 'Visitor' },
        host: { unit: { code: 'A' } },
        gate: { id: gates[0] },
        performedBy: { id: 'seed_user_manager' },
      });
      expect(Object.keys(first.body.data[0].performedBy).sort()).toEqual([
        'firstName',
        'id',
        'lastName',
      ]);
      expect(JSON.stringify(first.body).includes(row.pass!.token)).toBe(false);
    });
    it('filters by type and scoped gate, including inactive historical gates', async () => {
      const row = await visit();
      await event(row.pass!.id, 'CHECK_IN', 1000);
      await event(row.pass!.id, 'CHECK_OUT', 2000);
      expect(
        (await get('activity?type=CHECK_IN')).body.data.map(
          (r: { type: string }) => r.type,
        ),
      ).toEqual(['CHECK_IN']);
      expect(
        (await get('activity?type=CHECK_OUT')).body.data.map(
          (r: { type: string }) => r.type,
        ),
      ).toEqual(['CHECK_OUT']);
      await prisma.gate.update({
        where: { id: gates[0] },
        data: { status: 'INACTIVE' },
      });
      expect((await get(`activity?gateId=${gates[0]}`)).body.meta.total).toBe(
        2,
      );
      expect((await get(`activity?gateId=${gates[1]}`)).status).toBe(404);
      expect((await get('activity?gateId=missing')).status).toBe(404);
    });
    it.each(['GUARD', 'SECURITY_SUPERVISOR', 'ESTATE_MANAGER'] as const)(
      'permits %s only in its assigned estate',
      async (role) => {
        await prisma.staffAssignment.update({
          where: { id: assignment },
          data: { role },
        });
        for (const endpoint of ['onsite', 'activity']) {
          expect((await get(endpoint)).status).toBe(200);
          expect(
            (await get(endpoint, 'seed_user_manager', estates[1])).status,
          ).toBe(403);
        }
      },
    );
    it('rejects residents, organization-only admins, inactive and unrelated staff roles', async () => {
      for (const endpoint of ['onsite', 'activity']) {
        expect((await get(endpoint, 'seed_user_tenant')).status).toBe(403);
        expect((await get(endpoint, 'seed_user_owner')).status).toBe(403);
        await request(app.getHttpServer())
          .get(`/estates/${estates[0]}/access/${endpoint}`)
          .expect(401);
      }
      for (const data of [
        { status: 'SUSPENDED' as const },
        { status: 'ACTIVE' as const, role: 'FACILITY_MANAGER' as const },
        { role: 'GUARD' as const, endedAt: new Date(0) },
      ]) {
        await prisma.staffAssignment.update({
          where: { id: assignment },
          data,
        });
        expect((await get('onsite')).status).toBe(403);
        expect((await get('activity')).status).toBe(403);
      }
    });
    it('does not modify any event, pass or invitation', async () => {
      const row = await visit();
      await event(row.pass!.id, 'CHECK_IN', 1000);
      const before = await prisma.visitorInvitation.findUniqueOrThrow({
        where: { id: row.id },
        include: { pass: { include: { events: true } } },
      });
      await get('onsite');
      await get('activity');
      expect(
        await prisma.visitorInvitation.findUniqueOrThrow({
          where: { id: row.id },
          include: { pass: { include: { events: true } } },
        }),
      ).toEqual(before);
    });
  },
);
