-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "productId" TEXT;

-- CreateIndex
CREATE INDEX "Announcement_productId_idx" ON "Announcement"("productId");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
