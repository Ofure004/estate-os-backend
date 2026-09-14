import type { Prisma } from '../generated/prisma/client.js';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AccessPassService } from '../access-passes/access-passes.service.js';

@Injectable()
export class AccessVerificationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
    @Inject(AccessPassService) private readonly passes: AccessPassService,
  ) {}
  async verify({
    currentUserId,
    estateId,
    gateId,
    credential,
  }: {
    currentUserId: string;
    estateId: string;
    gateId: string;
    credential: string;
  }) {
    await this.authorize(currentUserId, estateId);
    const gate = await this.requireGate(estateId, gateId);
    if (gate.status !== 'ACTIVE')
      return { valid: false as const, status: 'INACTIVE_GATE' as const };
    const pass = await this.resolveCredential(credential);
    if (!pass)
      return { valid: false as const, status: 'INVALID_CREDENTIAL' as const };
    const invitation = pass.invitation;
    const status = this.passes.evaluatePass(pass, invitation, estateId);
    if (status !== 'ACTIVE')
      return {
        valid: false as const,
        status:
          status === 'INVALID' || status === 'NOT_FOUND'
            ? ('INVALID_CREDENTIAL' as const)
            : status,
      };
    const unit = invitation.hostResidency.unit;
    if (unit.estateId !== estateId)
      return { valid: false as const, status: 'WRONG_ESTATE' as const };
    return {
      valid: true as const,
      status: 'VALID' as const,
      ...this.visitorContext(pass),
      invitation: {
        purpose: invitation.purpose,
        validFrom: invitation.validFrom,
        validUntil: invitation.validUntil,
      },
    };
  }

  authorize(currentUserId: string, estateId: string) {
    return this.authorization.authorize(
      currentUserId,
      { estateId },
      { scope: 'estate', roles: ['GUARD', 'SECURITY_SUPERVISOR'] },
    );
  }
  async requireGate(
    estateId: string,
    gateId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const gate = await db.gate.findFirst({
      where: { id: gateId, estateId },
      select: { status: true },
    });
    if (!gate) throw new NotFoundException('Gate not found');
    return gate;
  }
  visitorContext(pass: {
    invitation: {
      visitorFirstName: string;
      visitorLastName: string;
      hostResidency: { unit: { id: string; name: string; code: string } };
    };
  }) {
    const invitation = pass.invitation;
    const unit = invitation.hostResidency.unit;
    return {
      visitor: {
        firstName: invitation.visitorFirstName,
        lastName: invitation.visitorLastName,
      },
      host: { unit: { id: unit.id, name: unit.name, code: unit.code } },
    };
  }
  async resolveCredential(
    credential: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const value = credential.trim();
    // Tokens are case-sensitive. Only the short-code branch is normalized.
    const code = /^[a-z0-9]{6,8}$/i.test(value) ? value.toUpperCase() : value;
    let matches;
    try {
      matches = await db.accessPass.findMany({
        where: { OR: [{ code }, { token: value }] },
        take: 2,
        select: {
          id: true,
          invitationId: true,
          status: true,
          revokedAt: true,
          validFrom: true,
          validUntil: true,
          invitation: {
            select: {
              estateId: true,
              status: true,
              validFrom: true,
              validUntil: true,
              visitorFirstName: true,
              visitorLastName: true,
              purpose: true,
              hostResidency: {
                select: {
                  unit: {
                    select: {
                      id: true,
                      estateId: true,
                      name: true,
                      code: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    } catch {
      // Driver errors can contain query arguments; keep credentials out of logs.
      throw new InternalServerErrorException(
        'Unable to verify access credential',
      );
    }
    // Fail closed if legacy data ever lets one credential match two passes.
    return matches.length === 1 ? matches[0] : null;
  }
}
