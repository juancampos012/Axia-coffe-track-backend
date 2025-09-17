const purchaseInvoiceController = require('../controllers/PurchaseInvoiceController');
const express = require('express');
const { authenticateJWT } = require('../middlewares/auth');
const {requireRole} = require('../middlewares/requireRole');
const { assignTenant } = require('../middlewares/assignTenant');
const router = express.Router();

router.post("/", authenticateJWT, assignTenant, purchaseInvoiceController.createPurchaseInvoice);
router.get("/", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), purchaseInvoiceController.getPurchaseInvoices);
router.get("/:id", authenticateJWT, purchaseInvoiceController.getPurchaseInvoiceById);
router.patch("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), purchaseInvoiceController.updatePurchaseInvoice);
router.delete("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), purchaseInvoiceController.deletePurchaseInvoice);

// Rutas públicas (para generación estática)
router.get("/public/list", purchaseInvoiceController.getPublicPurchaseInvoices);

module.exports = router;