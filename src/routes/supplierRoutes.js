const supplierController = require('../controllers/SupplierController');
const express = require('express');
const { authenticateJWT } = require('../middlewares/auth');
const {requireRole} = require('../middlewares/requireRole');
const { assignTenant } = require('../middlewares/assignTenant');
const router = express.Router();

router.get('/search', authenticateJWT,  supplierController.getSuppliersByName);
router.post("/", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), assignTenant, supplierController.createSupplier);
router.get("/", authenticateJWT,  supplierController.getSuppliers);
router.get("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), supplierController.getSupplierById);
router.patch("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), supplierController.updateSupplier);
router.delete("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), supplierController.deleteSupplier);

module.exports = router;