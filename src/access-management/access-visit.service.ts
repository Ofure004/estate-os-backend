import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessPassService } from '../access-passes/access-passes.service.js';
import { AccessVerificationService } from './access-verification.service.js';

export interface VisitAction {
  currentUserId: string;
  estateId: string;
  gateId: string;
  credential: string;
}
@Injectable()
export class AccessVisitService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccessVerificationService)
    private readonly verification: AccessVerificationService,
    @Inject(AccessPassService) private readonly passes: AccessPassService,
  ) {}
  checkIn(action: VisitAction) {
    return this.perform(action, 'CHECK_IN');
  }
  checkOut(action: VisitAction) {
    return this.perform(action, 'CHECK_OUT');
  }

  private async perform(action: VisitAction, type: 'CHECK_IN' | 'CHECK_OUT') {
    const { currentUserId, estateId, gateId, credential } = action;
    await this.verification.authorize(currentUserId, estateId);
    return this.prisma.$transaction(async (tx) => {
      // Keep the operational gate active throughout the transaction.
      await tx.$queryRaw`SELECT "id" FROM "Gate" WHERE "id" = ${gateId} AND "estateId" = ${estateId} FOR SHARE`;
      const gate = await this.verification.requireGate(estateId, gateId, tx);
      if (gate.status !== 'ACTIVE')
        return { success: false as const, status: 'INACTIVE_GATE' };
      const candidate = await this.verification.resolveCredential(
        credential,
        tx,
      );
      if (!candidate)
        return { success: false as const, status: 'INVALID_CREDENTIAL' };
      if (candidate.invitation.estateId !== estateId)
        return { success: false as const, status: 'WRONG_ESTATE' };
      // Cancellation updates the invitation before the pass: use the same lock
      // order. All visit actions serialize here, before inspecting presence.
      await tx.$queryRaw`SELECT "id" FROM "VisitorInvitation" WHERE "id" = ${candidate.invitationId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "AccessPass" WHERE "id" = ${candidate.id} FOR UPDATE`;
      const pass = await this.verification.resolveCredential(credential, tx);
      if (!pass || pass.id !== candidate.id)
        return { success: false as const, status: 'INVALID_CREDENTIAL' };
      if (
        pass.invitation.estateId !== estateId ||
        pass.invitation.hostResidency.unit.estateId !== estateId
      )
        return { success: false as const, status: 'WRONG_ESTATE' };
      if (type === 'CHECK_IN') {
        const status = this.passes.evaluatePass(
          pass,
          pass.invitation,
          estateId,
        );
        if (status !== 'ACTIVE')
          return {
            success: false as const,
            status:
              status === 'INVALID' || status === 'NOT_FOUND'
                ? 'INVALID_CREDENTIAL'
                : status,
          };
      }
      const latest = await tx.accessEvent.findFirst({
        where: { passId: pass.id, type: { in: ['CHECK_IN', 'CHECK_OUT'] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { type: true, createdAt: true },
      });
      const inside = latest?.type === 'CHECK_IN';
      if (type === 'CHECK_IN' && inside)
        return { success: false as const, status: 'ALREADY_CHECKED_IN' };
      if (type === 'CHECK_OUT' && !inside)
        return { success: false as const, status: 'NOT_CHECKED_IN' };
      // Millisecond timestamp ties must not invert append order. Locks ensure
      // each new event receives a strictly later timestamp for this pass.
      const createdAt = new Date(
        Math.max(Date.now(), latest ? latest.createdAt.getTime() + 1 : 0),
      );
      const event = await tx.accessEvent.create({
        data: {
          passId: pass.id,
          estateId,
          gateId,
          actorId: currentUserId,
          type,
          createdAt,
        },
        select: { id: true, type: true, createdAt: true },
      });
      if (type === 'CHECK_OUT') {
        await tx.visitorInvitation.update({
          where: { id: pass.invitationId },
          data: { status: 'COMPLETED' },
        });
        await tx.accessPass.update({
          where: { id: pass.id },
          data: { status: 'USED' },
        });
      }
      return {
        success: true as const,
        status: type === 'CHECK_IN' ? 'CHECKED_IN' : 'CHECKED_OUT',
        event,
        ...this.verification.visitorContext(pass),
      };
    });
  }
}
