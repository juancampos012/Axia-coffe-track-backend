-- DropForeignKey
ALTER TABLE "PurchaseProductInvoice" DROP CONSTRAINT "PurchaseProductInvoice_purchaseInvoiceId_fkey";

-- AddForeignKey
ALTER TABLE "PurchaseProductInvoice" ADD CONSTRAINT "PurchaseProductInvoice_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
