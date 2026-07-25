-- Folio correlativo para SaleInvoice (1, 2, 3...), asignado por Postgres vía secuencia
ALTER TABLE "SaleInvoice" ADD COLUMN "folio" SERIAL;
ALTER TABLE "SaleInvoice" ADD CONSTRAINT "SaleInvoice_folio_key" UNIQUE ("folio");
