-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleInvoice" ALTER COLUMN "electronicBill" SET DEFAULT false;

-- AlterTable
ALTER TABLE "SaleProductInvoice" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SupplierDeposit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierDeposit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SupplierDeposit" ADD CONSTRAINT "SupplierDeposit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDeposit" ADD CONSTRAINT "SupplierDeposit_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
