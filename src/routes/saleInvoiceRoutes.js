const saleInvoiceController = require('../controllers/SaleInvoiceController');
const express = require('express');
const { authenticateJWT } = require('../middlewares/auth');
const {requireRole} = require('../middlewares/requireRole');
const { assignTenant } = require('../middlewares/assignTenant');
const router = express.Router();

router.post("/", authenticateJWT, assignTenant, saleInvoiceController.createSaleInvoice);
router.get("/", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), saleInvoiceController.getSaleInvoices);
router.get('/searchByDateRange', authenticateJWT, saleInvoiceController.searchInvoicesByDateRange);
router.get('/search', authenticateJWT, saleInvoiceController.searchInvoicesByClient);
router.get("/:id", authenticateJWT, saleInvoiceController.getSaleInvoiceById);
router.patch("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), saleInvoiceController.updateSaleInvoice);
router.delete("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), saleInvoiceController.deleteSaleInvoice);

router.get('/:id/pdf', saleInvoiceController.getSaleInvoicePDF);

// Rutas públicas (para generación estática)
router.get("/public/list", saleInvoiceController.getPublicSaleInvoices);

module.exports = router;