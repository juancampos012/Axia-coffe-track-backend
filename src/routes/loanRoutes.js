const loanController = require('../controllers/loanController');
const express = require('express');
const { authenticateJWT } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/requireRole');
const { assignTenant } = require('../middlewares/assignTenant');
const router = express.Router();

// ==================== RUTAS CRUD ====================
router.post("/", authenticateJWT, assignTenant, loanController.createLoan);
router.get("/", authenticateJWT, assignTenant, loanController.getAllLoans); // Añadí assignTenant

// RUTAS MÁS ESPECÍFICAS PRIMERO
router.get("/pending", authenticateJWT, assignTenant, loanController.getPendingLoans); // Añadí assignTenant
router.get("/statistics", authenticateJWT, assignTenant, loanController.getLoansStatistics); // Añadí assignTenant
router.get("/report", authenticateJWT, assignTenant, loanController.generateLoansReport); // Añadí assignTenant
router.get("/client/:clientId", authenticateJWT, assignTenant, loanController.getLoansByClient);
router.get("/:id/receipt", authenticateJWT, loanController.generateLoanReceipt);

router.patch("/:id/status", authenticateJWT, loanController.updateLoanStatus);
router.post("/:id/return", authenticateJWT, loanController.markLoanAsReturned);

router.get("/:id", authenticateJWT, assignTenant, loanController.getLoanById); // Añadí assignTenant para filtrar por empresa
router.delete("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), loanController.deleteLoan);

module.exports = router;