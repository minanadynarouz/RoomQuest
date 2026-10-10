-- LevelCache.metadata holds { relaxed: RelaxedRule[] }.
-- SessionResult.relaxed stores the optional ResultRequest.relaxed array.

ALTER TABLE "LevelCache" ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "SessionResult" ADD COLUMN "relaxed" JSONB;
