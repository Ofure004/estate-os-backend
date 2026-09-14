import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  AccessPass,
  VisitorInvitation,
} from '../generated/prisma/client.js';
import {
  generatePassCredentials,
  PassCredentialCollision,
} from './access-pass-credentials.js';

export const passSummarySelect = {
  code: true,
  status: true,
  validFrom: true,
  validUntil: true,
} as const;
type PassState = Pick<
  AccessPass,
  'status' | 'revokedAt' | 'validFrom' | 'validUntil'
>;
type InvitationState = Pick<
  VisitorInvitation,
  'estateId' | 'status' | 'validFrom' | 'validUntil'
>;
export type EffectivePassStatus =
  | 'ACTIVE'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'REVOKED'
  | 'USED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'NOT_FOUND'
  | 'WRONG_ESTATE'
  | 'INVALID';

@Injectable()
export class AccessPassService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}

  async createForInvitation(
    tx: Prisma.TransactionClient,
    invitation: Pick<VisitorInvitation, 'id' | 'validFrom' | 'validUntil'>,
  ) {
    try {
      // Do not return or log the raw credentials from the creation workflow.
      return await tx.accessPass.create({
        data: {
          invitationId: invitation.id,
          ...generatePassCredentials(),
          status: 'ACTIVE',
          validFrom: invitation.validFrom,
          validUntil: invitation.validUntil,
        },
        select: passSummarySelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target;
        const adapter = error.meta?.driverAdapterError as
          | {
              cause?: { constraint?: { fields?: string[]; index?: string } };
            }
          | undefined;
        const constraint = adapter?.cause?.constraint;
        const fields = Array.isArray(target) ? target : constraint?.fields;
        const index = typeof target === 'string' ? target : constraint?.index;
        if (
          fields?.some((field) => field === 'code' || field === 'token') ||
          index === 'AccessPass_code_key' ||
          index === 'AccessPass_token_key'
        )
          throw new PassCredentialCollision();
      }
      // Prisma validation/driver errors may include query arguments. Do not
      // propagate credential-bearing errors to HTTP logging/telemetry.
      throw new InternalServerErrorException('Unable to create access pass');
    }
  }

  async revokeForInvitation(
    tx: Prisma.TransactionClient,
    invitationId: string,
    now: Date,
  ) {
    // Includes USED legacy passes. Preserve the original revocation timestamp.
    await tx.accessPass.updateMany({
      where: { invitationId, revokedAt: null },
      data: { status: 'REVOKED', revokedAt: now },
    });
    await tx.accessPass.updateMany({
      where: { invitationId, status: { not: 'REVOKED' } },
      data: { status: 'REVOKED' },
    });
  }

  evaluatePass(
    pass: PassState | null,
    invitation: InvitationState | null,
    estateId: string,
    now = new Date(),
  ): EffectivePassStatus {
    if (!pass || !invitation) return 'NOT_FOUND';
    if (invitation.estateId !== estateId) return 'WRONG_ESTATE';
    if (invitation.status === 'CANCELLED') return 'CANCELLED';
    if (invitation.status === 'COMPLETED')
      return pass.status === 'USED' ? 'USED' : 'COMPLETED';
    if (pass.status === 'REVOKED' || pass.revokedAt !== null) return 'REVOKED';
    if (pass.status === 'USED') return 'USED';
    const dates = [
      now,
      pass.validFrom,
      pass.validUntil,
      invitation.validFrom,
      invitation.validUntil,
    ];
    if (
      dates.some((date) => !Number.isFinite(date.getTime())) ||
      pass.validFrom >= pass.validUntil ||
      invitation.validFrom >= invitation.validUntil
    )
      return 'INVALID';
    if (
      invitation.status === 'EXPIRED' ||
      now >= pass.validUntil ||
      now >= invitation.validUntil
    )
      return 'EXPIRED';
    if (now < pass.validFrom || now < invitation.validFrom)
      return 'NOT_YET_VALID';
    if (
      pass.status !== 'ACTIVE' ||
      !['PENDING', 'ACTIVE'].includes(invitation.status)
    )
      return 'INVALID';
    return 'ACTIVE';
  }

  async findForResident(
    currentUserId: string,
    estateId: string,
    invitationId: string,
  ) {
    await this.authorization.authorize(
      currentUserId,
      { estateId },
      { scope: 'estate', roles: ['RESIDENT'] },
    );
    const invitation = await this.prisma.visitorInvitation.findFirst({
      where: {
        id: invitationId,
        estateId,
        hostResidency: { userId: currentUserId, unit: { estateId } },
      },
      select: {
        estateId: true,
        status: true,
        validFrom: true,
        validUntil: true,
        pass: {
          select: { ...passSummarySelect, token: true, revokedAt: true },
        },
      },
    });
    if (!invitation?.pass) throw new NotFoundException('Access pass not found');
    const { pass } = invitation;
    return {
      code: pass.code,
      token: pass.token,
      status: pass.status,
      effectiveStatus: this.evaluatePass(pass, invitation, estateId),
      validFrom: pass.validFrom,
      validUntil: pass.validUntil,
    };
  }
}
