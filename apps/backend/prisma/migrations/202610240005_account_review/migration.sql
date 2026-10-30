-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMPTZ(3),
ADD COLUMN     "reviewRequiredAt" TIMESTAMPTZ(3);
