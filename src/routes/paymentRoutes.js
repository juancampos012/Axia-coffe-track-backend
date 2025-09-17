const paymentController = require('../controllers/PaymentController');
const express = require('express');
const { authenticateJWT } = require('../middlewares/auth')
const {requireRole} = require('../middlewares/requireRole')
const { assignTenant } = require('../middlewares/assignTenant');
const router = express.Router();

router.post("/", authenticateJWT, assignTenant, paymentController.createPayment);
router.get("/", authenticateJWT, paymentController.getPayments);
router.get("/:id", authenticateJWT, paymentController.getPaymentById);
router.patch("/:id", authenticateJWT, paymentController.updatePayment);
router.delete("/:id", authenticateJWT, requireRole('ADMIN', 'EDITOR', 'SUPERADMIN'), paymentController.deletePayment);

module.exports = router;