-- AlterTable
ALTER TABLE "SaleProductInvoice" ADD COLUMN     "announcementId" TEXT;

-- AddForeignKey
ALTER TABLE "SaleProductInvoice" ADD CONSTRAINT "SaleProductInvoice_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
