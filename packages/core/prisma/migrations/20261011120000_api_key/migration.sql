-- CreateTable
CREATE TABLE "Apikey" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT,
    "start" TEXT,
    "referenceId" TEXT NOT NULL,
    "prefix" TEXT,
    "key" TEXT NOT NULL,
    "refillInterval" INTEGER,
    "refillAmount" INTEGER,
    "lastRefillAt" TIMESTAMP(3),
    "enabled" BOOLEAN DEFAULT true,
    "rateLimitEnabled" BOOLEAN DEFAULT true,
    "rateLimitTimeWindow" INTEGER DEFAULT 86400000,
    "rateLimitMax" INTEGER DEFAULT 10,
    "requestCount" INTEGER DEFAULT 0,
    "remaining" INTEGER,
    "lastRequest" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "permissions" TEXT,
    "metadata" TEXT,

    CONSTRAINT "Apikey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Apikey_configId_idx" ON "Apikey"("configId");

-- CreateIndex
CREATE INDEX "Apikey_referenceId_idx" ON "Apikey"("referenceId");

-- CreateIndex
CREATE INDEX "Apikey_key_idx" ON "Apikey"("key");

-- AddForeignKey
ALTER TABLE "Apikey" ADD CONSTRAINT "Apikey_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

