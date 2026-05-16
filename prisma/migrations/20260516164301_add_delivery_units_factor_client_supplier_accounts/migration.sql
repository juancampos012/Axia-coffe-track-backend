/*
  Warnings:

  - Added the required column `quantity` to the `Delivery` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: add columns with temporary defaults for existing rows
ALTER TABLE "Delivery"
  ADD COLUMN "pricePerUnit" DECIMAL(18,2),
  ADD COLUMN "quantity"     DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "totalPrice"   DECIMAL(18,2),
  ADD COLUMN "unit"         TEXT          NOT NULL DEFAULT 'kg',
  ALTER COLUMN "productKg" DROP NOT NULL;

-- Backfill: set quantity = productKg for all existing rows
UPDATE "Delivery" SET "quantity" = "productKg" WHERE "productKg" IS NOT NULL;

-- Remove the temporary default so future INSERTs must supply quantity explicitly
ALTER TABLE "Delivery" ALTER COLUMN "quantity" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PurchaseInvoice" ADD COLUMN     "factor" DECIMAL(10,4);

-- AlterTable
ALTER TABLE "PurchaseProductInvoice" ADD COLUMN     "basePrice" DECIMAL(18,2),
ADD COLUMN     "factor" DECIMAL(10,4),
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "unitPrice" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "ClientAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "pendingAmount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAccountPayment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAccountPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "pendingAmount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierAccountPayment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierAccountPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientAccount_tenantId_idx" ON "ClientAccount"("tenantId");

-- CreateIndex
CREATE INDEX "ClientAccount_clientId_idx" ON "ClientAccount"("clientId");

-- CreateIndex
CREATE INDEX "ClientAccount_isPaid_idx" ON "ClientAccount"("isPaid");

-- CreateIndex
CREATE INDEX "ClientAccountPayment_accountId_idx" ON "ClientAccountPayment"("accountId");

-- CreateIndex
CREATE INDEX "ClientAccountPayment_tenantId_idx" ON "ClientAccountPayment"("tenantId");

-- CreateIndex
CREATE INDEX "SupplierAccount_tenantId_idx" ON "SupplierAccount"("tenantId");

-- CreateIndex
CREATE INDEX "SupplierAccount_supplierId_idx" ON "SupplierAccount"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierAccount_isPaid_idx" ON "SupplierAccount"("isPaid");

-- CreateIndex
CREATE INDEX "SupplierAccountPayment_accountId_idx" ON "SupplierAccountPayment"("accountId");

-- CreateIndex
CREATE INDEX "SupplierAccountPayment_tenantId_idx" ON "SupplierAccountPayment"("tenantId");

-- AddForeignKey
ALTER TABLE "ClientAccount" ADD CONSTRAINT "ClientAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAccount" ADD CONSTRAINT "ClientAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAccountPayment" ADD CONSTRAINT "ClientAccountPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ClientAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAccountPayment" ADD CONSTRAINT "ClientAccountPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAccount" ADD CONSTRAINT "SupplierAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAccount" ADD CONSTRAINT "SupplierAccount_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAccountPayment" ADD CONSTRAINT "SupplierAccountPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SupplierAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAccountPayment" ADD CONSTRAINT "SupplierAccountPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
