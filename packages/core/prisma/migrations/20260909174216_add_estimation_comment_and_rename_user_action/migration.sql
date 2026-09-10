/*
  Warnings:

  - You are about to drop the column `myReaction` on the `EstimatedVacancy` table. All the data in the column will be lost.
  - You are about to drop the column `reactionUpdatedAt` on the `EstimatedVacancy` table. All the data in the column will be lost.
  - Added the required column `estimationComment` to the `EstimatedVacancy` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserAction" AS ENUM ('NOT_REVIEWED', 'READY_TO_APPLY', 'APPLIED', 'DECLINED');

-- DropIndex
DROP INDEX "EstimatedVacancy_myReaction_idx";

-- AlterTable
ALTER TABLE "EstimatedVacancy" DROP COLUMN "myReaction",
DROP COLUMN "reactionUpdatedAt",
ADD COLUMN     "estimationComment" TEXT NOT NULL,
ADD COLUMN     "userAction" "UserAction" NOT NULL DEFAULT 'NOT_REVIEWED',
ADD COLUMN     "userActionUpdatedAt" TIMESTAMP(3);

-- DropEnum
DROP TYPE "MyReaction";

-- CreateIndex
CREATE INDEX "EstimatedVacancy_userAction_idx" ON "EstimatedVacancy"("userAction");
