/*
  Warnings:

  - You are about to drop the column `averagePrice` on the `Product` table. All the data in the column will be lost.
  - Added the required column `salePrice` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tax` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Product" DROP COLUMN "averagePrice",
ADD COLUMN     "salePrice" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "tax" DOUBLE PRECISION NOT NULL;
