import 'reflect-metadata';
import { randomUUID, createHash } from 'node:crypto';
import { verify } from 'argon2';
import { OnboardingService } from '../src/onboarding/onboarding.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { OnboardingModule } from '../src/onboarding/onboarding.module.js';

describe.skipIf(process.env.RUN_ONBOARDING_DATABASE_TESTS !== '1')(
  'Onboarding with PostgreSQL',
  () => {
    let prisma: PrismaService;
    let service: OnboardingService;
    let app: INestApplication;
    let jwt: JwtService;
    const suffix = randomUUID();
    const orgId = `onboarding-org-${suffix}`;
    const estateId = `onboarding-estate-${suffix}`;
    const unitId = `onboarding-unit-${suffix}`;
    const managerId = `onboarding-manager-${suffix}`;
    const email = (name: string) => `${name}-${suffix}@example.com`;
    const context: AuthorizationContext = {
      userId: managerId,
      organizationId: orgId,
      estateId,
      roles: ['ORG_ADMIN'],
      membership: { id: 'test', role: 'ADMIN' },
      staffAssignments: [],
      residencies: [],
    };
    beforeAll(async () => {
      process.env.JWT_SECRET = 'onboarding-test-secret-with-at-least-32-bytes';
      prisma = new PrismaService();
      await prisma.$connect();
      service = new OnboardingService(prisma);
      await prisma.organization.create({
        data: {
          id: orgId,
          name: 'Onboarding Test',
          slug: `onboarding-${suffix}`,
        },
      });
      await prisma.estate.create({
        data: {
          id: estateId,
          organizationId: orgId,
          name: 'Test Estate',
          slug: 'estate',
        },
      });
      await prisma.unit.create({
        data: { id: unitId, estateId, name: 'Flat A', code: 'A' },
      });
      await prisma.user.create({
        data: { id: managerId, email: email('manager') },
      });
      await prisma.organizationMembership.create({
        data: {
          userId: managerId,
          organizationId: orgId,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
      const module = await Test.createTestingModule({
        imports: [OnboardingModule],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      app = module.createNestApplication();
      await app.init();
      jwt = module.get(JwtService);
    });
    afterAll(async () => {
      if (!prisma) return;
      try {
        if (app) await app.close();
        await prisma.userInvitation.deleteMany({
          where: { organizationId: orgId },
        });
        await prisma.residency.deleteMany({ where: { unitId } });
        await prisma.staffAssignment.deleteMany({ where: { estateId } });
        await prisma.organizationMembership.deleteMany({
          where: { organizationId: orgId },
        });
        await prisma.user.deleteMany({
          where: { email: { endsWith: `-${suffix}@example.com` } },
        });
        await prisma.unit.deleteMany({ where: { id: unitId } });
        await prisma.estate.deleteMany({ where: { id: estateId } });
        await prisma.organization.deleteMany({ where: { id: orgId } });
      } finally {
        await prisma.$disconnect();
      }
    });

    it('enforces HTTP authorization and rejects recipient-controlled fields', async () => {
      const bearer = `Bearer ${await jwt.signAsync({ sub: managerId })}`;
      await request(app.getHttpServer())
        .post(`/estates/${estateId}/onboarding/resident-invitations`)
        .send({ email: email('http'), unitId, residencyType: 'TENANT' })
        .expect(401);
      await request(app.getHttpServer())
        .post(`/estates/${estateId}/onboarding/resident-invitations`)
        .set('Authorization', bearer)
        .send({
          email: email('http'),
          unitId,
          residencyType: 'TENANT',
          userId: managerId,
        })
        .expect(400);
      await request(app.getHttpServer())
        .post('/estates/other-estate/onboarding/resident-invitations')
        .set('Authorization', bearer)
        .send({ email: email('http'), unitId, residencyType: 'TENANT' })
        .expect(403);
      const created = await request(app.getHttpServer())
        .post(`/estates/${estateId}/onboarding/resident-invitations`)
        .set('Authorization', bearer)
        .send({ email: email('http'), unitId, residencyType: 'TENANT' })
        .expect(201);
      expect(created.body.inviteToken).toBeTruthy();
      const lookedUp = await request(app.getHttpServer())
        .get(`/onboarding/invitations/${created.body.inviteToken}`)
        .expect(200);
      expect(lookedUp.body).toMatchObject({
        email: email('http'),
        existingUser: false,
      });
      expect(lookedUp.body.tokenHash).toBeUndefined();
      await request(app.getHttpServer())
        .post(`/onboarding/invitations/${created.body.inviteToken}/accept`)
        .send({
          firstName: 'HTTP',
          lastName: 'User',
          password: 'StrongPassword123!',
          role: 'ESTATE_MANAGER',
        })
        .expect(400);
    });

    it('creates a secure resident invitation and provisions a new account once', async () => {
      const created = await service.createResident(context, {
        email: email('resident'),
        unitId,
        residencyType: 'TENANT',
      });
      expect(created.inviteToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = await prisma.userInvitation.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(stored.tokenHash).toBe(
        createHash('sha256').update(created.inviteToken!).digest('hex'),
      );
      expect(JSON.stringify(stored)).not.toContain(created.inviteToken!);
      expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(stored.organizationId).toBe(orgId);
      expect(stored.unitId).toBe(unitId);
      expect(stored.residencyType).toBe('TENANT');
      await expect(
        service.createResident(context, {
          email: email('resident'),
          unitId,
          residencyType: 'TENANT',
        }),
      ).rejects.toMatchObject({ status: 409 });
      const lookup = await service.lookup(created.inviteToken!);
      expect(lookup).toMatchObject({
        type: 'RESIDENT',
        existingUser: false,
        unit: { id: unitId, code: 'A' },
      });
      expect(JSON.stringify(lookup)).not.toContain('tokenHash');
      const outcomes = await Promise.allSettled([
        service.accept(created.inviteToken!, undefined, {
          firstName: 'Jane',
          lastName: 'Doe',
          password: 'StrongPassword123!',
        }),
        service.accept(created.inviteToken!, undefined, {
          firstName: 'Jane',
          lastName: 'Doe',
          password: 'StrongPassword123!',
        }),
      ]);
      expect(
        outcomes.filter((outcome) => outcome.status === 'fulfilled'),
      ).toHaveLength(1);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: email('resident') },
      });
      expect(await verify(user.passwordHash!, 'StrongPassword123!')).toBe(true);
      expect(
        await prisma.residency.count({
          where: { userId: user.id, unitId, status: 'ACTIVE' },
        }),
      ).toBe(1);
      expect(
        (
          await prisma.userInvitation.findUniqueOrThrow({
            where: { id: created.id },
          })
        ).acceptedAt,
      ).toBeTruthy();
      await expect(service.revoke(context, created.id)).rejects.toMatchObject({
        status: 409,
      });
      await expect(service.lookup(created.inviteToken!)).rejects.toMatchObject({
        status: 409,
      });
      await expect(service.lookup('invalid-token')).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        service.createResident(context, {
          email: email('resident'),
          unitId,
          residencyType: 'TENANT',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('requires the matching signed-in account for staff acceptance', async () => {
      const recipient = await prisma.user.create({
        data: { email: email('staff') },
      });
      const created = await service.createStaff(context, {
        email: recipient.email,
        role: 'GUARD',
      });
      expect((await service.lookup(created.inviteToken!)).existingUser).toBe(
        true,
      );
      await expect(service.accept(created.inviteToken!)).rejects.toMatchObject({
        status: 401,
      });
      await expect(
        service.accept(created.inviteToken!, managerId),
      ).rejects.toMatchObject({ status: 403 });
      await service.accept(created.inviteToken!, recipient.id);
      expect(
        await prisma.staffAssignment.count({
          where: {
            userId: recipient.id,
            estateId,
            role: 'GUARD',
            status: 'ACTIVE',
          },
        }),
      ).toBe(1);
      await expect(
        service.createStaff(context, { email: recipient.email, role: 'GUARD' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('enforces role assignment, expiry, revocation, and estate scope', async () => {
      const supervisor = {
        ...context,
        roles: ['SECURITY_SUPERVISOR' as const],
      };
      await expect(
        service.createStaff(supervisor, {
          email: email('bad-role'),
          role: 'ESTATE_MANAGER',
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.createResident(context, {
          email: email('bad-unit'),
          unitId: 'missing',
          residencyType: 'TENANT',
        }),
      ).rejects.toMatchObject({ status: 400 });
      const created = await service.createStaff(context, {
        email: email('revoked'),
        role: 'GUARD',
      });
      await expect(
        service.revoke({ ...context, estateId: 'other-estate' }, created.id),
      ).rejects.toMatchObject({ status: 404 });
      const revoked = await service.revoke(context, created.id);
      expect(revoked.revokedAt).toBeTruthy();
      await expect(
        service.accept(created.inviteToken!, undefined, {
          firstName: 'A',
          lastName: 'B',
          password: 'StrongPassword123!',
        }),
      ).rejects.toMatchObject({ status: 409 });
      const expiring = await service.createResident(context, {
        email: email('expired'),
        unitId,
        residencyType: 'OCCUPANT',
      });
      await prisma.userInvitation.update({
        where: { id: expiring.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(service.lookup(expiring.inviteToken!)).rejects.toMatchObject(
        { status: 410 },
      );
      await expect(
        service.accept(expiring.inviteToken!, undefined, {
          firstName: 'A',
          lastName: 'B',
          password: 'StrongPassword123!',
        }),
      ).rejects.toMatchObject({ status: 410 });
    });

    it('rolls back a new user if relationship creation fails', async () => {
      const recipient = email('rollback');
      const created = await service.createResident(context, {
        email: recipient,
        unitId,
        residencyType: 'DEPENDENT',
      });
      const failingPrisma = {
        $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
          prisma.$transaction((tx) =>
            callback(
              new Proxy(tx, {
                get(target, property, receiver) {
                  if (property === 'residency')
                    return new Proxy(tx.residency, {
                      get(delegate, method, delegateReceiver) {
                        if (method === 'create')
                          return async () => {
                            throw new Error('Injected relationship failure');
                          };
                        return Reflect.get(delegate, method, delegateReceiver);
                      },
                    });
                  return Reflect.get(target, property, receiver);
                },
              }),
            ),
          ),
      } as unknown as PrismaService;
      await expect(
        new OnboardingService(failingPrisma).accept(
          created.inviteToken!,
          undefined,
          {
            firstName: 'Rollback',
            lastName: 'Test',
            password: 'StrongPassword123!',
          },
        ),
      ).rejects.toThrow('Injected relationship failure');
      expect(
        await prisma.user.findUnique({ where: { email: recipient } }),
      ).toBeNull();
      expect(
        (
          await prisma.userInvitation.findUniqueOrThrow({
            where: { id: created.id },
          })
        ).status,
      ).toBe('PENDING');
    });

    it('serializes concurrent creation of the same invitation', async () => {
      const recipient = email('concurrent');
      const results = await Promise.allSettled([
        service.createStaff(context, {
          email: recipient,
          role: 'FACILITY_MANAGER',
        }),
        service.createStaff(context, {
          email: recipient,
          role: 'FACILITY_MANAGER',
        }),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        await prisma.userInvitation.count({
          where: { email: recipient, status: 'PENDING' },
        }),
      ).toBe(1);
    });
  },
);
