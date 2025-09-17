const supplierDepositController = require('../controllers/SupplierDepositController');
const express = require('express');
const { authenticateJWT } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/requireRole');
const { assignTenant } = require('../middlewares/assignTenant');
const router = express.Router();

// Crear un nuevo depósito
router.post(
  "/",
  authenticateJWT,
  requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'),
  assignTenant,
  supplierDepositController.createSupplierDeposit
);

// Obtener todos los depósitos del tenant
router.get(
  "/",
  authenticateJWT,
  requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'),
  supplierDepositController.getAllSupplierDeposits
);

// Obtener un depósito específico
router.get(
  "/:id",
  authenticateJWT,
  requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'),
  supplierDepositController.getSupplierDepositById
);

// Actualizar un depósito
router.patch(
  "/:id",
  authenticateJWT,
  requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'),
  supplierDepositController.updateSupplierDeposit
);

// Eliminar un depósito
router.delete(
  "/:id",
  authenticateJWT,
  requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'),
  supplierDepositController.deleteSupplierDeposit
);

module.exports = router;
