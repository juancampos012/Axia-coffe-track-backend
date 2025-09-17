/*
  Warnings:

  - A unique constraint covering the columns `[invoiceId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `invoiceId` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paymentId` to the `SaleInvoice` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "invoiceId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SaleInvoice" ADD COLUMN     "paymentId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_invoiceId_key" ON "Payment"("invoiceId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SaleInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
