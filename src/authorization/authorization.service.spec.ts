import { AuthorizationService } from './authorization.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type {
  AuthorizationContext,
  ResourceKind,
} from './authorization.types.js';

const context: AuthorizationContext = {
  userId: 'resident',
  organizationId: 'org-a',
  estateId: 'estate-a',
  roles: ['RESIDENT'],
  membership: null,
  staffAssignments: [],
  residencies: [],
};

describe('Resource scope queries', () => {
  it.each<ResourceKind>([
    'unit',
    'gate',
    'visitorInvitation',
    'accessEvent',
    'staffAssignment',
    'accessPass',
    'residency',
  ])('constrains %s to both estate and organization', async (kind) => {
    let returnedId: string | null = 'resource-id';
    const findFirst = vi.fn(async () =>
      returnedId ? { id: returnedId } : null,
    );
    const service = new AuthorizationService({
      [kind]: { findFirst },
    } as unknown as PrismaService);
    await service.assertResource(context, kind, 'resource-id');
    const estate = { organizationId: 'org-a', id: 'estate-a' };
    const relation =
      kind === 'accessPass'
        ? { invitation: { estate } }
        : kind === 'residency'
          ? { unit: { estate } }
          : { estate };
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'resource-id', ...relation },
      select: { id: true },
    });
    returnedId = null;
    await expect(
      service.assertResource(context, kind, 'resource-id'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows cluster checks only at organization scope', async () => {
    const findFirst = vi.fn(async () => ({ id: 'cluster-a' }));
    const service = new AuthorizationService({
      cluster: { findFirst },
    } as unknown as PrismaService);
    await expect(
      service.assertResource(context, 'cluster', 'cluster-a'),
    ).rejects.toMatchObject({ status: 403 });
    expect(findFirst).not.toHaveBeenCalled();
    await service.assertResource(
      { ...context, estateId: undefined, roles: ['ORG_ADMIN'] },
      'cluster',
      'cluster-a',
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'cluster-a', organizationId: 'org-a' },
      select: { id: true },
    });
  });
});
