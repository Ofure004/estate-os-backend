import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AccessActivityQueryDto } from './dto/access-activity-query.dto.js';

const eventSelect = {
  id: true,
  type: true,
  createdAt: true,
  gate: { select: { id: true, name: true, code: true } },
  actor: { select: { id: true, firstName: true, lastName: true } },
  pass: {
    select: {
      invitation: {
        select: {
          id: true,
          visitorFirstName: true,
          visitorLastName: true,
          purpose: true,
          validUntil: true,
          hostResidency: {
            select: { unit: { select: { id: true, name: true, code: true } } },
          },
        },
      },
    },
  },
} as const;
type VisibilityEvent = Prisma.AccessEventGetPayload<{
  select: typeof eventSelect;
}>;

@Injectable()
export class AccessVisibilityService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}
  private authorize(currentUserId: string, estateId: string) {
    return this.authorization.authorize(
      currentUserId,
      { estateId },
      {
        scope: 'estate',
        roles: ['ESTATE_MANAGER', 'SECURITY_SUPERVISOR', 'GUARD'],
      },
    );
  }
  private scope(estateId: string): Prisma.AccessEventWhereInput {
    return {
      estateId,
      type: { in: ['CHECK_IN', 'CHECK_OUT'] },
      gate: { estateId },
      pass: { invitation: { estateId, hostResidency: { unit: { estateId } } } },
    };
  }
  private context(event: VisibilityEvent) {
    const invitation = event.pass.invitation;
    return {
      visitor: {
        firstName: invitation.visitorFirstName,
        lastName: invitation.visitorLastName,
      },
      host: { unit: invitation.hostResidency.unit },
    };
  }
  async findOnsite({
    currentUserId,
    estateId,
  }: {
    currentUserId: string;
    estateId: string;
  }) {
    await this.authorize(currentUserId, estateId);
    return this.prisma.$transaction(
      async (tx) => {
        // Prisma cannot express the correlated latest-event comparison cleanly.
        // Do not filter later events by estate: inconsistent history must not
        // resurrect an older CHECK_IN. Validate all related estate boundaries below.
        const ids = await tx.$queryRaw<{ id: string }[]>`
        SELECT e."id" FROM "AccessEvent" e
        WHERE e."estateId" = ${estateId} AND e."type" = 'CHECK_IN'
          AND NOT EXISTS (
            SELECT 1 FROM "AccessEvent" newer
            WHERE newer."passId" = e."passId"
              AND newer."type" IN ('CHECK_IN', 'CHECK_OUT')
              AND (newer."createdAt", newer."id") > (e."createdAt", e."id")
          )`;
        if (!ids.length) return [];
        const events = await tx.accessEvent.findMany({
          where: {
            ...this.scope(estateId),
            id: { in: ids.map((row) => row.id) },
          },
          select: eventSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        return events.map((event) => ({
          ...this.context(event),
          checkedInAt: event.createdAt,
          entryGate: event.gate,
          invitationId: event.pass.invitation.id,
          purpose: event.pass.invitation.purpose,
          validUntil: event.pass.invitation.validUntil,
        }));
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async findRecentActivity({
    currentUserId,
    estateId,
    query,
  }: {
    currentUserId: string;
    estateId: string;
    query: AccessActivityQueryDto;
  }) {
    await this.authorize(currentUserId, estateId);
    const { page, limit, type, gateId } = query;
    const skip = (page - 1) * limit;
    if (!Number.isSafeInteger(skip) || skip > 2147483647)
      throw new BadRequestException(
        'Requested page exceeds the supported offset',
      );
    return this.prisma.$transaction(
      async (tx) => {
        if (
          gateId &&
          !(await tx.gate.findFirst({
            where: { id: gateId, estateId },
            select: { id: true },
          }))
        )
          throw new NotFoundException('Gate not found');
        const where = {
          ...this.scope(estateId),
          ...(type ? { type } : {}),
          ...(gateId ? { gateId } : {}),
        };
        const total = await tx.accessEvent.count({ where });
        const events = await tx.accessEvent.findMany({
          where,
          select: eventSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: limit,
        });
        return {
          data: events.map((event) => ({
            id: event.id,
            type: event.type,
            createdAt: event.createdAt,
            ...this.context(event),
            gate: event.gate,
            performedBy: event.actor,
          })),
          meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
