/*
  Warnings:

  - You are about to drop the column `nii` on the `Supplier` table. All the data in the column will be lost.
  - Added the required column `nit` to the `Supplier` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Supplier" DROP COLUMN "nii",
ADD COLUMN     "nit" TEXT NOT NULL;
