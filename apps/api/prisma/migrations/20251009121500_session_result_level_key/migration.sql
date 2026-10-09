-- SessionResult: keep a non-null posted key, make the LevelCache FK optional
-- so proc:<seed>:<tier> results can be stored without a cache row.

ALTER TABLE "SessionResult" ADD COLUMN "levelKey" TEXT;

UPDATE "SessionResult" SET "levelKey" = "cacheKey" WHERE "levelKey" IS NULL;

ALTER TABLE "SessionResult" ALTER COLUMN "levelKey" SET NOT NULL;

ALTER TABLE "SessionResult" ALTER COLUMN "cacheKey" DROP NOT NULL;

CREATE INDEX "SessionResult_levelKey_idx" ON "SessionResult"("levelKey");
