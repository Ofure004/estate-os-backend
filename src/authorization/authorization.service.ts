import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AuthorizationContext,
  AuthorizationPolicy,
  AuthorizationRole,
  ResourceKind,
} from './authorization.types.js';

type TimedRelationship = {
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
};
function isActive(value: TimedRelationship, now: Date) {
  return (
    value.status === 'ACTIVE' &&
    (!value.startedAt || value.startedAt <= now) &&
    (!value.endedAt || value.endedAt > now)
  );
}

@Injectable()
export class AuthorizationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolve(
    userId: string,
    scope: { organizationId?: string; estateId?: string },
  ): Promise<AuthorizationContext> {
    let organizationId = scope.organizationId;
    if (scope.estateId) {
      const estate = await this.prisma.estate.findUnique({
        where: { id: scope.estateId },
        select: { organizationId: true },
      });
      if (
        !estate ||
        (organizationId && estate.organizationId !== organizationId)
      )
        throw new ForbiddenException();
      organizationId = estate.organizationId;
    }
    if (!organizationId) throw new ForbiddenException();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        memberships: {
          where: { organizationId },
          select: { id: true, organizationId: true, role: true, status: true },
        },
        staffAssignments: {
          where: { estateId: scope.estateId ?? '__no_estate__' },
          select: {
            id: true,
            estateId: true,
            role: true,
            status: true,
            startedAt: true,
            endedAt: true,
          },
        },
        residencies: {
          where: { unit: { estateId: scope.estateId ?? '__no_estate__' } },
          select: {
            id: true,
            unitId: true,
            type: true,
            status: true,
            startedAt: true,
            endedAt: true,
            unit: { select: { estateId: true } },
          },
        },
      },
    });
    if (!user) throw new ForbiddenException();
    const now = new Date();
    const membership = user.memberships.find(
      (m) => m.organizationId === organizationId && m.status === 'ACTIVE',
    );
    const staff = user.staffAssignments.filter(
      (s) =>
        scope.estateId && s.estateId === scope.estateId && isActive(s, now),
    );
    const residencies = user.residencies.filter(
      (r) =>
        scope.estateId &&
        r.unit.estateId === scope.estateId &&
        isActive(r, now),
    );
    const roles: AuthorizationRole[] = [];
    if (
      membership &&
      (!scope.estateId ||
        membership.role === 'OWNER' ||
        membership.role === 'ADMIN')
    )
      roles.push(`ORG_${membership.role}`);
    roles.push(...staff.map((s) => s.role));
    if (residencies.length) roles.push('RESIDENT');
    return {
      userId,
      organizationId,
      ...(scope.estateId ? { estateId: scope.estateId } : {}),
      roles: [...new Set(roles)],
      membership: membership
        ? { id: membership.id, role: membership.role }
        : null,
      staffAssignments: staff.map(({ id, role }) => ({ id, role })),
      residencies: residencies.map(({ id, unitId, type }) => ({
        id,
        unitId,
        type,
      })),
    };
  }

  async authorize(
    userId: string,
    scope: { organizationId?: string; estateId?: string },
    policy: AuthorizationPolicy,
  ) {
    if (
      !policy.roles.length ||
      (policy.scope === 'estate'
        ? !scope.estateId
        : !scope.organizationId || !!scope.estateId)
    )
      throw new ForbiddenException();
    const context = await this.resolve(userId, scope);
    if (!policy.roles.some((role) => context.roles.includes(role)))
      throw new ForbiddenException();
    return context;
  }

  // Combine scope and caller filters with AND so caller input cannot override scope.
  estateWhere<T extends object>(context: AuthorizationContext, where: T) {
    if (!context.estateId) throw new ForbiddenException();
    return { AND: [{ estateId: context.estateId }, where] };
  }
  organizationWhere<T extends object>(context: AuthorizationContext, where: T) {
    if (context.estateId) throw new ForbiddenException();
    return { AND: [{ organizationId: context.organizationId }, where] };
  }

  async assertResource(
    context: AuthorizationContext,
    kind: ResourceKind,
    id: string,
  ) {
    const estate = {
      organizationId: context.organizationId,
      ...(context.estateId ? { id: context.estateId } : {}),
    };
    const direct = { id, estate };
    let resource: { id: string } | null;
    const select = { id: true } as const;
    switch (kind) {
      case 'unit':
        resource = await this.prisma.unit.findFirst({ where: direct, select });
        break;
      case 'gate':
        resource = await this.prisma.gate.findFirst({ where: direct, select });
        break;
      case 'visitorInvitation':
        resource = await this.prisma.visitorInvitation.findFirst({
          where: direct,
          select,
        });
        break;
      case 'accessEvent':
        resource = await this.prisma.accessEvent.findFirst({
          where: direct,
          select,
        });
        break;
      case 'staffAssignment':
        resource = await this.prisma.staffAssignment.findFirst({
          where: direct,
          select,
        });
        break;
      case 'accessPass':
        resource = await this.prisma.accessPass.findFirst({
          where: { id, invitation: { estate } },
          select,
        });
        break;
      case 'residency':
        resource = await this.prisma.residency.findFirst({
          where: { id, unit: { estate } },
          select,
        });
        break;
      case 'cluster':
        // Clusters span estates and can only be checked at organization scope.
        if (context.estateId) throw new ForbiddenException();
        resource = await this.prisma.cluster.findFirst({
          where: { id, organizationId: context.organizationId },
          select,
        });
        break;
      default:
        throw new ForbiddenException();
    }
    if (!resource) throw new ForbiddenException();
  }
}
