import { AccessManagementModule } from '../src/access-management/access-management.module.js';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { VisitorInvitationsModule } from '../src/visitor-invitations/visitor-invitations.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AccessPassService } from '../src/access-passes/access-passes.service.js';
import * as credentials from '../src/access-passes/access-pass-credentials.js';

// Opt in against a migrated development database with the standard demo seed.
// All invitations and the extra estate created here are removed after the suite.
describe.skipIf(process.env.ACCESS_PASS_DATABASE_TEST !== '1')(
  'Access passes with PostgreSQL',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let passes: AccessPassService;
    let jwt: JwtService;
    const marker = `access-pass-test-${randomUUID()}`;
    const estateId = 'seed_estate_palm_view';
    let otherEstateId: string | undefined;
    let guardAssignmentId: string | undefined;
    const base = `/estates/${estateId}/visitor-invitations`;
    const dto = () => ({
      visitorFirstName: 'Pass',
      visitorLastName: 'Test',
      purpose: marker,
      validFrom: new Date(Date.now() - 1000).toISOString(),
      validUntil: new Date(Date.now() + 3600000).toISOString(),
    });
    async function headers(user = 'seed_user_tenant') {
      return { Authorization: `Bearer ${await jwt.signAsync({ sub: user })}` };
    }
    async function create() {
      const response = await request(app.getHttpServer())
        .post(base)
        .set(await headers())
        .send(dto())
        .expect(201);
      return response.body.id as string;
    }
    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [VisitorInvitationsModule, AccessManagementModule],
      }).compile();
      app = module.createNestApplication();
      app.useLogger(false);
      prisma = module.get(PrismaService);
      passes = module.get(AccessPassService);
      jwt = module.get(JwtService);
      await app.init();
      await prisma.residency.findUniqueOrThrow({
        where: { id: 'seed_residency_tenant' },
      });
      const estate = await prisma.estate.create({
        data: {
          organizationId: 'seed_org_estate_os',
          name: marker,
          slug: marker,
        },
      });
      otherEstateId = estate.id;
      guardAssignmentId = (
        await prisma.staffAssignment.create({
          data: { userId: 'seed_user_manager', estateId, role: 'GUARD' },
        })
      ).id;
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      if (prisma) {
        await prisma.accessEvent.deleteMany({
          where: { pass: { invitation: { purpose: marker, estateId } } },
        });
        await prisma.visitorInvitation.deleteMany({
          where: { purpose: marker, estateId },
        });
        if (guardAssignmentId)
          await prisma.staffAssignment.delete({
            where: { id: guardAssignmentId },
          });
        if (otherEstateId)
          await prisma.estate.delete({ where: { id: otherEstateId } });
      }
      await app?.close();
    });

    it('creates one pass with inherited dates and exposes its token only on the pass endpoint', async () => {
      const id = await create();
      const invitation = await prisma.visitorInvitation.findUniqueOrThrow({
        where: { id },
        include: { pass: true },
      });
      expect(invitation.status).toBe('PENDING');
      expect(invitation.pass?.status).toBe('ACTIVE');
      expect(invitation.pass?.validFrom).toEqual(invitation.validFrom);
      expect(invitation.pass?.validUntil).toEqual(invitation.validUntil);
      expect(invitation.pass?.code).not.toBe(id);
      expect(invitation.pass?.token).not.toBe(invitation.pass?.id);
      expect(invitation.pass?.code).toMatch(
        /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/,
      );
      expect(invitation.pass?.token.length).toBe(43);
      const response = await request(app.getHttpServer())
        .get(`${base}/${id}/pass`)
        .set(await headers())
        .expect(200);
      expect(response.body.effectiveStatus).toBe('ACTIVE');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(Object.keys(response.body).sort()).toEqual(
        [
          'code',
          'token',
          'status',
          'effectiveStatus',
          'validFrom',
          'validUntil',
        ].sort(),
      );
      const detail = await request(app.getHttpServer())
        .get(`${base}/${id}`)
        .set(await headers())
        .expect(200);
      expect(detail.body.pass.code).toBe(invitation.pass?.code);
      expect(detail.body.pass).not.toHaveProperty('token');
      const list = await request(app.getHttpServer())
        .get(base)
        .set(await headers())
        .expect(200);
      expect(JSON.stringify(list.body).includes(invitation.pass!.token)).toBe(
        false,
      );
      expect(
        list.body.find((row: { id: string }) => row.id === id),
      ).not.toHaveProperty('pass');
    });
    it('enforces ownership, estate, authentication and residency', async () => {
      const id = await create();
      await request(app.getHttpServer()).get(`${base}/${id}/pass`).expect(401);
      await request(app.getHttpServer())
        .get(`${base}/${id}/pass`)
        .set(await headers('seed_user_owner'))
        .expect(404);
      await request(app.getHttpServer())
        .get(`${base}/${id}/pass`)
        .set(await headers('seed_user_manager'))
        .expect(403);
      await request(app.getHttpServer())
        .get(`/estates/${otherEstateId}/visitor-invitations/${id}/pass`)
        .set(await headers())
        .expect(403);
      await request(app.getHttpServer())
        .get(`${base}/missing/pass`)
        .set(await headers())
        .expect(404);
    });
    it('rolls back invitation and pass when creation fails after the pass write', async () => {
      const count = await prisma.visitorInvitation.count({
        where: { purpose: marker },
      });
      const original = passes.createForInvitation.bind(passes);
      vi.spyOn(passes, 'createForInvitation').mockImplementation(
        async (...args) => {
          await original(...args);
          throw new Error('Injected creation failure');
        },
      );
      await request(app.getHttpServer())
        .post(base)
        .set(await headers())
        .send(dto())
        .expect(500);
      expect(
        await prisma.visitorInvitation.count({ where: { purpose: marker } }),
      ).toBe(count);
      expect(
        await prisma.accessPass.count({
          where: { invitation: { purpose: marker } },
        }),
      ).toBe(count);
    });
    it.each(['code', 'token'] as const)(
      'retries a real %s collision in a new transaction',
      async (field) => {
        const firstId = await create();
        const existing = await prisma.accessPass.findUniqueOrThrow({
          where: { invitationId: firstId },
        });
        const generate = credentials.generatePassCredentials;
        const spy = vi
          .spyOn(credentials, 'generatePassCredentials')
          .mockImplementationOnce(() => ({
            ...generate(),
            [field]: existing[field],
          }))
          .mockImplementation(generate);
        const secondId = await create();
        expect(spy).toHaveBeenCalledTimes(2);
        const second = await prisma.accessPass.findUniqueOrThrow({
          where: { invitationId: secondId },
        });
        expect(second.code === existing.code).toBe(false);
        expect(second.token === existing.token).toBe(false);
      },
    );
    it('stops after five collisions with no partial invitations', async () => {
      const id = await create();
      const existing = await prisma.accessPass.findUniqueOrThrow({
        where: { invitationId: id },
      });
      const count = await prisma.visitorInvitation.count({
        where: { purpose: marker },
      });
      const spy = vi
        .spyOn(credentials, 'generatePassCredentials')
        .mockReturnValue({ code: existing.code, token: existing.token });
      await request(app.getHttpServer())
        .post(base)
        .set(await headers())
        .send(dto())
        .expect(503);
      expect(spy).toHaveBeenCalledTimes(5);
      expect(
        await prisma.visitorInvitation.count({ where: { purpose: marker } }),
      ).toBe(count);
    });
    it('atomically revokes on cancellation and keeps repeated cancellation safe', async () => {
      const id = await create();
      await request(app.getHttpServer())
        .patch(`${base}/${id}/cancel`)
        .set(await headers())
        .expect(200);
      const row = await prisma.visitorInvitation.findUniqueOrThrow({
        where: { id },
        include: { pass: true },
      });
      expect(row.status).toBe('CANCELLED');
      expect(row.pass?.status).toBe('REVOKED');
      expect(row.pass?.revokedAt).toBeInstanceOf(Date);
      expect(passes.evaluatePass(row.pass, row, estateId)).toBe('CANCELLED');
      await request(app.getHttpServer())
        .patch(`${base}/${id}/cancel`)
        .set(await headers())
        .expect(409);
      expect(
        (
          await prisma.accessPass.findUniqueOrThrow({
            where: { invitationId: id },
          })
        ).revokedAt,
      ).toEqual(row.pass?.revokedAt);
    });
    it('rolls back cancellation and revocation when either fails', async () => {
      const id = await create();
      const original = passes.revokeForInvitation.bind(passes);
      vi.spyOn(passes, 'revokeForInvitation').mockImplementation(
        async (...args) => {
          await original(...args);
          throw new Error('Injected revocation failure');
        },
      );
      await request(app.getHttpServer())
        .patch(`${base}/${id}/cancel`)
        .set(await headers())
        .expect(500);
      const row = await prisma.visitorInvitation.findUniqueOrThrow({
        where: { id },
        include: { pass: true },
      });
      expect(row.status).toBe('PENDING');
      expect(row.pass?.status).toBe('ACTIVE');
      expect(row.pass?.revokedAt).toBeNull();
    });
    it('handles legacy invitations without a pass', async () => {
      const values = dto();
      const row = await prisma.visitorInvitation.create({
        data: {
          ...values,
          validFrom: new Date(values.validFrom),
          validUntil: new Date(values.validUntil),
          estateId,
          hostResidencyId: 'seed_residency_tenant',
          createdByUserId: 'seed_user_tenant',
        },
      });
      await request(app.getHttpServer())
        .get(`${base}/${row.id}/pass`)
        .set(await headers())
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${base}/${row.id}/cancel`)
        .set(await headers())
        .expect(200);
    });
    it('verifies both credentials at a real gate without changing database state', async () => {
      const id = await create();
      const before = await prisma.visitorInvitation.findUniqueOrThrow({
        where: { id },
        include: { pass: true },
      });
      const events = await prisma.accessEvent.count({
        where: { passId: before.pass!.id },
      });
      for (const credential of [
        before.pass!.code.toLowerCase(),
        before.pass!.token,
      ]) {
        const response = await request(app.getHttpServer())
          .post(`/estates/${estateId}/gates/seed_gate_main/access/verify`)
          .set(await headers('seed_user_manager'))
          .send({ credential })
          .expect(200);
        expect(response.body.status).toBe('VALID');
        expect(response.body.visitor).toEqual({
          firstName: 'Pass',
          lastName: 'Test',
        });
        expect(response.body.host.unit.id).toBe('seed_unit_b01');
        expect(JSON.stringify(response.body).includes(before.pass!.token)).toBe(
          false,
        );
      }
      const after = await prisma.visitorInvitation.findUniqueOrThrow({
        where: { id },
        include: { pass: true },
      });
      expect(after).toEqual(before);
      expect(
        await prisma.accessEvent.count({ where: { passId: before.pass!.id } }),
      ).toBe(events);
    });

    const actionUrl = (action: string) =>
      `/estates/${estateId}/gates/seed_gate_main/access/${action}`;
    async function act(
      action: string,
      credential: string,
      user = 'seed_user_manager',
    ) {
      return request(app.getHttpServer())
        .post(actionUrl(action))
        .set(await headers(user))
        .send({ credential });
    }
    async function newPass() {
      const id = await create();
      return prisma.accessPass.findUniqueOrThrow({
        where: { invitationId: id },
      });
    }
    it.each(['code', 'token'] as const)(
      'records single-entry lifecycle via %s without changing check-in history',
      async (kind) => {
        const pass = await newPass();
        const entry = await act('check-in', pass[kind]);
        expect(entry.status).toBe(200);
        expect(entry.body.status).toBe('CHECKED_IN');
        expect(entry.body.visitor).toEqual({
          firstName: 'Pass',
          lastName: 'Test',
        });
        expect(entry.body.host.unit.id).toBe('seed_unit_b01');
        expect(JSON.stringify(entry.body).includes(pass.token)).toBe(false);
        const original = await prisma.accessEvent.findUniqueOrThrow({
          where: { id: entry.body.event.id },
        });
        expect(original.actorId).toBe('seed_user_manager');
        expect(
          (
            await prisma.accessPass.findUniqueOrThrow({
              where: { id: pass.id },
            })
          ).status,
        ).toBe('ACTIVE');
        expect((await act('check-in', pass[kind])).body.status).toBe(
          'ALREADY_CHECKED_IN',
        );
        const exit = await act('check-out', pass[kind]);
        expect(exit.body.status).toBe('CHECKED_OUT');
        expect(exit.body.event.id).not.toBe(original.id);
        expect(
          await prisma.accessEvent.findUniqueOrThrow({
            where: { id: original.id },
          }),
        ).toEqual(original);
        expect(
          (
            await prisma.visitorInvitation.findUniqueOrThrow({
              where: { id: pass.invitationId },
            })
          ).status,
        ).toBe('COMPLETED');
        expect(
          (
            await prisma.accessPass.findUniqueOrThrow({
              where: { id: pass.id },
            })
          ).status,
        ).toBe('USED');
        expect((await act('verify', pass[kind])).body.status).toBe('USED');
        expect((await act('check-in', pass[kind])).body.status).toBe('USED');
        expect((await act('check-out', pass[kind])).body.status).toBe(
          'NOT_CHECKED_IN',
        );
        expect(
          await prisma.accessEvent.count({ where: { passId: pass.id } }),
        ).toBe(2);
      },
    );
    it('serializes concurrent entry and exit requests', async () => {
      const pass = await newPass();
      const entries = await Promise.all([
        act('check-in', pass.code),
        act('check-in', pass.token),
        act('check-in', pass.code),
      ]);
      expect(entries.map((r) => r.body.status).sort()).toEqual([
        'ALREADY_CHECKED_IN',
        'ALREADY_CHECKED_IN',
        'CHECKED_IN',
      ]);
      const exits = await Promise.all([
        act('check-out', pass.code),
        act('check-out', pass.token),
        act('check-out', pass.code),
      ]);
      expect(exits.map((r) => r.body.status).sort()).toEqual([
        'CHECKED_OUT',
        'NOT_CHECKED_IN',
        'NOT_CHECKED_IN',
      ]);
      const history = await prisma.accessEvent.findMany({
        where: { passId: pass.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(history.map((e) => e.type)).toEqual(['CHECK_IN', 'CHECK_OUT']);
      expect(history[1].createdAt.getTime()).toBeGreaterThan(
        history[0].createdAt.getTime(),
      );
    });
    it.each(['expired', 'revoked', 'cancelled', 'completed'])(
      'allows an inside visitor to leave after becoming %s',
      async (state) => {
        const pass = await newPass();
        expect((await act('check-in', pass.code)).body.success).toBe(true);
        if (state === 'expired')
          await prisma.accessPass.update({
            where: { id: pass.id },
            data: { validUntil: new Date(0) },
          });
        if (state === 'revoked')
          await prisma.accessPass.update({
            where: { id: pass.id },
            data: { status: 'REVOKED', revokedAt: new Date() },
          });
        if (state === 'cancelled')
          await request(app.getHttpServer())
            .patch(`${base}/${pass.invitationId}/cancel`)
            .set(await headers())
            .expect(200);
        if (state === 'completed')
          await prisma.visitorInvitation.update({
            where: { id: pass.invitationId },
            data: { status: 'COMPLETED' },
          });
        expect((await act('check-out', pass.token)).body.status).toBe(
          'CHECKED_OUT',
        );
        expect((await act('verify', pass.token)).body.status).toBe('USED');
      },
    );
    it.each([
      'EXPIRED',
      'NOT_YET_VALID',
      'REVOKED',
      'CANCELLED',
      'COMPLETED',
      'USED',
    ])(
      'revalidates %s before check-in, not trusting verification',
      async (state) => {
        const pass = await newPass();
        expect((await act('verify', pass.code)).body.status).toBe('VALID');
        if (state === 'EXPIRED')
          await prisma.accessPass.update({
            where: { id: pass.id },
            data: { validFrom: new Date(0), validUntil: new Date(1) },
          });
        if (state === 'NOT_YET_VALID')
          await prisma.accessPass.update({
            where: { id: pass.id },
            data: { validFrom: new Date(Date.now() + 60000) },
          });
        if (state === 'REVOKED' || state === 'USED')
          await prisma.accessPass.update({
            where: { id: pass.id },
            data: { status: state },
          });
        if (state === 'CANCELLED' || state === 'COMPLETED')
          await prisma.visitorInvitation.update({
            where: { id: pass.invitationId },
            data: { status: state },
          });
        expect((await act('check-in', pass.code)).body.status).toBe(state);
        expect((await act('check-out', pass.code)).body.status).toBe(
          'NOT_CHECKED_IN',
        );
        expect(
          await prisma.accessEvent.count({ where: { passId: pass.id } }),
        ).toBe(0);
      },
    );
    it.each(['check-in', 'check-out'])(
      'enforces auth, scopes and input on %s',
      async (action) => {
        const pass = await newPass();
        await request(app.getHttpServer())
          .post(actionUrl(action))
          .send({ credential: pass.code })
          .expect(401);
        expect((await act(action, pass.code, 'seed_user_tenant')).status).toBe(
          403,
        );
        await request(app.getHttpServer())
          .post(actionUrl(action))
          .set(await headers('seed_user_manager'))
          .send({ credential: pass.code, actorId: 'forged' })
          .expect(400);
        await request(app.getHttpServer())
          .post(actionUrl(action))
          .set(await headers('seed_user_manager'))
          .send({ passId: pass.id })
          .expect(400);
        await request(app.getHttpServer())
          .post(
            `/estates/${otherEstateId}/gates/seed_gate_main/access/${action}`,
          )
          .set(await headers('seed_user_manager'))
          .send({ credential: pass.code })
          .expect(403);
        await request(app.getHttpServer())
          .post(`/estates/${estateId}/gates/missing/access/${action}`)
          .set(await headers('seed_user_manager'))
          .send({ credential: pass.code })
          .expect(404);
        expect((await act(action, 'unknown-token')).body.status).toBe(
          'INVALID_CREDENTIAL',
        );
        expect(
          await prisma.accessEvent.count({ where: { passId: pass.id } }),
        ).toBe(0);
      },
    );
    it.each(['check-in', 'check-out'])(
      'rolls back injected failure during %s',
      async (action) => {
        const pass = await newPass();
        if (action === 'check-out') await act('check-in', pass.code);
        const before = await prisma.visitorInvitation.findUniqueOrThrow({
          where: { id: pass.invitationId },
          include: { pass: true },
        });
        const count = await prisma.accessEvent.count({
          where: { passId: pass.id },
        });
        const original = prisma.$transaction.bind(prisma);
        vi.spyOn(prisma, '$transaction').mockImplementation((async (
          callback: any,
        ) =>
          original(async (tx) => {
            if (action === 'check-in') {
              const create = tx.accessEvent.create.bind(tx.accessEvent);
              tx.accessEvent.create = (async (args: any) => {
                await create(args);
                throw new Error('Injected event failure');
              }) as unknown as typeof tx.accessEvent.create;
            } else {
              const update = tx.accessPass.update.bind(tx.accessPass);
              tx.accessPass.update = (async (args: any) => {
                await update(args);
                throw new Error('Injected lifecycle failure');
              }) as unknown as typeof tx.accessPass.update;
            }
            return callback(tx);
          })) as typeof prisma.$transaction);
        expect((await act(action, pass.code)).status).toBe(500);
        expect(
          await prisma.visitorInvitation.findUniqueOrThrow({
            where: { id: pass.invitationId },
            include: { pass: true },
          }),
        ).toEqual(before);
        expect(
          await prisma.accessEvent.count({ where: { passId: pass.id } }),
        ).toBe(count);
      },
    );

    it.each(['check-in', 'check-out'])(
      'rejects inactive gates, foreign gates and foreign passes on %s',
      async (action) => {
        const pass = await newPass();
        const gate = await prisma.gate.create({
          data: { estateId, name: marker, code: marker, status: 'INACTIVE' },
        });
        const foreign = await prisma.gate.create({
          data: { estateId: otherEstateId!, name: marker, code: marker },
        });
        try {
          const response = await request(app.getHttpServer())
            .post(`/estates/${estateId}/gates/${gate.id}/access/${action}`)
            .set(await headers('seed_user_manager'))
            .send({ credential: pass.code })
            .expect(200);
          expect(response.body.status).toBe('INACTIVE_GATE');
          await request(app.getHttpServer())
            .post(`/estates/${estateId}/gates/${foreign.id}/access/${action}`)
            .set(await headers('seed_user_manager'))
            .send({ credential: pass.code })
            .expect(404);
          await prisma.visitorInvitation.update({
            where: { id: pass.invitationId },
            data: { estateId: otherEstateId! },
          });
          expect((await act(action, pass.code)).body.status).toBe(
            'WRONG_ESTATE',
          );
          expect(
            await prisma.accessEvent.count({ where: { passId: pass.id } }),
          ).toBe(0);
        } finally {
          await prisma.visitorInvitation.update({
            where: { id: pass.invitationId },
            data: { estateId },
          });
          await prisma.gate.deleteMany({
            where: { id: { in: [gate.id, foreign.id] } },
          });
        }
      },
    );
    it('allows security supervisor to check in and out', async () => {
      const pass = await newPass();
      await prisma.staffAssignment.update({
        where: { id: guardAssignmentId! },
        data: { role: 'SECURITY_SUPERVISOR' },
      });
      try {
        expect((await act('check-in', pass.token)).body.status).toBe(
          'CHECKED_IN',
        );
        expect((await act('check-out', pass.token)).body.status).toBe(
          'CHECKED_OUT',
        );
      } finally {
        await prisma.staffAssignment.update({
          where: { id: guardAssignmentId! },
          data: { role: 'GUARD' },
        });
      }
    });

    it('rejects client credentials and pass state', async () => {
      for (const field of ['code', 'token', 'status', 'revokedAt']) {
        await request(app.getHttpServer())
          .post(base)
          .set(await headers())
          .send({ ...dto(), [field]: 'client-value' })
          .expect(400);
      }
    });
  },
);
