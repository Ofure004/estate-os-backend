import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { StaffVisitorsQueryDto } from './dto/staff-visitors-query.dto.js';

type VisitorRow = {
  invitationId: string;
  visitorFirstName: string;
  visitorLastName: string;
  unitId: string;
  unitName: string;
  unitCode: string;
  purpose: string | null;
  validFrom: Date;
  validUntil: Date;
  status: 'expected' | 'onsite' | 'departed';
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
};

@Injectable()
export class StaffVisitorsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}

  async find(
    currentUserId: string,
    estateId: string,
    query: StaffVisitorsQueryDto,
  ) {
    await this.authorization.authorize(
      currentUserId,
      { estateId },
      {
        scope: 'estate',
        roles: ['ESTATE_MANAGER', 'SECURITY_SUPERVISOR', 'GUARD'],
      },
    );
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;
    if (!Number.isSafeInteger(skip) || skip > 2147483647)
      throw new BadRequestException(
        'Requested page exceeds the supported offset',
      );
    const now = new Date();
    // Resolve the latest movement BEFORE validating its estate, so inconsistent
    // history cannot resurrect an older check-in or turn a visit into expected.
    const rows = Prisma.sql`
      WITH classified AS (
        SELECT i."id" AS "invitationId", i."visitorFirstName", i."visitorLastName",
          u."id" AS "unitId", u."name" AS "unitName", u."code" AS "unitCode",
          i."purpose", i."validFrom", i."validUntil", i."createdAt",
          CASE
            WHEN latest."type" = 'CHECK_IN' THEN 'onsite'
            WHEN latest."type" = 'CHECK_OUT' THEN 'departed'
            WHEN latest."id" IS NULL AND i."status" IN ('PENDING', 'ACTIVE')
              AND p."status" = 'ACTIVE' AND p."revokedAt" IS NULL
              AND i."validUntil" > ${now} AND p."validUntil" > ${now}
              AND i."validFrom" < i."validUntil" AND p."validFrom" < p."validUntil"
              AND GREATEST(i."validFrom", p."validFrom") < LEAST(i."validUntil", p."validUntil")
              THEN 'expected'
          END AS "status",
          entered."createdAt" AS "checkedInAt",
          CASE WHEN latest."type" = 'CHECK_OUT' THEN latest."createdAt" END AS "checkedOutAt"
        FROM "VisitorInvitation" i
        JOIN "Residency" r ON r."id" = i."hostResidencyId"
        JOIN "Unit" u ON u."id" = r."unitId" AND u."estateId" = i."estateId"
        JOIN "AccessPass" p ON p."invitationId" = i."id"
        LEFT JOIN LATERAL (
          SELECT e."id", e."type", e."createdAt", e."estateId", e."gateId"
          FROM "AccessEvent" e WHERE e."passId" = p."id" AND e."type" IN ('CHECK_IN', 'CHECK_OUT')
          ORDER BY e."createdAt" DESC, e."id" DESC LIMIT 1
        ) latest ON true
        LEFT JOIN LATERAL (
          SELECT e."createdAt" FROM "AccessEvent" e
          JOIN "Gate" g ON g."id" = e."gateId" AND g."estateId" = i."estateId"
          WHERE e."passId" = p."id" AND e."type" = 'CHECK_IN' AND e."estateId" = i."estateId"
          ORDER BY e."createdAt" DESC, e."id" DESC LIMIT 1
        ) entered ON true
        WHERE i."estateId" = ${estateId}
          AND (latest."id" IS NULL OR (latest."estateId" = i."estateId" AND EXISTS (
            SELECT 1 FROM "Gate" g WHERE g."id" = latest."gateId" AND g."estateId" = i."estateId"
          )))
      ), filtered AS (
        SELECT * FROM classified WHERE "status" IS NOT NULL
          ${status ? Prisma.sql`AND "status" = ${status}` : Prisma.empty}
      )`;
    return this.prisma.$transaction(
      async (tx) => {
        const [count] = await tx.$queryRaw<
          { total: bigint }[]
        >`${rows} SELECT COUNT(*) AS "total" FROM filtered`;
        const visitors = await tx.$queryRaw<VisitorRow[]>`${rows}
        SELECT "invitationId", "visitorFirstName", "visitorLastName", "unitId", "unitName", "unitCode",
          "purpose", "validFrom", "validUntil", "status", "checkedInAt", "checkedOutAt"
        FROM filtered ORDER BY "createdAt" DESC, "invitationId" DESC LIMIT ${limit} OFFSET ${skip}`;
        const total = Number(count.total);
        return {
          data: visitors.map((row) => ({
            invitationId: row.invitationId,
            visitor: {
              firstName: row.visitorFirstName,
              lastName: row.visitorLastName,
            },
            hostUnit: {
              id: row.unitId,
              name: row.unitName,
              code: row.unitCode,
            },
            purpose: row.purpose,
            validFrom: row.validFrom,
            validUntil: row.validUntil,
            status: row.status,
            checkedInAt: row.checkedInAt,
            checkedOutAt: row.checkedOutAt,
          })),
          meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
