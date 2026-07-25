-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "costOfGoods" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "SaleProductInvoice" ADD COLUMN     "remainingQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DeliveryConsumption" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "saleProductInvoiceId" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unitPriceAtConsumption" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryConsumption_deliveryId_idx" ON "DeliveryConsumption"("deliveryId");

-- CreateIndex
CREATE INDEX "DeliveryConsumption_saleProductInvoiceId_idx" ON "DeliveryConsumption"("saleProductInvoiceId");

-- AddForeignKey
ALTER TABLE "DeliveryConsumption" ADD CONSTRAINT "DeliveryConsumption_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryConsumption" ADD CONSTRAINT "DeliveryConsumption_saleProductInvoiceId_fkey" FOREIGN KEY ("saleProductInvoiceId") REFERENCES "SaleProductInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reset: arrancar el sistema de lotes FIFO limpio, como fue confirmado.
-- Los kilos existentes no tienen lote/costo asociado, así que se descartan.
UPDATE "SaleProductInvoice" SET "remainingQuantity" = 0;

UPDATE "Company" SET
  "coffeeQuantity" = 0,
  "wetCoffeeQuantity" = 0,
  "beanQuantity" = 0,
  "pasillaQuantity" = 0,
  "cacaoQuantity" = 0;

UPDATE "Product" SET "stock" = 0
WHERE LOWER("name") LIKE '%cafe%'
   OR LOWER("name") LIKE '%café%'
   OR LOWER("name") LIKE '%frijol%'
   OR LOWER("name") LIKE '%almendra%'
   OR LOWER("name") LIKE '%bean%'
   OR LOWER("name") LIKE '%pasilla%'
   OR LOWER("name") LIKE '%cacao%';
