BEGIN;
ALTER TABLE "AccessPass" ADD COLUMN "token" TEXT;
-- PostgreSQL's cryptographically random UUIDs backfill legacy passes without
-- deriving credentials from IDs or requiring the pgcrypto extension.
UPDATE "AccessPass"
SET "token" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
ALTER TABLE "AccessPass" ALTER COLUMN "token" SET NOT NULL;
CREATE UNIQUE INDEX "AccessPass_token_key" ON "AccessPass"("token");
COMMIT;
