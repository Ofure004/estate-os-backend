import {
  AccessPassService,
  passSummarySelect,
} from '../access-passes/access-passes.service.js';
import { PassCredentialCollision } from '../access-passes/access-pass-credentials.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { CreateVisitorInvitationDto } from './dto/create-visitor-invitation.dto.js';

const invitationSelect = {
  id: true,
  estateId: true,
  visitorFirstName: true,
  visitorLastName: true,
  visitorPhone: true,
  purpose: true,
  validFrom: true,
  validUntil: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  hostResidency: {
    select: {
      id: true,
      unit: { select: { id: true, name: true, code: true } },
    },
  },
} as const;

@Injectable()
export class VisitorInvitationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
    @Inject(AccessPassService) private readonly passes: AccessPassService,
  ) {}

  private resident(currentUserId: string, estateId: string) {
    return this.authorization.authorize(
      currentUserId,
      { estateId },
      { scope: 'estate', roles: ['RESIDENT'] },
    );
  }
  private mine(currentUserId: string, estateId: string, invitationId?: string) {
    return {
      estateId,
      hostResidency: { userId: currentUserId, unit: { estateId } },
      ...(invitationId ? { id: invitationId } : {}),
    };
  }
  async create(
    currentUserId: string,
    estateId: string,
    dto: CreateVisitorInvitationDto,
  ) {
    const context = await this.resident(currentUserId, estateId);
    let hostResidencyId = dto.hostResidencyId;
    if (hostResidencyId) {
      if (!context.residencies.some((r) => r.id === hostResidencyId))
        throw new ForbiddenException(
          'The selected host residency is not active for you in this estate',
        );
    } else if (context.residencies.length === 1) {
      hostResidencyId = context.residencies[0].id;
    } else if (context.residencies.length > 1) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'HOST_RESIDENCY_REQUIRED',
        message:
          'You have multiple active residencies in this estate. Provide hostResidencyId to select the unit you are hosting the visitor from.',
      });
    } else {
      throw new ForbiddenException();
    }
    const validFrom = new Date(dto.validFrom);
    const validUntil = new Date(dto.validUntil);
    if (
      !Number.isFinite(validFrom.getTime()) ||
      !Number.isFinite(validUntil.getTime()) ||
      validFrom >= validUntil
    )
      throw new BadRequestException(
        'validFrom must be earlier than validUntil',
      );
    if (validUntil <= new Date())
      throw new BadRequestException('validUntil must be in the future');
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const invitation = await tx.visitorInvitation.create({
            data: {
              estateId,
              hostResidencyId,
              createdByUserId: currentUserId,
              visitorFirstName: dto.visitorFirstName,
              visitorLastName: dto.visitorLastName,
              visitorPhone: dto.visitorPhone || null,
              purpose: dto.purpose || null,
              validFrom,
              validUntil,
              status: 'PENDING',
            },
            select: invitationSelect,
          });
          await this.passes.createForInvitation(tx, invitation);
          return invitation;
        });
      } catch (error) {
        if (!(error instanceof PassCredentialCollision)) throw error;
      }
    }
    throw new ServiceUnavailableException(
      'Unable to generate access pass credentials. Please try again.',
    );
  }

  async findMine(currentUserId: string, estateId: string) {
    await this.resident(currentUserId, estateId);
    return this.prisma.visitorInvitation.findMany({
      where: this.mine(currentUserId, estateId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: invitationSelect,
    });
  }
  async findOneMine(
    currentUserId: string,
    estateId: string,
    invitationId: string,
  ) {
    await this.resident(currentUserId, estateId);
    const invitation = await this.prisma.visitorInvitation.findFirst({
      where: this.mine(currentUserId, estateId, invitationId),
      select: { ...invitationSelect, pass: { select: passSummarySelect } },
    });
    if (!invitation)
      throw new NotFoundException('Visitor invitation not found');
    return invitation;
  }
  async cancel(currentUserId: string, estateId: string, invitationId: string) {
    await this.findOneMine(currentUserId, estateId, invitationId);
    const where = this.mine(currentUserId, estateId, invitationId);
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.visitorInvitation.updateMany({
        where: {
          ...where,
          status: { in: ['PENDING', 'ACTIVE'] },
          validUntil: { gt: new Date() },
        },
        data: { status: 'CANCELLED' },
      });
      if (!result.count) {
        const exists = await tx.visitorInvitation.findFirst({
          where,
          select: { id: true },
        });
        if (!exists)
          throw new NotFoundException('Visitor invitation not found');
        throw new ConflictException(
          'Only unexpired PENDING or ACTIVE visitor invitations can be cancelled',
        );
      }
      await this.passes.revokeForInvitation(tx, invitationId, new Date());
      return tx.visitorInvitation.findFirstOrThrow({
        where,
        select: invitationSelect,
      });
    });
  }
}
