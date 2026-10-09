-- CreateTable
CREATE TABLE "LevelCache" (
    "key" TEXT NOT NULL,
    "roomHash" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LevelCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SessionResult" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "gems" INTEGER NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL,
    "planSource" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionResult_cacheKey_idx" ON "SessionResult"("cacheKey");

-- AddForeignKey
ALTER TABLE "SessionResult" ADD CONSTRAINT "SessionResult_cacheKey_fkey" FOREIGN KEY ("cacheKey") REFERENCES "LevelCache"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
