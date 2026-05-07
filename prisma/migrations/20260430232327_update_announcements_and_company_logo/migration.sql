/*
  Warnings:

  - You are about to alter the column `currentBalance` on the `Company` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `amount` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `amount` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `purchasePrice` on the `Product` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `stock` on the `Product` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `salePrice` on the `Product` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `tax` on the `Product` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(5,2)`.
  - You are about to alter the column `totalPrice` on the `PurchaseInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to drop the column `paymentId` on the `SaleInvoice` table. All the data in the column will be lost.
  - You are about to alter the column `totalPrice` on the `SaleInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `quantity` on the `SaleProductInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `unitPrice` on the `SaleProductInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `amount` on the `SupplierDeposit` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `amount` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `previousBalance` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `newBalance` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - A unique constraint covering the columns `[tenantId,identification]` on the table `Client` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PartnerPaymentType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'PAYMENT', 'ADJUSTMENT', 'LOAN');

-- CreateEnum
CREATE TYPE "PackagingMovementType" AS ENUM ('DELIVERED_TO_PARTNER', 'RETURNED_BY_PARTNER', 'ADJUSTMENT');

-- DropIndex
DROP INDEX "Client_email_key";

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "secondLastName" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "beanQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cacaoQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "coffeeQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "pasillaQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "wetCoffeeQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
ALTER COLUMN "currentBalance" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Loan" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "purchasePrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "stock" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "salePrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "tax" SET DATA TYPE DECIMAL(5,2);

-- AlterTable
ALTER TABLE "PurchaseInvoice" ALTER COLUMN "totalPrice" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "PurchaseProductInvoice" ADD COLUMN     "announcementId" TEXT,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "SaleInvoice" DROP COLUMN "paymentId",
ALTER COLUMN "totalPrice" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "SaleProductInvoice" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "SupplierDeposit" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "previousBalance" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "newBalance" SET DATA TYPE DECIMAL(18,2);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "totalQuantity" DECIMAL(18,2) NOT NULL,
    "remantQuantity" DECIMAL(18,2) NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identification" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPaymentItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" "PartnerPaymentType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerPaymentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPackagingMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" "PackagingMovementType" NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerPackagingMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "pendingAmount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerAccountPayment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerAccountPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_tenantId_idx" ON "Announcement"("tenantId");

-- CreateIndex
CREATE INDEX "Announcement_clientId_idx" ON "Announcement"("clientId");

-- CreateIndex
CREATE INDEX "Partner_tenantId_idx" ON "Partner"("tenantId");

-- CreateIndex
CREATE INDEX "Partner_name_idx" ON "Partner"("name");

-- CreateIndex
CREATE INDEX "PartnerPaymentItem_tenantId_idx" ON "PartnerPaymentItem"("tenantId");

-- CreateIndex
CREATE INDEX "PartnerPaymentItem_partnerId_idx" ON "PartnerPaymentItem"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerPaymentItem_type_idx" ON "PartnerPaymentItem"("type");

-- CreateIndex
CREATE INDEX "PartnerPaymentItem_createdAt_idx" ON "PartnerPaymentItem"("createdAt");

-- CreateIndex
CREATE INDEX "PartnerPackagingMovement_tenantId_idx" ON "PartnerPackagingMovement"("tenantId");

-- CreateIndex
CREATE INDEX "PartnerPackagingMovement_partnerId_idx" ON "PartnerPackagingMovement"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerPackagingMovement_createdAt_idx" ON "PartnerPackagingMovement"("createdAt");

-- CreateIndex
CREATE INDEX "PartnerAccount_tenantId_idx" ON "PartnerAccount"("tenantId");

-- CreateIndex
CREATE INDEX "PartnerAccount_partnerId_idx" ON "PartnerAccount"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerAccount_isPaid_idx" ON "PartnerAccount"("isPaid");

-- CreateIndex
CREATE INDEX "PartnerAccountPayment_accountId_idx" ON "PartnerAccountPayment"("accountId");

-- CreateIndex
CREATE INDEX "PartnerAccountPayment_tenantId_idx" ON "PartnerAccountPayment"("tenantId");

-- CreateIndex
CREATE INDEX "Client_tenantId_idx" ON "Client"("tenantId");

-- CreateIndex
CREATE INDEX "Client_identification_idx" ON "Client"("identification");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_identification_key" ON "Client"("tenantId", "identification");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");

-- CreateIndex
CREATE INDEX "SaleInvoice_tenantId_idx" ON "SaleInvoice"("tenantId");

-- CreateIndex
CREATE INDEX "SaleInvoice_clientId_idx" ON "SaleInvoice"("clientId");

-- CreateIndex
CREATE INDEX "SaleProductInvoice_tenantId_idx" ON "SaleProductInvoice"("tenantId");

-- CreateIndex
CREATE INDEX "SaleProductInvoice_productId_idx" ON "SaleProductInvoice"("productId");

-- CreateIndex
CREATE INDEX "SaleProductInvoice_invoiceId_idx" ON "SaleProductInvoice"("invoiceId");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPaymentItem" ADD CONSTRAINT "PartnerPaymentItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPaymentItem" ADD CONSTRAINT "PartnerPaymentItem_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPackagingMovement" ADD CONSTRAINT "PartnerPackagingMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPackagingMovement" ADD CONSTRAINT "PartnerPackagingMovement_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseProductInvoice" ADD CONSTRAINT "PurchaseProductInvoice_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAccount" ADD CONSTRAINT "PartnerAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAccount" ADD CONSTRAINT "PartnerAccount_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAccountPayment" ADD CONSTRAINT "PartnerAccountPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PartnerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAccountPayment" ADD CONSTRAINT "PartnerAccountPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
