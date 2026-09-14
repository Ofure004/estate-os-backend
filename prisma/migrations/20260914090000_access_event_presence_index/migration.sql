CREATE INDEX "AccessEvent_passId_createdAt_id_idx" ON "AccessEvent"("passId", "createdAt", "id");
DROP INDEX "AccessEvent_passId_idx";
