-- CreateEnum
CREATE TYPE "Sector" AS ENUM ('RETAIL', 'TECHNOLOGY', 'FOOD', 'HEALTH');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "sector" "Sector" NOT NULL DEFAULT 'FOOD';
