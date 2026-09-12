BEGIN;

INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES ('seed_org_estate_os', 'Estate OS Demo', 'estate-os-demo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "slug" = EXCLUDED."slug",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "User" ("id", "email", "firstName", "lastName", "phone", "createdAt", "updatedAt")
VALUES
  ('seed_user_owner', 'owner@example.com', 'Ada', 'Okafor', '+2348000000001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_user_manager', 'manager@example.com', 'Tunde', 'Adebayo', '+2348000000002', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_user_tenant', 'tenant@example.com', 'Amaka', 'Eze', '+2348000000003', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "email" = EXCLUDED."email",
  "firstName" = EXCLUDED."firstName",
  "lastName" = EXCLUDED."lastName",
  "phone" = EXCLUDED."phone",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "OrganizationMembership" (
  "id", "userId", "organizationId", "role", "status", "createdAt", "updatedAt"
)
VALUES
  ('seed_membership_owner', 'seed_user_owner', 'seed_org_estate_os', 'OWNER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_membership_manager', 'seed_user_manager', 'seed_org_estate_os', 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "role" = EXCLUDED."role",
  "status" = EXCLUDED."status",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Cluster" ("id", "organizationId", "name", "slug", "createdAt", "updatedAt")
VALUES ('seed_cluster_lagos', 'seed_org_estate_os', 'Lagos Cluster', 'lagos', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "slug" = EXCLUDED."slug",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Estate" ("id", "organizationId", "clusterId", "name", "slug", "createdAt", "updatedAt")
VALUES ('seed_estate_palm_view', 'seed_org_estate_os', 'seed_cluster_lagos', 'Palm View Estate', 'palm-view', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "slug" = EXCLUDED."slug",
  "clusterId" = EXCLUDED."clusterId",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Unit" ("id", "estateId", "name", "code", "type", "status", "createdAt", "updatedAt")
VALUES
  ('seed_unit_a01', 'seed_estate_palm_view', 'House A01', 'A01', 'DUPLEX', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_unit_a02', 'seed_estate_palm_view', 'House A02', 'A02', 'HOUSE', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_unit_b01', 'seed_estate_palm_view', 'Flat B01', 'B01', 'FLAT', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "code" = EXCLUDED."code",
  "type" = EXCLUDED."type",
  "status" = EXCLUDED."status",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Gate" ("id", "estateId", "name", "code", "status", "createdAt", "updatedAt")
VALUES
  ('seed_gate_main', 'seed_estate_palm_view', 'Main Gate', 'MAIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_gate_service', 'seed_estate_palm_view', 'Service Gate', 'SERVICE', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "code" = EXCLUDED."code",
  "status" = EXCLUDED."status",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Residency" (
  "id", "userId", "unitId", "type", "status", "startedAt", "createdAt", "updatedAt"
)
VALUES
  ('seed_residency_owner', 'seed_user_owner', 'seed_unit_a01', 'OWNER', 'ACTIVE', '2026-01-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_residency_tenant', 'seed_user_tenant', 'seed_unit_b01', 'TENANT', 'ACTIVE', '2026-06-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "unitId" = EXCLUDED."unitId",
  "type" = EXCLUDED."type",
  "status" = EXCLUDED."status",
  "startedAt" = EXCLUDED."startedAt",
  "endedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "StaffAssignment" (
  "id", "userId", "estateId", "role", "status", "startedAt", "createdAt", "updatedAt"
)
VALUES (
  'seed_staff_manager', 'seed_user_manager', 'seed_estate_palm_view', 'ESTATE_MANAGER', 'ACTIVE', '2026-01-01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "role" = EXCLUDED."role",
  "status" = EXCLUDED."status",
  "startedAt" = EXCLUDED."startedAt",
  "endedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
