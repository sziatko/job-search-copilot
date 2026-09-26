-- CreateTable
CREATE TABLE "VacancyLogEntry" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url" TEXT,
    "company" TEXT,
    "title" TEXT,
    "companyKey" TEXT,
    "titleKey" TEXT,

    CONSTRAINT "VacancyLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VacancyLogEntry_url_key" ON "VacancyLogEntry"("url");

-- CreateIndex
CREATE INDEX "VacancyLogEntry_companyKey_titleKey_idx" ON "VacancyLogEntry"("companyKey", "titleKey");
