const saleProductInvoiceController = require('../controllers/SaleProductInvoiceController');
const express = require('express');
const { authenticateJWT } = require('../middlewares/auth');
const {requireRole} = require('../middlewares/requireRole');
const { assignTenant } = require('../middlewares/assignTenant');
const router = express.Router();

router.post("/", authenticateJWT, assignTenant, saleProductInvoiceController.createSaleProductInvoice);
router.get("/", authenticateJWT, saleProductInvoiceController.getSaleProductInvoices);
router.get("/:id", authenticateJWT, saleProductInvoiceController.getSaleProductInvoiceById);
router.patch("/:id", authenticateJWT, saleProductInvoiceController.updateSaleProductInvoice);
router.delete("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), saleProductInvoiceController.deleteSaleProductInvoice);

module.exports = router;