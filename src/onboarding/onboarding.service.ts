import 'dotenv/config';
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { hash, argon2id } from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ResidencyType, StaffRole } from '../generated/prisma/enums.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import type {
  AcceptInvitationDto,
  ResidentInvitationDto,
  StaffInvitationDto,
} from './onboarding.dto.js';

const lifetimeHours = Number(process.env.ONBOARDING_INVITATION_HOURS ?? 72);
if (
  !Number.isInteger(lifetimeHours) ||
  lifetimeHours < 1 ||
  lifetimeHours > 720
)
  throw new Error('ONBOARDING_INVITATION_HOURS must be 1–720');
type Tx = Prisma.TransactionClient;
const fail = (status: number, code: string, message: string) =>
  new HttpException({ statusCode: status, code, message }, status);
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const isUnique = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2002';

@Injectable()
export class OnboardingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private canAssign(context: AuthorizationContext, role: string) {
    if (
      context.roles.includes('ORG_OWNER') ||
      context.roles.includes('ORG_ADMIN')
    )
      return true;
    if (context.roles.includes('ESTATE_MANAGER'))
      return role !== 'ESTATE_MANAGER';
    return context.roles.includes('SECURITY_SUPERVISOR') && role === 'GUARD';
  }

  private async relationshipExists(
    tx: Tx,
    email: string,
    target: {
      unitId?: string | null;
      residencyType?: ResidencyType | null;
      estateId: string;
      intendedRole?: StaffRole | null;
    },
  ) {
    const user = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) return false;
    const now = new Date();
    if (target.unitId && target.residencyType)
      return !!(await tx.residency.findFirst({
        where: {
          userId: user.id,
          unitId: target.unitId,
          type: target.residencyType,
          status: 'ACTIVE',
          AND: [
            { OR: [{ startedAt: null }, { startedAt: { lte: now } }] },
            { OR: [{ endedAt: null }, { endedAt: { gt: now } }] },
          ],
        },
        select: { id: true },
      }));
    return !!(await tx.staffAssignment.findFirst({
      where: {
        userId: user.id,
        estateId: target.estateId,
        role: target.intendedRole!,
        status: 'ACTIVE',
        AND: [
          { OR: [{ startedAt: null }, { startedAt: { lte: now } }] },
          { OR: [{ endedAt: null }, { endedAt: { gt: now } }] },
        ],
      },
      select: { id: true },
    }));
  }

  async createResident(
    context: AuthorizationContext,
    dto: ResidentInvitationDto,
  ) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      select: { estateId: true },
    });
    if (!unit || unit.estateId !== context.estateId)
      throw fail(
        400,
        'UNIT_NOT_IN_ESTATE',
        'Unit does not belong to this estate',
      );
    return this.create(context, {
      email: dto.email,
      type: 'RESIDENT',
      unitId: dto.unitId,
      residencyType: dto.residencyType,
    });
  }

  async createStaff(context: AuthorizationContext, dto: StaffInvitationDto) {
    if (!this.canAssign(context, dto.role))
      throw fail(403, 'ROLE_NOT_ASSIGNABLE', 'You cannot assign this role');
    return this.create(context, {
      email: dto.email,
      type: 'STAFF',
      intendedRole: dto.role,
    });
  }

  private async create(
    context: AuthorizationContext,
    input: {
      email: string;
      type: 'RESIDENT' | 'STAFF';
      unitId?: string;
      residencyType?: ResidencyType;
      intendedRole?: StaffRole;
    },
  ) {
    const estateId = context.estateId!;
    const target = {
      estateId,
      unitId: input.unitId,
      residencyType: input.residencyType,
      intendedRole: input.intendedRole,
    };
    const rawToken = randomBytes(32).toString('base64url');
    const key = `${input.type}:${input.email}:${input.unitId ?? estateId}:${input.residencyType ?? input.intendedRole}`;
    try {
      const invitation = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${key}))`;
        if (await this.relationshipExists(tx, input.email, target))
          throw fail(
            409,
            'RELATIONSHIP_ALREADY_EXISTS',
            'This relationship already exists',
          );
        const pending = await tx.userInvitation.findFirst({
          where: {
            email: input.email,
            type: input.type,
            status: 'PENDING',
            ...(input.type === 'RESIDENT'
              ? { unitId: input.unitId, residencyType: input.residencyType }
              : { estateId, intendedRole: input.intendedRole }),
          },
        });
        if (pending && pending.expiresAt > new Date())
          throw fail(
            409,
            'INVITATION_ALREADY_PENDING',
            'An invitation is already pending',
          );
        if (pending)
          await tx.userInvitation.update({
            where: { id: pending.id },
            data: { status: 'REVOKED', revokedAt: new Date() },
          });
        return tx.userInvitation.create({
          data: {
            email: input.email,
            tokenHash: digest(rawToken),
            organizationId: context.organizationId,
            estateId,
            type: input.type,
            intendedRole: input.intendedRole,
            unitId: input.unitId,
            residencyType: input.residencyType,
            invitedByUserId: context.userId,
            expiresAt: new Date(Date.now() + lifetimeHours * 3_600_000),
          },
          select: {
            id: true,
            email: true,
            type: true,
            estateId: true,
            unitId: true,
            residencyType: true,
            intendedRole: true,
            status: true,
            expiresAt: true,
            createdAt: true,
          },
        });
      });
      return {
        ...invitation,
        ...(process.env.NODE_ENV !== 'production'
          ? { inviteToken: rawToken }
          : {}),
      };
    } catch (error) {
      if (isUnique(error))
        throw fail(
          409,
          'INVITATION_ALREADY_PENDING',
          'An invitation is already pending',
        );
      throw error;
    }
  }

  private assertUsable(invitation: { status: string; expiresAt: Date }) {
    if (invitation.status === 'ACCEPTED')
      throw fail(
        409,
        'INVITATION_ALREADY_ACCEPTED',
        'Invitation was already accepted',
      );
    if (invitation.status === 'REVOKED')
      throw fail(409, 'INVITATION_REVOKED', 'Invitation was revoked');
    if (invitation.expiresAt <= new Date())
      throw fail(410, 'INVITATION_EXPIRED', 'Invitation has expired');
  }

  async lookup(token: string) {
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { tokenHash: digest(token) },
      select: {
        email: true,
        type: true,
        status: true,
        expiresAt: true,
        intendedRole: true,
        residencyType: true,
        estate: { select: { id: true, name: true } },
        unit: { select: { id: true, code: true, name: true } },
      },
    });
    if (!invitation)
      throw fail(404, 'INVITATION_NOT_FOUND', 'Invitation not found');
    this.assertUsable(invitation);
    const user = await this.prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });
    return {
      type: invitation.type,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      estate: invitation.estate,
      ...(invitation.type === 'RESIDENT'
        ? { unit: invitation.unit, residencyType: invitation.residencyType }
        : { role: invitation.intendedRole }),
      existingUser: !!user,
    };
  }

  async accept(token: string, userId?: string, details?: AcceptInvitationDto) {
    const passwordHash = details
      ? await hash(details.password, { type: argon2id })
      : undefined;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<
          { id: string }[]
        >`SELECT "id" FROM "UserInvitation" WHERE "tokenHash" = ${digest(token)} FOR UPDATE`;
        if (!locked.length)
          throw fail(404, 'INVITATION_NOT_FOUND', 'Invitation not found');
        const invitation = await tx.userInvitation.findUniqueOrThrow({
          where: { id: locked[0].id },
        });
        this.assertUsable(invitation);
        const existing = await tx.user.findUnique({
          where: { email: invitation.email },
          select: { id: true },
        });
        if (existing) {
          if (!userId)
            throw new UnauthorizedException(
              'Sign in to accept this invitation',
            );
          if (userId !== existing.id)
            throw fail(
              403,
              'INVITATION_EMAIL_MISMATCH',
              'Invitation belongs to another account',
            );
          if (details)
            throw fail(
              400,
              'ACCOUNT_ALREADY_EXISTS',
              'Existing users accept without account details',
            );
        } else {
          if (userId)
            throw fail(
              403,
              'INVITATION_EMAIL_MISMATCH',
              'Invitation belongs to another account',
            );
          if (!details || !passwordHash)
            throw fail(
              400,
              'ACCOUNT_DETAILS_REQUIRED',
              'Name and password are required',
            );
        }
        if (await this.relationshipExists(tx, invitation.email, invitation))
          throw fail(
            409,
            'RELATIONSHIP_ALREADY_EXISTS',
            'This relationship already exists',
          );
        const user =
          existing ??
          (await tx.user.create({
            data: {
              email: invitation.email,
              firstName: details!.firstName,
              lastName: details!.lastName,
              passwordHash: passwordHash!,
            },
            select: { id: true },
          }));
        if (invitation.type === 'RESIDENT') {
          await tx.residency.create({
            data: {
              userId: user.id,
              unitId: invitation.unitId!,
              type: invitation.residencyType!,
              status: 'ACTIVE',
            },
          });
        } else {
          await tx.staffAssignment.create({
            data: {
              userId: user.id,
              estateId: invitation.estateId,
              role: invitation.intendedRole!,
              status: 'ACTIVE',
            },
          });
        }
        await tx.userInvitation.update({
          where: { id: invitation.id },
          data: { status: 'ACCEPTED', acceptedAt: new Date() },
        });
        return {
          invitationId: invitation.id,
          status: 'ACCEPTED',
          userId: user.id,
          type: invitation.type,
        };
      });
    } catch (error) {
      if (isUnique(error))
        throw fail(
          409,
          'ACCOUNT_ALREADY_EXISTS',
          'Account already exists; sign in and retry',
        );
      throw error;
    }
  }

  async revoke(context: AuthorizationContext, invitationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "UserInvitation" WHERE "id" = ${invitationId} AND "estateId" = ${context.estateId!} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException();
      const invitation = await tx.userInvitation.findUniqueOrThrow({
        where: { id: invitationId },
      });
      if (
        invitation.type === 'RESIDENT' &&
        !context.roles.some((role) =>
          ['ESTATE_MANAGER', 'ORG_ADMIN', 'ORG_OWNER'].includes(role),
        )
      )
        throw fail(
          403,
          'INVITATION_REVOKE_FORBIDDEN',
          'You cannot revoke this invitation',
        );
      if (
        invitation.type === 'STAFF' &&
        !this.canAssign(context, invitation.intendedRole!)
      )
        throw fail(
          403,
          'INVITATION_REVOKE_FORBIDDEN',
          'You cannot revoke this invitation',
        );
      if (invitation.status !== 'PENDING')
        throw new ConflictException('Only pending invitations can be revoked');
      return tx.userInvitation.update({
        where: { id: invitationId },
        data: { status: 'REVOKED', revokedAt: new Date() },
        select: { id: true, status: true, revokedAt: true },
      });
    });
  }

  async list(context: AuthorizationContext) {
    const invitations = await this.prisma.userInvitation.findMany({
      where: {
        estateId: context.estateId!,
        organizationId: context.organizationId,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        type: true,
        intendedRole: true,
        unit: { select: { id: true, name: true, code: true } },
        residencyType: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        acceptedAt: true,
        revokedAt: true,
      },
    });
    return invitations.map((invitation) => ({
      ...invitation,
      effectiveStatus:
        invitation.status === 'PENDING' && invitation.expiresAt <= new Date()
          ? 'EXPIRED'
          : invitation.status,
    }));
  }
}
