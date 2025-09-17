const purchaseProductInvoiceController = require('../controllers/PurchaseProductInvoiceController');
const express = require('express');
const { authenticateJWT } = require('../middlewares/auth');
const {requireRole} = require('../middlewares/requireRole');
const { assignTenant } = require('../middlewares/assignTenant');
const router = express.Router();

router.post("/", authenticateJWT, assignTenant, purchaseProductInvoiceController.createPurchaseProductInvoice);
router.get("/", authenticateJWT, purchaseProductInvoiceController.getPurchaseProductInvoices);
router.get("/:id", authenticateJWT, purchaseProductInvoiceController.getPurchaseProductInvoiceById);
router.patch("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), purchaseProductInvoiceController.updatePurchaseProductInvoice);
router.delete("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), purchaseProductInvoiceController.deletePurchaseProductInvoice);

module.exports = router;