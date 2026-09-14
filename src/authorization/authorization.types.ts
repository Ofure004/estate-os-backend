import type {
  OrganizationRole,
  StaffRole,
  ResidencyType,
} from '../generated/prisma/enums.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';

// Prefix organization roles so a resident OWNER cannot become an organization owner.
export type AuthorizationRole =
  `ORG_${OrganizationRole}` | StaffRole | 'RESIDENT';
export type ResourceKind =
  | 'unit'
  | 'gate'
  | 'visitorInvitation'
  | 'accessPass'
  | 'accessEvent'
  | 'residency'
  | 'staffAssignment'
  | 'cluster';
export interface AuthorizationPolicy {
  scope: 'organization' | 'estate';
  roles: readonly AuthorizationRole[];
  organizationParam?: string;
  estateParam?: string;
  resource?: { kind: ResourceKind; param: string };
}
export interface AuthorizationContext {
  userId: string;
  organizationId: string;
  estateId?: string;
  roles: AuthorizationRole[];
  membership: { id: string; role: OrganizationRole } | null;
  staffAssignments: { id: string; role: StaffRole }[];
  residencies: { id: string; unitId: string; type: ResidencyType }[];
}
export interface AuthorizedRequest extends AuthenticatedRequest {
  authorization: AuthorizationContext;
}
