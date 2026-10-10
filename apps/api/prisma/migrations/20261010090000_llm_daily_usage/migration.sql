-- CreateTable
CREATE TABLE "LlmDailyUsage" (
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "LlmDailyUsage_pkey" PRIMARY KEY ("day")
);
