-- DropForeignKey
ALTER TABLE "SaleProductInvoice" DROP CONSTRAINT "SaleProductInvoice_invoiceId_fkey";

-- AlterTable
ALTER TABLE "SaleInvoice" ALTER COLUMN "paymentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SaleProductInvoice" ALTER COLUMN "invoiceId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "SaleProductInvoice" ADD CONSTRAINT "SaleProductInvoice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SaleInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
